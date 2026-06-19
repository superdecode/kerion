import { isDatabaseUnavailableError, query } from '../../config/database.js'

// Returns middleware that verifies the tenant has access to the given module.
// Requires tenantContext middleware to have run first (sets req.tenantId + req.tenant).
// Primary check: tenant_modules table (migration 043).
// Fallback: plans.modules JSONB (legacy, for tenants not yet backfilled).
export function moduleGuard(moduleCode) {
  return async (req, res, next) => {
    if (!req.tenantId) {
      return res.status(401).json({ error: 'Tenant no identificado' })
    }

    if (req.tenantReadOnly && req.method !== 'GET') {
      return res.status(402).json({
        error: 'Suscripcion vencida. Renueva para continuar.',
        code: 'SUBSCRIPTION_EXPIRED',
      })
    }

    try {
      const tmRes = await query(
        'SELECT enabled FROM tenant_modules WHERE tenant_id = $1 AND module_code = $2 LIMIT 1',
        [req.tenantId, moduleCode]
      )

      if (tmRes.rows.length > 0) {
        if (!tmRes.rows[0].enabled) {
          return res.status(403).json({
            error: `Modulo '${moduleCode}' no habilitado para este tenant.`,
            code: 'MODULE_DISABLED',
          })
        }
        return next()
      }

      // Fallback: check plan modules (for tenants not yet in tenant_modules)
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
      if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
      }
      return res.status(500).json({ error: 'Error interno' })
    }
  }
}
