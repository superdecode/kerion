import { Router } from 'express'
import { query } from '../../../config/database.js'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'

const router = Router()

// GET /api/inventory/history — paginated scan history with filters
router.get('/',
  authenticateToken, loadFullUser,
  requirePermission('inventory.historial', 'ver'),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        barcode,
        date_from,
        date_to,
        user_id,
      } = req.query

      const offset = (parseInt(page) - 1) * parseInt(limit)
      const conditions = []
      const params = []
      let idx = 1

      if (status) {
        conditions.push(`s.status = $${idx++}`)
        params.push(status)
      }
      if (barcode) {
        conditions.push(`s.barcode ILIKE $${idx++}`)
        params.push(`%${barcode}%`)
      }
      if (date_from) {
        conditions.push(`s.created_at >= $${idx++}`)
        params.push(date_from)
      }
      if (date_to) {
        conditions.push(`s.created_at < ($${idx++}::date + INTERVAL '1 day')`)
        params.push(date_to)
      }
      if (user_id) {
        conditions.push(`s.user_id = $${idx++}`)
        params.push(parseInt(user_id))
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const [dataRes, countRes] = await Promise.all([
        query(
          `SELECT s.*, sess.origin_location, u.nombre_completo as user_name
           FROM inventory_scans s
           JOIN inventory_sessions sess ON s.session_id = sess.id
           JOIN usuarios u ON s.user_id = u.id
           ${where}
           ORDER BY s.created_at DESC
           LIMIT $${idx++} OFFSET $${idx++}`,
          [...params, parseInt(limit), offset]
        ),
        query(
          `SELECT COUNT(*) as total FROM inventory_scans s ${where}`,
          params
        ),
      ])

      res.json({
        scans: dataRes.rows,
        total: parseInt(countRes.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
      })
    } catch (err) {
      console.error('Inventory history error:', err)
      res.status(500).json({ error: 'Error obteniendo historial' })
    }
  }
)

// GET /api/inventory/reports — KPIs + charts data
router.get('/reports',
  authenticateToken, loadFullUser,
  requirePermission('inventory.reportes', 'ver'),
  async (req, res) => {
    try {
      const { date_from, date_to } = req.query
      const conditions = []
      const params = []
      let idx = 1

      if (date_from) {
        conditions.push(`created_at >= $${idx++}`)
        params.push(date_from)
      }
      if (date_to) {
        conditions.push(`created_at < ($${idx++}::date + INTERVAL '1 day')`)
        params.push(date_to)
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const [kpiRes, byStatusRes, byDayRes, topScannedRes] = await Promise.all([
        query(
          `SELECT
             COUNT(*) as total_scans,
             COUNT(CASE WHEN status = 'OK' THEN 1 END) as ok_count,
             COUNT(CASE WHEN status = 'Bloqueado' THEN 1 END) as bloqueado_count,
             COUNT(CASE WHEN status = 'NoWMS' THEN 1 END) as no_wms_count,
             COUNT(DISTINCT session_id) as total_sessions,
             COUNT(DISTINCT user_id) as total_users
           FROM inventory_scans ${where}`,
          params
        ),
        query(
          `SELECT status, COUNT(*) as count
           FROM inventory_scans ${where}
           GROUP BY status`,
          params
        ),
        query(
          `SELECT DATE(created_at) as day, status, COUNT(*) as count
           FROM inventory_scans ${where}
           GROUP BY DATE(created_at), status
           ORDER BY day`,
          params
        ),
        query(
          `SELECT barcode, product_name, sku, COUNT(*) as scan_count, MAX(status) as last_status
           FROM inventory_scans ${where}
           GROUP BY barcode, product_name, sku
           ORDER BY scan_count DESC
           LIMIT 20`,
          params
        ),
      ])

      const kpi = kpiRes.rows[0]
      res.json({
        kpi: {
          total_scans: parseInt(kpi.total_scans),
          ok_count: parseInt(kpi.ok_count),
          bloqueado_count: parseInt(kpi.bloqueado_count),
          no_wms_count: parseInt(kpi.no_wms_count),
          total_sessions: parseInt(kpi.total_sessions),
          total_users: parseInt(kpi.total_users),
        },
        by_status: byStatusRes.rows,
        by_day: byDayRes.rows,
        top_scanned: topScannedRes.rows,
      })
    } catch (err) {
      console.error('Inventory reports error:', err)
      res.status(500).json({ error: 'Error generando reportes' })
    }
  }
)

export default router
