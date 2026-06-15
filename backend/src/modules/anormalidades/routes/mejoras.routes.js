import { Router } from 'express'
import { authenticateToken, loadFullUser, auditLog } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

function coerceRangeStart(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${value}T00:00:00.000`
  return value
}

function coerceRangeEnd(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return `${value}T23:59:59.999`
  return value
}

// ── GET /api/anormalidades/mejoras ───────────────────────────────────────────
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'ver'),
  async (req, res) => {
    try {
      const {
        page = 1, limit = 20,
        estado, search, vencidas,
        responsable_id, fecha_desde, fecha_hasta,
        vinculadas, sin_vinculos, proceso, origen,
      } = req.query
      const offset = (parseInt(page) - 1) * parseInt(limit)

      let where = 'WHERE m.tenant_id = $1'
      const params = [req.tenantId]
      let p = 2
      if (estado) { where += ` AND m.estado = $${p++}`; params.push(estado) }
      if (search) {
        where += ` AND (
          m.descripcion_problema ILIKE $${p}
          OR m.accion_mejora ILIKE $${p}
          OR COALESCE(m.causa_raiz_principal, '') ILIKE $${p}
          OR COALESCE(u.nombre_completo, '') ILIKE $${p}
        )`
        params.push(`%${search}%`)
        p++
      }
      if (responsable_id) {
        const vals = String(responsable_id).split(',').filter(Boolean)
        if (vals.length === 1) { where += ` AND m.responsable_id = $${p++}`; params.push(vals[0]) }
        else if (vals.length > 1) { where += ` AND m.responsable_id = ANY($${p++}::int[])`; params.push(vals.map(Number).filter(Number.isFinite)) }
      }
      if (proceso) {
        const vals = String(proceso).split(',').filter(Boolean)
        if (vals.length === 1) { where += ` AND m.proceso = $${p++}`; params.push(vals[0]) }
        else if (vals.length > 1) { where += ` AND m.proceso = ANY($${p++})`; params.push(vals) }
      }
      if (origen) {
        const vals = String(origen).split(',').filter(Boolean)
        if (vals.length === 1) { where += ` AND m.origen = $${p++}`; params.push(vals[0]) }
        else if (vals.length > 1) { where += ` AND m.origen = ANY($${p++})`; params.push(vals) }
      }
      if (fecha_desde) { where += ` AND m.created_at >= $${p++}`; params.push(coerceRangeStart(fecha_desde)) }
      if (fecha_hasta) { where += ` AND m.created_at <= $${p++}`; params.push(coerceRangeEnd(fecha_hasta)) }
      if (String(vencidas) === 'true') where += ` AND m.estado != 'cerrado' AND m.fecha_limite IS NOT NULL AND m.fecha_limite < CURRENT_DATE`
      if (String(vinculadas) === 'true') where += ` AND EXISTS (SELECT 1 FROM anormalidades_mejoras_vinculos v WHERE v.mejora_id = m.id AND v.tenant_id = m.tenant_id)`
      if (String(sin_vinculos) === 'true') where += ` AND NOT EXISTS (SELECT 1 FROM anormalidades_mejoras_vinculos v WHERE v.mejora_id = m.id AND v.tenant_id = m.tenant_id)`

      const [countRes, rowsRes, resumenRes] = await Promise.all([
        req.tQuery(
          `SELECT COUNT(*)
           FROM anormalidades_mejoras m
           LEFT JOIN usuarios u ON m.responsable_id = u.id
           ${where}`,
          params
        ),
        req.tQuery(
          `SELECT m.*,
                  u.nombre_completo AS responsable_nombre,
                  (SELECT COUNT(*) FROM anormalidades_mejoras_vinculos v WHERE v.mejora_id = m.id) AS total_vinculos,
                  CASE WHEN m.estado != 'cerrado' AND m.fecha_limite IS NOT NULL AND m.fecha_limite < CURRENT_DATE THEN true ELSE false END AS vencida
           FROM anormalidades_mejoras m
           LEFT JOIN usuarios u ON m.responsable_id = u.id
           ${where}
           ORDER BY m.created_at DESC
           LIMIT $${p} OFFSET $${p + 1}`,
          [...params, parseInt(limit), offset]
        ),
        req.tQuery(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE m.estado = 'nuevo') AS nuevas,
             COUNT(*) FILTER (WHERE m.estado = 'en_proceso') AS en_proceso,
             COUNT(*) FILTER (WHERE m.estado = 'cerrado') AS cerradas,
             COUNT(*) FILTER (WHERE m.estado != 'cerrado' AND m.fecha_limite IS NOT NULL AND m.fecha_limite < CURRENT_DATE) AS vencidas
           FROM anormalidades_mejoras m
           LEFT JOIN usuarios u ON m.responsable_id = u.id
           ${where}`,
          params
        ),
      ])

      res.json({
        success: true,
        data: rowsRes.rows,
        total: parseInt(countRes.rows[0].count),
        resumen: {
          total: parseInt(resumenRes.rows[0].total || 0),
          nuevas: parseInt(resumenRes.rows[0].nuevas || 0),
          en_proceso: parseInt(resumenRes.rows[0].en_proceso || 0),
          cerradas: parseInt(resumenRes.rows[0].cerradas || 0),
          vencidas: parseInt(resumenRes.rows[0].vencidas || 0),
        },
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
        anormalidad_ids, proceso, origen,
      } = req.body

      if (!descripcion_problema || !accion_mejora || !proceso)
        return res.status(400).json({ error: 'descripcion_problema, accion_mejora y proceso requeridos' })

      const result = await req.tQuery(
        `INSERT INTO anormalidades_mejoras
           (tenant_id, descripcion_problema, ocurrencias, causa_raiz_principal,
            accion_mejora, responsable_id, fecha_limite, proceso, origen, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          req.tenantId, descripcion_problema, ocurrencias || 1,
          causa_raiz_principal || null, accion_mejora,
          responsable_id || null, fecha_limite || null,
          proceso, origen || null, req.user.id,
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
        proceso, origen,
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
           proceso               = COALESCE($11, proceso),
           origen                = COALESCE($12, origen),
           updated_at            = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [
          req.params.id, req.tenantId,
          descripcion_problema || null, ocurrencias || null,
          causa_raiz_principal || null, accion_mejora || null,
          responsable_id || null, fecha_limite || null,
          estado || null, resultado_revision || null,
          proceso || null, origen || null,
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

      const [mejoraRes, anormRes] = await Promise.all([
        req.tQuery(
          'SELECT id FROM anormalidades_mejoras WHERE id = $1 AND tenant_id = $2',
          [req.params.id, req.tenantId]
        ),
        req.tQuery(
          'SELECT id FROM anormalidades WHERE id = $1 AND tenant_id = $2',
          [anormalidad_id, req.tenantId]
        ),
      ])
      if (!mejoraRes.rows.length) return res.status(404).json({ error: 'Mejora no encontrada' })
      if (!anormRes.rows.length) return res.status(404).json({ error: 'Anormalidad no encontrada' })

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

// ── DELETE /api/anormalidades/mejoras/:id ────────────────────────────────────
router.delete('/:id',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'eliminar'),
  async (req, res) => {
    try {
      await req.tQuery(
        `DELETE FROM anormalidades_mejoras_vinculos WHERE mejora_id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      const result = await req.tQuery(
        `DELETE FROM anormalidades_mejoras WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [req.params.id, req.tenantId]
      )
      if (!result.rows.length) return res.status(404).json({ error: 'No encontrada' })
      res.json({ success: true })
    } catch (err) {
      console.error('[anorm.mejoras.delete]', err.message)
      res.status(500).json({ error: 'Error al eliminar mejora' })
    }
  }
)

// ── GET /api/anormalidades/mejoras/candidatas/recurrentes ───────────────────
router.get('/candidatas/recurrentes',
  authenticateToken, loadFullUser,
  requirePermission('anormalidades.mejoras', 'ver'),
  async (req, res) => {
    try {
      const { dias = 30, min_ocurrencias = 3 } = req.query
      const result = await req.tQuery(
        `SELECT
           a.codigo,
           a.nombre,
           a.proceso,
           COUNT(*) AS ocurrencias,
           MAX(a.fecha_ocurrencia) AS ultima_ocurrencia,
           COUNT(*) FILTER (
             WHERE NOT EXISTS (
               SELECT 1
               FROM anormalidades_mejoras_vinculos v
               WHERE v.anormalidad_id = a.id AND v.tenant_id = a.tenant_id
             )
           ) AS sin_mejora
         FROM anormalidades a
         WHERE a.tenant_id = $1
           AND a.fecha_ocurrencia >= now() - ($2::int || ' days')::interval
         GROUP BY a.codigo, a.nombre, a.proceso
         HAVING COUNT(*) >= $3
         ORDER BY ocurrencias DESC, ultima_ocurrencia DESC
         LIMIT 10`,
        [req.tenantId, dias, min_ocurrencias]
      )

      res.json({ success: true, data: result.rows })
    } catch (err) {
      console.error('[anorm.mejoras.candidatas]', err.message)
      res.status(500).json({ error: 'Error al obtener candidatas' })
    }
  }
)

export default router
