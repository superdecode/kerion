import { Router } from 'express'
import { UUID_RE } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { validateCommitPayload, commitBatch } from '../services/pickBatchService.js'

const router = Router()

// POST /api/wmshub/pick-batch/commit — confirma una validación por lote entera.
// Hasta esta llamada el lote solo existe en el borrador local del operador.
router.post('/commit',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'crear'),
  async (req, res) => {
    try {
      const validation = validateCommitPayload(req.body)
      if (!validation.ok) return res.status(400).json({ success: false, error: validation.error })
      const data = await commitBatch(req, req.body)
      res.status(201).json({ success: true, data })
    } catch (err) {
      console.error('POST wmshub/pick-batch/commit error:', err.message)
      res.status(500).json({ success: false, error: 'Error confirmando el lote de validación' })
    }
  }
)

router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'ver'),
  async (req, res) => {
    try {
      const { page = 1, pageSize = 20, fecha_inicio, fecha_fin } = req.query
      const limit = Math.min(parseInt(pageSize) || 20, 200)
      const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit
      const conditions = ['b.tenant_id = $1']
      const params = [req.tenantId]
      let p = 2
      if (fecha_inicio) { conditions.push(`b.fecha_lote >= $${p++}`); params.push(fecha_inicio) }
      if (fecha_fin)    { conditions.push(`b.fecha_lote <= $${p++}`); params.push(fecha_fin) }

      const result = await req.tQuery(
        `SELECT b.*, u.nombre_completo AS operator_nombre,
                COUNT(*) OVER()::int AS total_rows
         FROM pick_batches b
         LEFT JOIN usuarios u ON u.id = b.operator_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY b.fecha_lote DESC, b.created_at DESC
         LIMIT $${p++} OFFSET $${p}`,
        [...params, limit, offset]
      )
      res.json({
        success: true,
        data: result.rows,
        meta: { total: result.rows[0]?.total_rows ?? 0, page: Number(page), limit },
      })
    } catch (err) {
      console.error('GET wmshub/pick-batch error:', err.message)
      res.status(500).json({ success: false, error: 'Error listando lotes' })
    }
  }
)

router.get('/:id',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'ver'),
  async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) {
        return res.status(400).json({ success: false, error: 'ID de lote inválido' })
      }
      const batch = await req.tQuery(
        `SELECT b.*, u.nombre_completo AS operator_nombre
         FROM pick_batches b LEFT JOIN usuarios u ON u.id = b.operator_id
         WHERE b.id = $1 AND b.tenant_id = $2`,
        [req.params.id, req.tenantId]
      )
      if (batch.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Lote no encontrado' })
      }

      const tarimas = await req.tQuery(
        `SELECT * FROM pick_batch_tarimas WHERE batch_id = $1 AND tenant_id = $2 ORDER BY tarima_ref`,
        [req.params.id, req.tenantId]
      )
      const sessions = await req.tQuery(
        `SELECT s.*, u.nombre_completo AS operator_nombre
         FROM pick_sessions s LEFT JOIN usuarios u ON u.id = s.operator_id
         WHERE s.batch_id = $1 AND s.tenant_id = $2
         ORDER BY s.outbound_order_no`,
        [req.params.id, req.tenantId]
      )
      const events = await req.tQuery(
        `SELECT e.*, s.outbound_order_no, u.nombre_completo AS operator_nombre
         FROM pick_events e
         JOIN pick_sessions s ON s.id = e.session_id
         LEFT JOIN usuarios u ON u.id = e.operator_id
         WHERE s.batch_id = $1 AND e.tenant_id = $2
         ORDER BY e.scanned_at`,
        [req.params.id, req.tenantId]
      )
      res.json({
        success: true,
        data: { batch: batch.rows[0], tarimas: tarimas.rows, sessions: sessions.rows, events: events.rows },
      })
    } catch (err) {
      console.error('GET wmshub/pick-batch/:id error:', err.message)
      res.status(500).json({ success: false, error: 'Error obteniendo el lote' })
    }
  }
)

// Borrar una tarima ya confirmada: elimina sus eventos y recalcula los totales
// de cada sesión afectada. Solo para usuarios con permiso de eliminar — en el
// borrador, antes de confirmar, la regla escalonada la aplica el cliente.
router.delete('/:id/tarima/:ref',
  authenticateToken, loadFullUser,
  requirePermission('surtido.validacion', 'eliminar'),
  async (req, res) => {
    try {
      if (!UUID_RE.test(req.params.id)) {
        return res.status(400).json({ success: false, error: 'ID de lote inválido' })
      }
      const data = await req.tTransaction(async (client) => {
        const afectadas = await client.query(
          `DELETE FROM pick_events e
           USING pick_sessions s
           WHERE e.session_id = s.id AND s.batch_id = $1 AND e.tenant_id = $2 AND e.tarima_ref = $3
           RETURNING s.id AS session_id`,
          [req.params.id, req.tenantId, req.params.ref]
        )
        await client.query(
          `DELETE FROM pick_batch_tarimas WHERE batch_id = $1 AND tenant_id = $2 AND tarima_ref = $3`,
          [req.params.id, req.tenantId, req.params.ref]
        )
        const sessionIds = [...new Set(afectadas.rows.map(r => r.session_id))]
        for (const sessionId of sessionIds) {
          await client.query(
            `UPDATE pick_sessions s
             SET total_scanned = COALESCE((
                   SELECT SUM(COALESCE(quantity, 1))::int FROM pick_events
                   WHERE session_id = $1 AND tenant_id = $2 AND scan_result = 'ok'
                 ), 0),
                 updated_at = now()
             WHERE s.id = $1 AND s.tenant_id = $2`,
            [sessionId, req.tenantId]
          )
        }
        await client.query(
          `UPDATE pick_batches
           SET total_tarimas = GREATEST(total_tarimas - 1, 0),
               total_cajas = GREATEST(total_cajas - $3, 0),
               updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [req.params.id, req.tenantId, afectadas.rowCount]
        )
        return { eventos_eliminados: afectadas.rowCount, sesiones_afectadas: sessionIds.length }
      })
      res.json({ success: true, data })
    } catch (err) {
      console.error('DELETE wmshub/pick-batch/:id/tarima/:ref error:', err.message)
      res.status(500).json({ success: false, error: 'Error eliminando la tarima' })
    }
  }
)

export default router
