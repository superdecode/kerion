import { Router } from 'express'
import { authenticateToken, loadFullUser } from '../../shared/middleware/auth.js'
import { query } from '../../config/database.js'

const router = Router()

// GET /api/usage/summary — monthly usage across all modules for the current tenant
router.get('/summary',
  authenticateToken, loadFullUser,
  async (req, res) => {
    if (!req.tenantId) return res.status(401).json({ error: 'Tenant no identificado' })
    try {
      // Get all plan limits in one query
      const planRes = await query(
        `SELECT p.guide_limit, p.surtido_limit, p.inventario_limit, p.devoluciones_limit,
                p.recepcion_limit, p.despacho_limit, p.name AS plan_name
         FROM tenants t
         LEFT JOIN plans p ON t.current_plan_id = p.id
         WHERE t.id = $1`,
        [req.tenantId]
      )
      const plan = planRes.rows[0] || {}

      // Query usage for each module in parallel
      const [dsRes, surtidoRes, invRes, devRes, recRes, despRes] = await Promise.all([
        // DropScan: guías scanned this calendar month
        query(
          `SELECT COUNT(*) AS count FROM guias
           WHERE tenant_id = $1
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`,
          [req.tenantId]
        ).catch(e => { console.warn('[usage] dropscan query failed:', e.message); return { rows: [{ count: '0' }] } }),

        // Surtido: new OBCs entered into pick_order_tracking this month
        query(
          `SELECT COUNT(*) AS count FROM pick_order_tracking
           WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`,
          [req.tenantId]
        ).catch(e => { console.warn('[usage] surtido query failed:', e.message); return { rows: [{ count: '0' }] } }),

        // Inventario: individual scans this month
        query(
          `SELECT COUNT(*) AS count FROM inventory_scans
           WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`,
          [req.tenantId]
        ).catch(e => { console.warn('[usage] inventario query failed:', e.message); return { rows: [{ count: '0' }] } }),

        // Devoluciones: confirmed entradas this month
        query(
          `SELECT COUNT(*) AS count FROM dev_sesiones
           WHERE tenant_id = $1 AND estado = 'confirmado'
           AND confirmado_at >= date_trunc('month', now())`,
          [req.tenantId]
        ).catch(e => { console.warn('[usage] devoluciones query failed:', e.message); return { rows: [{ count: '0' }] } }),

        // Recepción: inbound_orders created this month
        query(
          `SELECT COUNT(*) AS count FROM inbound_orders
           WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`,
          [req.tenantId]
        ).catch(e => { console.warn('[usage] recepcion query failed:', e.message); return { rows: [{ count: '0' }] } }),

        // Despacho: dispatch_folios created this month (excludes cancelados)
        query(
          `SELECT COUNT(*) AS count FROM dispatch_folios
           WHERE tenant_id = $1 AND deleted_at IS NULL
           AND created_at >= date_trunc('month', now())`,
          [req.tenantId]
        ).catch(e => { console.warn('[usage] despacho query failed:', e.message); return { rows: [{ count: '0' }] } }),
      ])

      function buildStat(usedRaw, limit) {
        const used = parseInt(usedRaw ?? '0', 10)
        const lim = limit ?? null
        const pct = lim != null && lim > 0 ? Math.min(100, Math.round((used / lim) * 100)) : (used > 0 ? 100 : 0)
        return {
          used,
          limit: lim,
          at_limit: lim !== null && used >= lim,
          warning: lim !== null && pct >= 80 && used < lim,
          pct,
        }
      }

      res.json({
        plan_name:    plan.plan_name || null,
        dropscan:     buildStat(dsRes.rows[0]?.count,     plan.guide_limit),
        surtido:      buildStat(surtidoRes.rows[0]?.count, plan.surtido_limit),
        inventario:   buildStat(invRes.rows[0]?.count,     plan.inventario_limit),
        devoluciones: buildStat(devRes.rows[0]?.count,     plan.devoluciones_limit),
        recepcion:    buildStat(recRes.rows[0]?.count,     plan.recepcion_limit),
        despacho:     buildStat(despRes.rows[0]?.count,    plan.despacho_limit),
      })
    } catch (err) {
      console.error('[usage/summary]', err.message)
      res.status(500).json({ error: 'Error interno' })
    }
  }
)

export default router
