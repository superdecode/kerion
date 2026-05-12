import { Router } from 'express'
import { query } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// Helper: parse a configuraciones row into a clean empresa object
function toEmpresa(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    codigo: row.codigo,
    descripcion: row.descripcion,
    color: row.config_json?.color || '#6366f1',
    activo: row.activo,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// Helper: parse a configuraciones row into a clean canal object (including linked empresas)
function toCanal(row, empresasMap = {}) {
  const cfg = row.config_json || {}
  const linkedIds = cfg.empresa_ids || []
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    activo: row.activo,
    es_default: cfg.es_default || false,
    empresas: linkedIds.map(eid => empresasMap[eid]).filter(Boolean),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// ==================== EMPRESAS ====================

// GET /api/dropscan/config/empresas — accessible to all authenticated users
router.get('/empresas',
  authenticateToken,
  async (_req, res) => {
    try {
      const result = await query(
        `SELECT * FROM configuraciones
         WHERE modulo = 'dropscan' AND tipo = 'empresa'
         ORDER BY nombre ASC`
      )
      res.json(result.rows.map(toEmpresa))
    } catch (error) {
      console.error('Get empresas error:', error)
      res.status(500).json({ error: 'Error obteniendo empresas' })
    }
  }
)

// POST /api/dropscan/config/empresas
router.post('/empresas',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const { nombre, codigo, color, activo } = req.body

      if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })
      if (!codigo?.trim()) return res.status(400).json({ error: 'El código es requerido' })

      const colorVal = color || '#6366f1'
      if (!/^#[0-9A-Fa-f]{6}$/.test(colorVal)) {
        return res.status(400).json({ error: 'El color debe ser hexadecimal válido (ej: #FF0000)' })
      }

      const result = await query(
        `INSERT INTO configuraciones (modulo, tipo, codigo, nombre, activo, config_json)
         VALUES ('dropscan', 'empresa', $1, $2, $3, $4)
         RETURNING *`,
        [codigo.trim().toUpperCase(), nombre.trim(), activo !== false, JSON.stringify({ color: colorVal })]
      )
      res.status(201).json(toEmpresa(result.rows[0]))
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una empresa con ese código' })
      console.error('Create empresa error:', error)
      res.status(500).json({ error: 'Error creando empresa' })
    }
  }
)

// PUT /api/dropscan/config/empresas/:id
router.put('/empresas/:id',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const { nombre, codigo, color, activo } = req.body
      const { id } = req.params

      if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })
      if (!codigo?.trim()) return res.status(400).json({ error: 'El código es requerido' })

      const colorVal = color || '#6366f1'
      if (!/^#[0-9A-Fa-f]{6}$/.test(colorVal)) {
        return res.status(400).json({ error: 'El color debe ser hexadecimal válido (ej: #FF0000)' })
      }

      const result = await query(
        `UPDATE configuraciones
         SET nombre = $1, codigo = $2, activo = $3, config_json = $4, updated_at = NOW()
         WHERE id = $5 AND modulo = 'dropscan' AND tipo = 'empresa'
         RETURNING *`,
        [nombre.trim(), codigo.trim().toUpperCase(), activo !== false, JSON.stringify({ color: colorVal }), id]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' })
      res.json(toEmpresa(result.rows[0]))
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una empresa con ese código' })
      console.error('Update empresa error:', error)
      res.status(500).json({ error: 'Error actualizando empresa' })
    }
  }
)

// PATCH /api/dropscan/config/empresas/:id/toggle
router.patch('/empresas/:id/toggle',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const result = await query(
        `UPDATE configuraciones SET activo = NOT activo, updated_at = NOW()
         WHERE id = $1 AND modulo = 'dropscan' AND tipo = 'empresa'
         RETURNING *`,
        [req.params.id]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' })
      res.json(toEmpresa(result.rows[0]))
    } catch (error) {
      console.error('Toggle empresa error:', error)
      res.status(500).json({ error: 'Error cambiando estado' })
    }
  }
)

// DELETE /api/dropscan/config/empresas/:id
router.delete('/empresas/:id',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const inUse = await query('SELECT COUNT(*) FROM tarimas WHERE empresa_id = $1', [req.params.id])
      if (parseInt(inUse.rows[0].count) > 0) {
        return res.status(409).json({ error: 'No se puede eliminar: la empresa está siendo utilizada en tarimas' })
      }
      const result = await query(
        `DELETE FROM configuraciones WHERE id = $1 AND modulo = 'dropscan' AND tipo = 'empresa' RETURNING id`,
        [req.params.id]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa no encontrada' })
      res.json({ success: true })
    } catch (error) {
      console.error('Delete empresa error:', error)
      res.status(500).json({ error: 'Error eliminando empresa' })
    }
  }
)

// ==================== CANALES ====================

// GET /api/dropscan/config/canales — accessible to all authenticated users
router.get('/canales',
  authenticateToken,
  async (_req, res) => {
    try {
      const [canalesRes, empresasRes] = await Promise.all([
        query(`SELECT * FROM configuraciones WHERE modulo = 'dropscan' AND tipo = 'canal' ORDER BY nombre ASC`),
        query(`SELECT * FROM configuraciones WHERE modulo = 'dropscan' AND tipo = 'empresa' ORDER BY nombre ASC`)
      ])
      const empresasMap = Object.fromEntries(empresasRes.rows.map(e => [e.id, toEmpresa(e)]))
      res.json(canalesRes.rows.map(r => toCanal(r, empresasMap)))
    } catch (error) {
      console.error('Get canales error:', error)
      res.status(500).json({ error: 'Error obteniendo canales' })
    }
  }
)

// POST /api/dropscan/config/canales
router.post('/canales',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const { nombre, descripcion, activo, es_default, empresa_ids } = req.body

      if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })

      // Auto-generate codigo from nombre
      const codigo = 'CANAL-' + nombre.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '').slice(0, 20) + '-' + Date.now().toString().slice(-4)

      const configJson = {
        es_default: es_default || false,
        empresa_ids: empresa_ids || []
      }

      const result = await query(
        `INSERT INTO configuraciones (modulo, tipo, codigo, nombre, descripcion, activo, config_json)
         VALUES ('dropscan', 'canal', $1, $2, $3, $4, $5)
         RETURNING *`,
        [codigo, nombre.trim(), descripcion || null, activo !== false, JSON.stringify(configJson)]
      )

      // If setting as default, unset others
      if (es_default) {
        await query(
          `UPDATE configuraciones SET config_json = config_json || '{"es_default": false}'
           WHERE modulo = 'dropscan' AND tipo = 'canal' AND id != $1`,
          [result.rows[0].id]
        )
      }

      const empresasRes = await query(`SELECT * FROM configuraciones WHERE modulo = 'dropscan' AND tipo = 'empresa'`)
      const empresasMap = Object.fromEntries(empresasRes.rows.map(e => [e.id, toEmpresa(e)]))
      res.status(201).json(toCanal(result.rows[0], empresasMap))
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un canal con ese nombre' })
      console.error('Create canal error:', error)
      res.status(500).json({ error: 'Error creando canal' })
    }
  }
)

// PUT /api/dropscan/config/canales/:id
router.put('/canales/:id',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const { nombre, descripcion, activo, es_default, empresa_ids } = req.body
      const { id } = req.params

      if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })

      const configJson = {
        es_default: es_default || false,
        empresa_ids: empresa_ids || []
      }

      const result = await query(
        `UPDATE configuraciones
         SET nombre = $1, descripcion = $2, activo = $3, config_json = $4, updated_at = NOW()
         WHERE id = $5 AND modulo = 'dropscan' AND tipo = 'canal'
         RETURNING *`,
        [nombre.trim(), descripcion || null, activo !== false, JSON.stringify(configJson), id]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Canal no encontrado' })

      if (es_default) {
        await query(
          `UPDATE configuraciones SET config_json = config_json || '{"es_default": false}'
           WHERE modulo = 'dropscan' AND tipo = 'canal' AND id != $1`,
          [id]
        )
      }

      const empresasRes = await query(`SELECT * FROM configuraciones WHERE modulo = 'dropscan' AND tipo = 'empresa'`)
      const empresasMap = Object.fromEntries(empresasRes.rows.map(e => [e.id, toEmpresa(e)]))
      res.json(toCanal(result.rows[0], empresasMap))
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un canal con ese nombre' })
      console.error('Update canal error:', error)
      res.status(500).json({ error: 'Error actualizando canal' })
    }
  }
)

// PATCH /api/dropscan/config/canales/:id/toggle
router.patch('/canales/:id/toggle',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const result = await query(
        `UPDATE configuraciones SET activo = NOT activo, updated_at = NOW()
         WHERE id = $1 AND modulo = 'dropscan' AND tipo = 'canal'
         RETURNING *`,
        [req.params.id]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Canal no encontrado' })

      const empresasRes = await query(`SELECT * FROM configuraciones WHERE modulo = 'dropscan' AND tipo = 'empresa'`)
      const empresasMap = Object.fromEntries(empresasRes.rows.map(e => [e.id, toEmpresa(e)]))
      res.json(toCanal(result.rows[0], empresasMap))
    } catch (error) {
      console.error('Toggle canal error:', error)
      res.status(500).json({ error: 'Error cambiando estado' })
    }
  }
)

// DELETE /api/dropscan/config/canales/:id
router.delete('/canales/:id',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const inUse = await query('SELECT COUNT(*) FROM tarimas WHERE canal_id = $1', [req.params.id])
      if (parseInt(inUse.rows[0].count) > 0) {
        return res.status(409).json({ error: 'No se puede eliminar: el canal está siendo utilizado en tarimas' })
      }
      const result = await query(
        `DELETE FROM configuraciones WHERE id = $1 AND modulo = 'dropscan' AND tipo = 'canal' RETURNING id`,
        [req.params.id]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Canal no encontrado' })
      res.json({ success: true })
    } catch (error) {
      console.error('Delete canal error:', error)
      res.status(500).json({ error: 'Error eliminando canal' })
    }
  }
)

// ==================== PARAMETROS ====================

// GET /api/dropscan/config/parametros — accessible to all authenticated users
router.get('/parametros',
  authenticateToken,
  async (_req, res) => {
    try {
      const result = await query(
        `SELECT config_json FROM configuraciones
         WHERE modulo = 'dropscan' AND tipo = 'parametros' AND codigo = 'default'
         LIMIT 1`
      )
      if (result.rows.length === 0) {
        return res.json({ guias_por_tarima: 100 })
      }
      const cfg = result.rows[0].config_json || {}
      res.json({ guias_por_tarima: cfg.guias_por_tarima ?? 100 })
    } catch (error) {
      console.error('Get parametros error:', error)
      res.status(500).json({ error: 'Error obteniendo parametros' })
    }
  }
)

// PUT /api/dropscan/config/parametros
router.put('/parametros',
  authenticateToken, loadFullUser,
  requirePermission('dropscan.configuracion', 'editar'),
  async (req, res) => {
    try {
      const { guias_por_tarima } = req.body
      const gpt = parseInt(guias_por_tarima)
      if (!gpt || gpt < 1 || gpt > 9999) {
        return res.status(400).json({ error: 'guias_por_tarima debe ser entre 1 y 9999' })
      }
      await query(
        `INSERT INTO configuraciones (modulo, tipo, codigo, nombre, config_json)
         VALUES ('dropscan', 'parametros', 'default', 'Parametros', $1)
         ON CONFLICT (modulo, tipo, codigo) DO UPDATE
         SET config_json = $1, updated_at = NOW()`,
        [JSON.stringify({ guias_por_tarima: gpt })]
      )
      res.json({ guias_por_tarima: gpt })
    } catch (error) {
      console.error('Update parametros error:', error)
      res.status(500).json({ error: 'Error actualizando parametros' })
    }
  }
)

export default router
