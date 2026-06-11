import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// ── GET /api/anormalidades/mejoras ───────────────────────────────────────────
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'ver'),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, estado } = req.query
      const offset = (parseInt(page) - 1) * parseInt(limit)

      let where = 'WHERE m.tenant_id = $1'
      const params = [req.tenantId]
      let p = 2
      if (estado) { where += ` AND m.estado = $${p++}`; params.push(estado) }

      const [countRes, rowsRes] = await Promise.all([
        req.tQuery(`SELECT COUNT(*) FROM anormalidades_mejoras m ${where}`, params),
        req.tQuery(
          `SELECT m.*,
                  u.nombre_completo AS responsable_nombre,
                  (SELECT COUNT(*) FROM anormalidades_mejoras_vinculos v WHERE v.mejora_id = m.id) AS total_vinculos
           FROM anormalidades_mejoras m
           LEFT JOIN usuarios u ON m.responsable_id = u.id
           ${where}
           ORDER BY m.created_at DESC
           LIMIT $${p} OFFSET $${p + 1}`,
          [...params, parseInt(limit), offset]
        ),
      ])

      res.json({
        success: true,
        data: rowsRes.rows,
        total: parseInt(countRes.rows[0].count),
      })
    } catch (err) {
      console.error('[anorm.mejoras.list]', err.message)
      res.status(500).json({ error: 'Error al obtener mejoras' })
    }
  }
)

// ── GET /api/anormalidades/mejoras/:id ───────────────────────────────────────
router.get('/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'ver'),
  async (req, res) => {
    try {
      const [mRes, vinculosRes] = await Promise.all([
        req.tQuery(
          `SELECT m.*, u.nombre_completo AS responsable_nombre
           FROM anormalidades_mejoras m
           LEFT JOIN usuarios u ON m.responsable_id = u.id
           WHERE m.id = $1 AND m.tenant_id = $2`,
          [req.params.id, req.tenantId]
        ),
        req.tQuery(
          `SELECT v.anormalidad_id, a.folio, a.nombre, a.nivel, a.estado, a.fecha_ocurrencia
           FROM anormalidades_mejoras_vinculos v
           JOIN anormalidades a ON v.anormalidad_id = a.id
           WHERE v.mejora_id = $1 AND v.tenant_id = $2
           ORDER BY a.fecha_ocurrencia DESC`,
          [req.params.id, req.tenantId]
        ),
      ])

      if (!mRes.rows.length) return res.status(404).json({ error: 'No encontrada' })

      res.json({ success: true, data: { ...mRes.rows[0], anormalidades_vinculadas: vinculosRes.rows } })
    } catch (err) {
      console.error('[anorm.mejoras.get]', err.message)
      res.status(500).json({ error: 'Error' })
    }
  }
)

// ── POST /api/anormalidades/mejoras ──────────────────────────────────────────
router.post('/',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'actualizar'),
  async (req, res) => {
    try {
      const {
        descripcion_problema, ocurrencias, causa_raiz_principal,
        accion_mejora, responsable_id, fecha_limite,
        anormalidad_ids,
      } = req.body

      if (!descripcion_problema || !accion_mejora)
        return res.status(400).json({ error: 'descripcion_problema y accion_mejora requeridos' })

      const result = await req.tQuery(
        `INSERT INTO anormalidades_mejoras
           (tenant_id, descripcion_problema, ocurrencias, causa_raiz_principal,
            accion_mejora, responsable_id, fecha_limite, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          req.tenantId, descripcion_problema, ocurrencias || 1,
          causa_raiz_principal || null, accion_mejora,
          responsable_id || null, fecha_limite || null, req.userId,
        ]
      )

      const mejora = result.rows[0]

      if (Array.isArray(anormalidad_ids) && anormalidad_ids.length > 0) {
        for (const aid of anormalidad_ids) {
          await req.tQuery(
            `INSERT INTO anormalidades_mejoras_vinculos (mejora_id, anormalidad_id, tenant_id)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [mejora.id, aid, req.tenantId]
          )
        }
      }

      res.status(201).json({ success: true, data: mejora })
    } catch (err) {
      console.error('[anorm.mejoras.create]', err.message)
      res.status(500).json({ error: 'Error al crear mejora' })
    }
  }
)

// ── PUT /api/anormalidades/mejoras/:id ───────────────────────────────────────
router.put('/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'actualizar'),
  async (req, res) => {
    try {
      const existing = await req.tQuery(
        'SELECT id FROM anormalidades_mejoras WHERE id = $1 AND tenant_id = $2',
        [req.params.id, req.tenantId]
      )
      if (!existing.rows.length) return res.status(404).json({ error: 'No encontrada' })

      const {
        descripcion_problema, ocurrencias, causa_raiz_principal,
        accion_mejora, responsable_id, fecha_limite, estado, resultado_revision,
      } = req.body

      const result = await req.tQuery(
        `UPDATE anormalidades_mejoras SET
           descripcion_problema  = COALESCE($3, descripcion_problema),
           ocurrencias           = COALESCE($4, ocurrencias),
           causa_raiz_principal  = COALESCE($5, causa_raiz_principal),
           accion_mejora         = COALESCE($6, accion_mejora),
           responsable_id        = COALESCE($7, responsable_id),
           fecha_limite          = COALESCE($8, fecha_limite),
           estado                = COALESCE($9, estado),
           resultado_revision    = COALESCE($10, resultado_revision),
           updated_at            = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [
          req.params.id, req.tenantId,
          descripcion_problema || null, ocurrencias || null,
          causa_raiz_principal || null, accion_mejora || null,
          responsable_id || null, fecha_limite || null,
          estado || null, resultado_revision || null,
        ]
      )

      res.json({ success: true, data: result.rows[0] })
    } catch (err) {
      console.error('[anorm.mejoras.update]', err.message)
      res.status(500).json({ error: 'Error al actualizar mejora' })
    }
  }
)

// ── POST /api/anormalidades/mejoras/:id/vincular ─────────────────────────────
router.post('/:id/vincular',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'actualizar'),
  async (req, res) => {
    try {
      const { anormalidad_id } = req.body
      if (!anormalidad_id) return res.status(400).json({ error: 'anormalidad_id requerido' })

      await req.tQuery(
        `INSERT INTO anormalidades_mejoras_vinculos (mejora_id, anormalidad_id, tenant_id)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [req.params.id, anormalidad_id, req.tenantId]
      )

      res.json({ success: true })
    } catch (err) {
      console.error('[anorm.mejoras.vincular]', err.message)
      res.status(500).json({ error: 'Error al vincular' })
    }
  }
)

// ── DELETE /api/anormalidades/mejoras/:id/vincular/:anorm_id ─────────────────
router.delete('/:id/vincular/:anorm_id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'actualizar'),
  async (req, res) => {
    try {
      await req.tQuery(
        `DELETE FROM anormalidades_mejoras_vinculos
         WHERE mejora_id = $1 AND anormalidad_id = $2 AND tenant_id = $3`,
        [req.params.id, req.params.anorm_id, req.tenantId]
      )
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: 'Error al desvincular' })
    }
  }
)

export default router
