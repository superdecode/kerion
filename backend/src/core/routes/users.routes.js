import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { authenticateToken, loadFullUser, auditLog } from '../../shared/middleware/auth.js'
import { requirePermission } from '../../shared/middleware/permissions.js'

const router = Router()

// GET /api/users
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT u.id, u.codigo, u.nombre_completo, u.email, u.rol_id, u.estado,
                u.avatar_url, u.ultimo_acceso, u.created_at, u.is_default, u.es_admin_tenant,
                r.nombre as rol_nombre
         FROM usuarios u
         LEFT JOIN roles r ON u.rol_id = r.id
         WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
         ORDER BY u.created_at DESC`,
        [req.tenantId]
      )
      res.json({ usuarios: result.rows })
    } catch (error) {
      console.error('Get users error:', error)
      res.status(500).json({ error: 'Error obteniendo usuarios' })
    }
  }
)

// POST /api/users
router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'crear'),
  async (req, res) => {
    try {
      const { codigo, nombre_completo, email, password, rol_id, estado } = req.body

      if (!codigo || !nombre_completo || !email || !password) {
        return res.status(400).json({ error: 'Campos requeridos: codigo, nombre_completo, email, password' })
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
      }

      const passwordHash = await bcrypt.hash(password, 10)

      const result = await req.tQuery(
        `INSERT INTO usuarios (codigo, nombre_completo, email, password_hash, rol_id, estado, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, codigo, nombre_completo, email, rol_id, estado`,
        [codigo, nombre_completo, email.toLowerCase().trim(), passwordHash, rol_id || null, estado || 'ACTIVO', req.tenantId]
      )

      const created = result.rows[0]
      auditLog(req, 'USER_CREATE', 'usuario', created.id, { codigo: created.codigo, email: created.email, rol_id: created.rol_id })
      res.status(201).json({ usuario: created })
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'El código o email ya existe' })
      }
      console.error('Create user error:', error)
      res.status(500).json({ error: 'Error creando usuario' })
    }
  }
)

// GET /api/users/next-code
router.get('/next-code',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'crear'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM 3) AS INTEGER)), 0) + 1 AS next_num
         FROM usuarios
         WHERE tenant_id = $1
           AND codigo ~ '^US[0-9]+$'`,
        [req.tenantId]
      )
      const num = result.rows[0].next_num
      const code = `US${String(num).padStart(3, '0')}`
      res.json({ code })
    } catch (error) {
      console.error('Next user code error:', error)
      res.status(500).json({ error: 'Error generando código' })
    }
  }
)

// PUT /api/users/:id
router.put('/:id',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { nombre_completo, email, rol_id, estado, password } = req.body

      let updateQuery = `UPDATE usuarios SET nombre_completo = $1, email = $2, rol_id = $3, estado = $4`
      let params = [nombre_completo, email?.toLowerCase().trim(), rol_id, estado]

      if (password) {
        const passwordHash = await bcrypt.hash(password, 10)
        updateQuery += `, password_hash = $5, password_changed_at = CURRENT_TIMESTAMP WHERE id = $6 AND tenant_id = $7 AND deleted_at IS NULL RETURNING id, codigo, nombre_completo, email, rol_id, estado`
        params.push(passwordHash, id, req.tenantId)
      } else {
        updateQuery += ` WHERE id = $5 AND tenant_id = $6 AND deleted_at IS NULL RETURNING id, codigo, nombre_completo, email, rol_id, estado`
        params.push(id, req.tenantId)
      }

      const result = await req.tQuery(updateQuery, params)

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' })
      }

      const updated = result.rows[0]
      auditLog(req, 'USER_UPDATE', 'usuario', updated.id, { nombre: updated.nombre_completo, email: updated.email, rol_id: updated.rol_id, estado: updated.estado })
      res.json({ usuario: updated })
    } catch (error) {
      console.error('Update user error:', error)
      res.status(500).json({ error: 'Error actualizando usuario' })
    }
  }
)

// POST /api/users/:id/reset-password
router.post('/:id/reset-password',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { password } = req.body
      if (!password || password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
      }
      const passwordHash = await bcrypt.hash(password, 10)
      const result = await req.tQuery(
        'UPDATE usuarios SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL RETURNING id, nombre_completo',
        [passwordHash, id, req.tenantId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })
      auditLog(req, 'PASSWORD_RESET', 'usuario', parseInt(id), { target_user: result.rows[0].nombre_completo })
      res.json({ success: true, message: 'Contraseña actualizada' })
    } catch (error) {
      console.error('Reset password error:', error)
      res.status(500).json({ error: 'Error reseteando contraseña' })
    }
  }
)

// DELETE /api/users/:id — permanent delete.
// The row itself is never physically removed (dozens of tables FK to usuarios.id,
// some ON DELETE RESTRICT, e.g. guias, alertas_duplicados — a real DELETE would fail
// for any user with activity). Instead: snapshot the user into audit_log, mangle the
// email to free it up for reuse, and mark deleted_at so it disappears from the list.
// Reversible deactivation (estado=INACTIVO) is handled separately by PUT /:id.
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'eliminar'),
  async (req, res) => {
    try {
      const { id } = req.params

      if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' })
      }

      const targetRes = await req.tQuery(
        `SELECT u.id, u.codigo, u.nombre_completo, u.email, u.rol_id, u.estado, u.is_default, u.es_admin_tenant,
                r.nombre as rol_nombre
         FROM usuarios u
         LEFT JOIN roles r ON u.rol_id = r.id
         WHERE u.id = $1 AND u.tenant_id = $2 AND u.deleted_at IS NULL`,
        [id, req.tenantId]
      )
      if (targetRes.rows.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' })
      }
      const target = targetRes.rows[0]
      if (target.is_default || target.es_admin_tenant) {
        return res.status(409).json({ error: 'No se puede eliminar un usuario protegido' })
      }

      const tombstoneEmail = `deleted_${id}_${Date.now()}@removed.invalid`
      await req.tQuery(
        `UPDATE usuarios SET email = $1, estado = 'INACTIVO', deleted_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3`,
        [tombstoneEmail, id, req.tenantId]
      )
      auditLog(req, 'USER_DELETE', 'usuario', parseInt(id), {
        codigo: target.codigo,
        nombre_completo: target.nombre_completo,
        email: target.email,
        rol_id: target.rol_id,
        rol_nombre: target.rol_nombre,
        estado_previo: target.estado,
      })
      res.json({ success: true, message: 'Usuario eliminado. El correo queda disponible para un nuevo usuario.' })
    } catch (error) {
      console.error('Delete user error:', error)
      res.status(500).json({ error: 'Error eliminando usuario' })
    }
  }
)

export default router
