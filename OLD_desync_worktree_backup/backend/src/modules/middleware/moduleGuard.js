import { query } from '../../config/database.js'

// Returns middleware that verifies the tenant has access to the given module.
// Requires tenantContext middleware to have run first (sets req.tenantId + req.tenant).
export function moduleGuard(moduleCode) {
  return async (req, res, next) => {
    if (!req.tenantId) {
      return res.status(401).json({ error: 'Tenant no identificado' })
    }

    // Block write operations for expired tenants
    if (req.tenantReadOnly && req.method !== 'GET') {
      return res.status(402).json({
        error: 'Suscripcion vencida. Renueva para continuar.',
        code: 'SUBSCRIPTION_EXPIRED',
      })
    }

    try {
      const subRes = await query(
        `SELECT p.modules FROM subscriptions s
         JOIN plans p ON s.plan_id = p.id
         WHERE s.tenant_id = $1 AND s.status = 'active'
         ORDER BY s.started_at DESC LIMIT 1`,
        [req.tenantId]
      )

      if (subRes.rows.length === 0) {
        return res.status(402).json({
          error: 'Sin suscripcion activa.',
          code: 'NO_ACTIVE_SUBSCRIPTION',
        })
      }

      const modules = subRes.rows[0].modules
      if (!Array.isArray(modules) || !modules.includes(moduleCode)) {
        return res.status(403).json({
          error: `Modulo '${moduleCode}' no incluido en tu plan.`,
          code: 'MODULE_NOT_INCLUDED',
        })
      }

      next()
    } catch (err) {
      console.error('[moduleGuard]', err.message)
      return res.status(500).json({ error: 'Error interno' })
    }
  }
}
