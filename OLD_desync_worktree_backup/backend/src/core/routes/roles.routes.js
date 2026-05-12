import { Router } from 'express'
import { query } from '../../config/database.js'
import { authenticateToken, loadFullUser, auditLog } from '../../shared/middleware/auth.js'
import { requirePermission } from '../../shared/middleware/permissions.js'

const router = Router()

// GET /api/roles
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'ver'),
  async (req, res) => {
    try {
      const result = await query('SELECT * FROM roles WHERE activo = true ORDER BY id')
      res.json({ roles: result.rows })
    } catch (error) {
      console.error('Get roles error:', error)
      res.status(500).json({ error: 'Error obteniendo roles' })
    }
  }
)

// POST /api/roles
router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'crear'),
  async (req, res) => {
    try {
      const { nombre, descripcion, permisos } = req.body
      if (!nombre || !permisos) {
        return res.status(400).json({ error: 'Nombre y permisos son requeridos' })
      }

      const result = await query(
        `INSERT INTO roles (nombre, descripcion, permisos)
         VALUES ($1, $2, $3) RETURNING *`,
        [nombre, descripcion, JSON.stringify(permisos)]
      )

      const created = result.rows[0]
      auditLog(req, 'ROLE_CREATE', 'rol', created.id, { nombre: created.nombre })
      res.status(201).json({ rol: created })
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'El nombre de rol ya existe' })
      }
      console.error('Create role error:', error)
      res.status(500).json({ error: 'Error creando rol' })
    }
  }
)

// PUT /api/roles/:id
router.put('/:id',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { nombre, descripcion, permisos } = req.body

      const result = await query(
        `UPDATE roles SET nombre = $1, descripcion = $2, permisos = $3
         WHERE id = $4 RETURNING *`,
        [nombre, descripcion, JSON.stringify(permisos), id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Rol no encontrado' })
      }

      const updated = result.rows[0]
      auditLog(req, 'ROLE_UPDATE', 'rol', updated.id, { nombre: updated.nombre })
      res.json({ rol: updated })
    } catch (error) {
      console.error('Update role error:', error)
      res.status(500).json({ error: 'Error actualizando rol' })
    }
  }
)

// POST /api/roles/:id/duplicate
router.post('/:id/duplicate',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'crear'),
  async (req, res) => {
    try {
      const { id } = req.params
      const sourceRole = await query('SELECT * FROM roles WHERE id = $1', [id])
      if (sourceRole.rows.length === 0) return res.status(404).json({ error: 'Rol no encontrado' })
      const source = sourceRole.rows[0]
      const result = await query(
        `INSERT INTO roles (nombre, descripcion, permisos) VALUES ($1, $2, $3) RETURNING *`,
        [`${source.nombre} (copia)`, source.descripcion, JSON.stringify(source.permisos)]
      )
      const duplicated = result.rows[0]
      auditLog(req, 'ROLE_DUPLICATE', 'rol', duplicated.id, { source_id: parseInt(id), nombre: duplicated.nombre })
      res.status(201).json({ rol: duplicated })
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un rol con ese nombre' })
      console.error('Duplicate role error:', error)
      res.status(500).json({ error: 'Error duplicando rol' })
    }
  }
)

// DELETE /api/roles/:id (soft delete)
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'eliminar'),
  async (req, res) => {
    try {
      const { id } = req.params

      // Check no users assigned
      const usersRes = await query('SELECT COUNT(*) FROM usuarios WHERE rol_id = $1 AND estado = $2', [id, 'ACTIVO'])
      if (parseInt(usersRes.rows[0].count) > 0) {
        return res.status(409).json({ error: 'No se puede eliminar un rol con usuarios asignados' })
      }

      await query('UPDATE roles SET activo = false WHERE id = $1', [id])
      auditLog(req, 'ROLE_DELETE', 'rol', parseInt(id), null)
      res.json({ success: true, message: 'Rol eliminado' })
    } catch (error) {
      console.error('Delete role error:', error)
      res.status(500).json({ error: 'Error eliminando rol' })
    }
  }
)

export default router
