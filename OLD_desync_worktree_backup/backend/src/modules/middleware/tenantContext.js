import { query } from '../../config/database.js'
import env from '../../config/env.js'

// Statuses that allow read-only access (frontend shows upgrade prompt)
const READ_ONLY_STATUSES = new Set(['trial_expired', 'expired'])
// Statuses that block access entirely
const BLOCKED_STATUSES = new Set(['suspended', 'rejected', 'pending'])

function extractSlugFromHost(host) {
  if (!host) return null
  const baseDomain = env.TENANT_BASE_DOMAIN // e.g. 'kerion.app'
  const withoutPort = host.split(':')[0]

  // e.g. 'acme.kerion.app' -> 'acme'
  if (withoutPort.endsWith(`.${baseDomain}`)) {
    return withoutPort.slice(0, -(baseDomain.length + 1))
  }

  // Local dev: allow X-Tenant-Slug header override
  return null
}

// Applies to all /api/* routes except /api/auth, /api/public, /api/admin, /api/health, /api/cron
export async function tenantContext(req, res, next) {
  const host = req.headers['host'] || ''
  // Allow slug override via header in development
  const slug =
    extractSlugFromHost(host) ||
    (env.NODE_ENV !== 'production' ? req.headers['x-tenant-slug'] : null)

  // Fallback: no subdomain — use legacy tenant (single-domain production or local dev)
  const useDevFallback = !slug && !!env.LEGACY_TENANT_ID

  if (!slug && !useDevFallback) {
    return res.status(400).json({ error: 'Tenant no identificado' })
  }

  try {
    const result = await query(
      useDevFallback
        ? 'SELECT id, slug, status, trial_expires_at, subscription_expires_at, current_plan_id FROM tenants WHERE id = $1 LIMIT 1'
        : 'SELECT id, slug, status, trial_expires_at, subscription_expires_at, current_plan_id FROM tenants WHERE slug = $1 LIMIT 1',
      [useDevFallback ? env.LEGACY_TENANT_ID : slug]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant no encontrado' })
    }

    const tenant = result.rows[0]

    if (BLOCKED_STATUSES.has(tenant.status)) {
      const messages = {
        suspended: 'Cuenta suspendida. Contacta a soporte.',
        rejected: 'Solicitud rechazada.',
        pending: 'Cuenta pendiente de aprobacion.',
      }
      return res.status(403).json({ error: messages[tenant.status] || 'Acceso denegado' })
    }

    req.tenantId = tenant.id
    req.tenant = tenant
    req.tenantReadOnly = READ_ONLY_STATUSES.has(tenant.status)

    next()
  } catch (err) {
    console.error('[tenantContext] DB error:', err.message)
    return res.status(500).json({ error: 'Error interno' })
  }
}

// Middleware that enforces read-only restriction (use on write endpoints for expired tenants)
export function requireActiveTenant(req, res, next) {
  if (req.tenantReadOnly) {
    return res.status(402).json({
      error: 'Suscripcion vencida. Renueva para continuar.',
      code: 'SUBSCRIPTION_EXPIRED',
    })
  }
  next()
}
