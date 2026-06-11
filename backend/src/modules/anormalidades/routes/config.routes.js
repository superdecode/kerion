import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// ── GET /api/anormalidades/config/codigos ────────────────────────────────────
router.get('/codigos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.registro', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT * FROM anormalidades_codigos
         WHERE tenant_id = $1
         ORDER BY proceso, codigo`,
        [req.tenantId]
      )
      res.json({ success: true, data: result.rows })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener códigos' })
    }
  }
)

// ── POST /api/anormalidades/config/codigos — crear código personalizado ───────
router.post('/codigos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'eliminar'),
  async (req, res) => {
    try {
      const { codigo, nombre_es, nombre_zh, proceso, nivel_sugerido, descripcion } = req.body
      if (!codigo || !nombre_es || !proceso)
        return res.status(400).json({ error: 'codigo, nombre_es y proceso son requeridos' })

      const result = await req.tQuery(
        `INSERT INTO anormalidades_codigos
           (tenant_id, codigo, nombre_es, nombre_zh, proceso, nivel_sugerido, descripcion, es_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,false)
         RETURNING *`,
        [req.tenantId, codigo.toUpperCase(), nombre_es, nombre_zh || '', proceso, nivel_sugerido || 'L2', descripcion || null]
      )
      res.status(201).json({ success: true, data: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Código ya existe' })
      res.status(500).json({ error: 'Error al crear código' })
    }
  }
)

// ── PUT /api/anormalidades/config/codigos/:id ────────────────────────────────
router.put('/codigos/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'eliminar'),
  async (req, res) => {
    try {
      const { nombre_es, nombre_zh, descripcion, activo, nivel_sugerido } = req.body

      const result = await req.tQuery(
        `UPDATE anormalidades_codigos SET
           nombre_es      = COALESCE($3, nombre_es),
           nombre_zh      = COALESCE($4, nombre_zh),
           descripcion    = COALESCE($5, descripcion),
           activo         = COALESCE($6, activo),
           nivel_sugerido = COALESCE($7, nivel_sugerido),
           updated_at     = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [req.params.id, req.tenantId,
         nombre_es || null, nombre_zh || null, descripcion || null,
         activo !== undefined ? activo : null, nivel_sugerido || null]
      )
      if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' })
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      res.status(500).json({ error: 'Error al actualizar código' })
    }
  }
)

// ── DELETE /api/anormalidades/config/codigos/:id — solo custom ───────────────
router.delete('/codigos/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'eliminar'),
  async (req, res) => {
    try {
      const existing = await req.tQuery(
        'SELECT es_default FROM anormalidades_codigos WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'No encontrado' })
      if (existing.rows[0].es_default)
        return res.status(403).json({ error: 'Los códigos base no pueden eliminarse' })

      await req.tQuery(
        'DELETE FROM anormalidades_codigos WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar código' })
    }
  }
)

// ── GET /api/anormalidades/config/tiempos ────────────────────────────────────
router.get('/tiempos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        'SELECT * FROM anormalidades_config WHERE tenant_id = $1',
        [req.tenantId]
      )
      res.json({
        success: true,
        data: result.rows[0] || { horas_limite_l1: 48, horas_limite_l2: 24, horas_limite_l3: 4 },
      })
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener configuración' })
    }
  }
)

// ── PUT /api/anormalidades/config/tiempos ────────────────────────────────────
router.put('/tiempos',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.configuracion', 'eliminar'),
  async (req, res) => {
    try {
      const { horas_limite_l1, horas_limite_l2, horas_limite_l3 } = req.body
      const result = await req.tQuery(
        `INSERT INTO anormalidades_config (tenant_id, horas_limite_l1, horas_limite_l2, horas_limite_l3)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (tenant_id) DO UPDATE SET
           horas_limite_l1 = EXCLUDED.horas_limite_l1,
           horas_limite_l2 = EXCLUDED.horas_limite_l2,
           horas_limite_l3 = EXCLUDED.horas_limite_l3,
           updated_at = now()
         RETURNING *`,
        [req.tenantId, horas_limite_l1 || 48, horas_limite_l2 || 24, horas_limite_l3 || 4]
      )
      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      res.status(500).json({ error: 'Error al actualizar tiempos' })
    }
  }
)

export default router
