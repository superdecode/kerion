import { Router } from 'express'
import bcrypt from 'bcrypt'
import { query } from '../../config/database.js'
import { authenticateToken, loadFullUser } from '../../shared/middleware/auth.js'
import { requirePermission } from '../../shared/middleware/permissions.js'

const router = Router()

// GET /api/users
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'ver'),
  async (req, res) => {
    try {
      const result = await query(
        `SELECT u.id, u.codigo, u.nombre_completo, u.email, u.rol_id, u.estado,
                u.avatar_url, u.ultimo_acceso, u.created_at,
                r.nombre as rol_nombre
         FROM usuarios u
         LEFT JOIN roles r ON u.rol_id = r.id
         ORDER BY u.created_at DESC`
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

      const passwordHash = await bcrypt.hash(password, 10)

      const result = await query(
        `INSERT INTO usuarios (codigo, nombre_completo, email, password_hash, rol_id, estado)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, codigo, nombre_completo, email, rol_id, estado`,
        [codigo, nombre_completo, email.toLowerCase().trim(), passwordHash, rol_id || null, estado || 'ACTIVO']
      )

      res.status(201).json({ usuario: result.rows[0] })
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'El código o email ya existe' })
      }
      console.error('Create user error:', error)
      res.status(500).json({ error: 'Error creando usuario' })
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
        updateQuery += `, password_hash = $5 WHERE id = $6 RETURNING id, codigo, nombre_completo, email, rol_id, estado`
        params.push(passwordHash, id)
      } else {
        updateQuery += ` WHERE id = $5 RETURNING id, codigo, nombre_completo, email, rol_id, estado`
        params.push(id)
      }

      const result = await query(updateQuery, params)

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' })
      }

      res.json({ usuario: result.rows[0] })
    } catch (error) {
      console.error('Update user error:', error)
      res.status(500).json({ error: 'Error actualizando usuario' })
    }
  }
)

// DELETE /api/users/:id (soft delete - set INACTIVO)
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'eliminar'),
  async (req, res) => {
    try {
      const { id } = req.params

      if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'No puedes desactivar tu propio usuario' })
      }

      await query(`UPDATE usuarios SET estado = 'INACTIVO' WHERE id = $1`, [id])
      res.json({ success: true, message: 'Usuario desactivado' })
    } catch (error) {
      console.error('Delete user error:', error)
      res.status(500).json({ error: 'Error desactivando usuario' })
    }
  }
)

export default router
