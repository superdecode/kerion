import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../../shared/middleware/auth.js'
import { requirePermission } from '../../../shared/middleware/permissions.js'
import { getInventoryMap } from '../../../shared/services/wmsClient.js'
import { checkModuleLimitForUpdate } from '../../middleware/usageGuard.js'

const INVENTARIO_COUNT_QUERY = `SELECT COUNT(*) FROM inventory_scans WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`

const router = Router()

// POST /api/inventory/sessions/start
router.post('/sessions/start',
  authenticateToken, loadFullUser,
  requirePermission('inventory.escaneo', 'crear'),
  async (req, res) => {
    try {
      const { origin_location } = req.body
      const userId = req.user.id

      // Auto-close any stale active sessions for this user
      await req.tQuery(
        `UPDATE inventory_sessions SET status = 'closed', ended_at = now()
         WHERE user_id = $1 AND status = 'active' AND started_at < now() - INTERVAL '24 hours'`,
        [userId]
      )

      const result = await req.tQuery(
        `INSERT INTO inventory_sessions (user_id, origin_location, tenant_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [userId, origin_location || null, req.tenantId]
      )
      res.status(201).json({ session: result.rows[0] })
    } catch (err) {
      console.error('Start inventory session error:', err)
      res.status(500).json({ error: 'Error iniciando sesión de inventario' })
    }
  }
)

// POST /api/inventory/sessions/:sessionId/close
router.post('/sessions/:sessionId/close',
  authenticateToken, loadFullUser,
  requirePermission('inventory.escaneo', 'crear'),
  async (req, res) => {
    try {
      const { sessionId } = req.params
      const userId = req.user.id
      const result = await req.tQuery(
        `UPDATE inventory_sessions
         SET status = 'closed', ended_at = now()
         WHERE id = $1 AND user_id = $2 AND status = 'active'
         RETURNING *`,
        [sessionId, userId]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Sesión no encontrada o ya cerrada' })
      }
      res.json({ session: result.rows[0] })
    } catch (err) {
      console.error('Close inventory session error:', err)
      res.status(500).json({ error: 'Error cerrando sesión' })
    }
  }
)

// GET /api/inventory/sessions/active — get caller's active session if any
router.get('/sessions/active',
  authenticateToken, loadFullUser,
  requirePermission('inventory.escaneo', 'ver'),
  async (req, res) => {
    try {
      const result = await req.tQuery(
        `SELECT * FROM inventory_sessions
         WHERE user_id = $1 AND status = 'active'
         ORDER BY started_at DESC LIMIT 1`,
        [req.user.id]
      )
      res.json({ session: result.rows[0] || null })
    } catch (err) {
      console.error('Get active session error:', err)
      res.status(500).json({ error: 'Error obteniendo sesión activa' })
    }
  }
)

// POST /api/inventory/scans — scan a barcode
router.post('/scans',
  authenticateToken, loadFullUser,
  requirePermission('inventory.escaneo', 'crear'),
  async (req, res) => {
    let client
    try {
      const { session_id, barcode } = req.body
      if (!session_id || !barcode?.trim()) {
        return res.status(400).json({ error: 'session_id y barcode son requeridos' })
      }

      client = await req.tGetClient()

      // Verify session belongs to caller and is active
      const sessionRes = await client.query(
        `SELECT id
         FROM inventory_sessions
         WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND status = 'active'
         FOR UPDATE`,
        [session_id, req.user.id, req.tenantId]
      )
      if (sessionRes.rows.length === 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Sesión inválida o cerrada' })
      }

      const limitCheck = await checkModuleLimitForUpdate(
        client,
        req.tenantId,
        'inventario_limit',
        INVENTARIO_COUNT_QUERY,
        1
      )
      if (limitCheck.limited) {
        await client.query('ROLLBACK')
        return res.status(402).json({
          error: 'Límite mensual del plan alcanzado para este módulo.',
          code: 'INVENTARIO_LIMIT_REACHED',
          used: limitCheck.used,
          limit: limitCheck.limit,
        })
      }

      // Look up barcode in WMS inventory map
      let wmsItem = null
      try {
        const invMap = await getInventoryMap(req.tenantId)
        wmsItem = invMap[barcode.trim()] || null
      } catch (wmsErr) {
        if (wmsErr.code !== 'WMS_NOT_CONFIGURED') {
          console.error('WMS lookup error (non-fatal):', wmsErr.message)
        }
      }

      let status
      if (!wmsItem) {
        status = 'NoWMS'
      } else if (wmsItem.availableStock > 0) {
        status = 'OK'
      } else {
        status = 'Bloqueado'
      }

      const result = await client.query(
        `INSERT INTO inventory_scans
           (session_id, user_id, barcode, sku, product_name, cell_no, available_stock, status, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          session_id,
          req.user.id,
          barcode.trim(),
          wmsItem?.sku || null,
          wmsItem?.productName || null,
          wmsItem?.cellNo || null,
          wmsItem?.availableStock ?? null,
          status,
          req.tenantId
        ]
      )
      await client.query('COMMIT')

      res.status(201).json({ scan: result.rows[0] })
    } catch (err) {
      if (client) try { await client.query('ROLLBACK') } catch {}
      console.error('Inventory scan error:', err)
      res.status(500).json({ error: 'Error procesando escaneo' })
    } finally {
      if (client) client.release()
    }
  }
)

// GET /api/inventory/scans/:sessionId — list scans in a session
router.get('/scans/:sessionId',
  authenticateToken, loadFullUser,
  requirePermission('inventory.escaneo', 'ver'),
  async (req, res) => {
    try {
      const { sessionId } = req.params
      const result = await req.tQuery(
        `SELECT s.*, u.nombre_completo as user_name
         FROM inventory_scans s
         JOIN usuarios u ON s.user_id = u.id
         WHERE s.session_id = $1 AND s.tenant_id = $2
         ORDER BY s.created_at DESC`,
        [sessionId, req.tenantId]
      )
      res.json({ scans: result.rows })
    } catch (err) {
      console.error('Get session scans error:', err)
      res.status(500).json({ error: 'Error obteniendo escaneos' })
    }
  }
)

export default router
