import jwt from 'jsonwebtoken'
import { isDatabaseUnavailableError, query } from '../../config/database.js'
import env from '../../config/env.js'

// Statuses that allow read-only access (frontend shows upgrade prompt)
const READ_ONLY_STATUSES = new Set(['trial_expired', 'expired'])
// Statuses that block access entirely
const BLOCKED_STATUSES = new Set(['suspended', 'rejected', 'pending'])
const TENANT_DB_DEADLINE_MS = parseInt(process.env.TENANT_DB_DEADLINE_MS, 10) || 12000

function extractSlugFromHost(host) {
  if (!host) return null
  const baseDomain = env.TENANT_BASE_DOMAIN
  const withoutPort = host.split(':')[0]

  if (withoutPort.endsWith(`.${baseDomain}`)) {
    const slug = withoutPort.slice(0, -(baseDomain.length + 1))
    return slug === 'www' ? null : slug
  }

  return null
}

function isLocalDevHost(host) {
  const withoutPort = String(host || '').split(':')[0].trim().toLowerCase()
  return withoutPort === 'localhost' || withoutPort === '127.0.0.1' || withoutPort === '0.0.0.0'
}

// Decode JWT without verification — only used for tenant routing in dev
function extractTenantIdFromBearer(req) {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if (!token) return null
    const decoded = jwt.decode(token)
    return decoded?.tenant_id || null
  } catch {
    return null
  }
}

// Applies to all /api/* routes except /api/auth, /api/public, /api/admin, /api/health, /api/cron
export async function tenantContext(req, res, next) {
  // x-forwarded-host takes priority (Vercel and other reverse proxies set this to the public hostname)
  const rawHost = req.headers['x-forwarded-host'] || req.headers['host'] || ''
  const host = rawHost.split(',')[0].trim()

  // Allow slug override via header in development
  const slug =
    extractSlugFromHost(host) ||
    (env.NODE_ENV !== 'production' && isLocalDevHost(host) ? req.headers['x-tenant-slug'] : null)

  console.log('[tenantContext] host=' + host + ' baseDomain=' + env.TENANT_BASE_DOMAIN + ' slug=' + (slug || '(none)'))

  // In dev with no subdomain: use tenant_id from JWT (so localhost mirrors the
  // logged-in user's real tenant rather than the placeholder LEGACY_TENANT_ID)
  const jwtTenantId = (!slug && env.NODE_ENV !== 'production')
    ? extractTenantIdFromBearer(req)
    : null

  // Final fallback: static legacy tenant for unauthenticated dev requests
  const useDevFallback = !slug && !jwtTenantId && !!env.LEGACY_TENANT_ID

  if (!slug && !jwtTenantId && !useDevFallback) {
    return res.status(400).json({ error: 'Tenant no identificado' })
  }

  try {
    const tenantParam = slug || (jwtTenantId ?? env.LEGACY_TENANT_ID)
    const byId = !!jwtTenantId || useDevFallback
    let timeoutId
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`Tenant query exceeded ${TENANT_DB_DEADLINE_MS}ms`)
        error.code = 'DB_QUERY_DEADLINE'
        reject(error)
      }, TENANT_DB_DEADLINE_MS)
    })
    const result = await Promise.race([
      query(
        byId
          ? 'SELECT id, slug, status, trial_expires_at, subscription_expires_at, current_plan_id FROM tenants WHERE id = $1 LIMIT 1'
          : 'SELECT id, slug, status, trial_expires_at, subscription_expires_at, current_plan_id FROM tenants WHERE slug = $1 LIMIT 1',
        [tenantParam]
      ),
      timeoutPromise,
    ]).finally(() => clearTimeout(timeoutId))

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
    if (isDatabaseUnavailableError(err)) {
      return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
    }
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
