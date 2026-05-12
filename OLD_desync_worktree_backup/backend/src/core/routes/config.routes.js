import { Router } from 'express'
import { query } from '../../config/database.js'
import { authenticateToken, loadFullUser } from '../../shared/middleware/auth.js'
import { requirePermission } from '../../shared/middleware/permissions.js'

const router = Router()

// GET /api/config/:modulo/:tipo
router.get('/:modulo/:tipo',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'ver'),
  async (req, res) => {
    try {
      const { modulo, tipo } = req.params
      const activeOnly = req.query.active !== 'false'

      let sql = 'SELECT * FROM configuraciones WHERE modulo = $1 AND tipo = $2'
      const params = [modulo, tipo]

      if (activeOnly) {
        sql += ' AND activo = true'
      }

      sql += ' ORDER BY nombre'
      const result = await query(sql, params)
      res.json({ items: result.rows })
    } catch (error) {
      console.error('Get config error:', error)
      res.status(500).json({ error: 'Error obteniendo configuraciones' })
    }
  }
)

// POST /api/config
router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'crear'),
  async (req, res) => {
    try {
      const { modulo, tipo, codigo, nombre, descripcion, config_json } = req.body

      if (!modulo || !tipo || !codigo || !nombre) {
        return res.status(400).json({ error: 'Campos requeridos: modulo, tipo, codigo, nombre' })
      }

      const result = await query(
        `INSERT INTO configuraciones (modulo, tipo, codigo, nombre, descripcion, config_json)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [modulo, tipo, codigo.toUpperCase(), nombre, descripcion, config_json ? JSON.stringify(config_json) : null]
      )

      res.status(201).json({ item: result.rows[0] })
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'La configuración ya existe' })
      }
      console.error('Create config error:', error)
      res.status(500).json({ error: 'Error creando configuración' })
    }
  }
)

// PUT /api/config/:id
router.put('/:id',
  authenticateToken, loadFullUser,
  requirePermission('global.administracion', 'editar'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { nombre, descripcion, activo, config_json } = req.body

      const result = await query(
        `UPDATE configuraciones SET nombre = $1, descripcion = $2, activo = $3, config_json = $4
         WHERE id = $5 RETURNING *`,
        [nombre, descripcion, activo, config_json ? JSON.stringify(config_json) : null, id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Configuración no encontrada' })
      }

      res.json({ item: result.rows[0] })
    } catch (error) {
      console.error('Update config error:', error)
      res.status(500).json({ error: 'Error actualizando configuración' })
    }
  }
)

export default router
