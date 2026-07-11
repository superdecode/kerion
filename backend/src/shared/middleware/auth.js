import jwt from 'jsonwebtoken'
import env from '../../config/env.js'
import { isDatabaseUnavailableError, query, tenantQuery } from '../../config/database.js'
import { normalizeLevel } from './permissions.js'

function normalizePermisos(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = {}
  for (const [key, val] of Object.entries(obj)) {
    result[key] = typeof val === 'string' ? normalizeLevel(val) : normalizePermisos(val)
  }
  return result
}

function getSafePermisos(user) {
  const rawPermisos = user?.permisos_override || user?.rol_permisos || {}
  if (!rawPermisos) return {}
  if (typeof rawPermisos === 'string') {
    try {
      return normalizePermisos(JSON.parse(rawPermisos))
    } catch (error) {
      console.error('[auth] middleware permisos parse failed:', error.message)
      return {}
    }
  }
  return normalizePermisos(rawPermisos)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const AUTH_DB_DEADLINE_MS = parseInt(process.env.AUTH_DB_DEADLINE_MS, 10) || 12000
const NON_RETRYABLE_AUTH_DB_CODES = new Set(['ECHECKOUTTIMEOUT', 'DB_QUERY_DEADLINE'])

async function tenantQueryWithRetry(tenantId, text, params) {
  const execute = () => {
    let timeoutId
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`Tenant query exceeded ${AUTH_DB_DEADLINE_MS}ms`)
        error.code = 'DB_QUERY_DEADLINE'
        reject(error)
      }, AUTH_DB_DEADLINE_MS)
    })
    return Promise.race([tenantQuery(tenantId, text, params), timeoutPromise]).finally(() => clearTimeout(timeoutId))
  }

  try {
    return await execute()
  } catch (error) {
    if (!isDatabaseUnavailableError(error) || NON_RETRYABLE_AUTH_DB_CODES.has(error.code)) throw error
    console.warn('[auth] transient DB error in tenantQuery, retrying once:', error.code || error.message)
    await sleep(350)
    return execute()
  }
}

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  let decoded
  try {
    decoded = jwt.verify(token, env.JWT_SECRET)
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }

  // Check token blacklist plus the two events that must force re-login even on
  // a long-lived (30-day) token: the user's password changed, or their role's
  // permissions changed. Both are dedicated timestamps compared against the
  // token's issued-at — see migration 097. Fatal on DB error: a revoked/stale
  // token must never silently pass through just because a check is unreachable.
  if (decoded.jti) {
    try {
      const result = await query(
        `SELECT
           EXISTS(SELECT 1 FROM token_blacklist WHERE token_jti = $1) AS blacklisted,
           (SELECT password_changed_at FROM usuarios WHERE id = $2) AS password_changed_at,
           (SELECT permisos_changed_at FROM roles WHERE id = $3) AS permisos_changed_at`,
        [decoded.jti, decoded.id, decoded.rol_id || null]
      )
      const row = result.rows[0] || {}
      if (row.blacklisted) {
        return res.status(401).json({ error: 'Token revocado' })
      }
      const issuedAtMs = (decoded.iat || 0) * 1000
      if (row.password_changed_at && new Date(row.password_changed_at).getTime() > issuedAtMs) {
        return res.status(401).json({ error: 'Tu contraseña cambió. Inicia sesión de nuevo.', code: 'PASSWORD_CHANGED' })
      }
      if (row.permisos_changed_at && new Date(row.permisos_changed_at).getTime() > issuedAtMs) {
        return res.status(401).json({ error: 'Los permisos de tu rol cambiaron. Inicia sesión de nuevo.', code: 'ROLE_PERMISSIONS_CHANGED' })
      }
    } catch (err) {
      console.error('[auth] Token validity check failed:', err.message)
      return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
    }
  }

  if (req.tenantId) {
    if (!decoded.tenant_id) {
      return res.status(403).json({ error: 'Token sin tenant válido' })
    }
    if (decoded.tenant_id !== req.tenantId) {
      console.warn('[auth] tenant mismatch token=%s route=%s', decoded.tenant_id, req.tenantId)
      return res.status(403).json({ error: 'Token no pertenece a este tenant' })
    }
  }

  req.user = decoded
  req.token = token
  next()
}

/**
 * Log a sensitive operation to the audit_log table.
 * Fire-and-forget — errors are logged but never block the request.
 */
export async function auditLog(req, action, entityType, entityId, details) {
  try {
    const userId = req.user?.id || req.fullUser?.id || null
    const userEmail = req.user?.email || req.fullUser?.email || null
    const tenantId = req.tenantId || req.user?.tenant_id || null
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null
    const ua = req.headers['user-agent'] || null
    await query(
      `INSERT INTO audit_log (user_id, user_email, tenant_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, userEmail, tenantId, action, entityType, entityId, details ? JSON.stringify(details) : null, ip, ua]
    )
  } catch (err) {
    console.error('Audit log error (non-blocking):', err.message)
  }
}

export async function loadFullUser(req, res, next) {
  try {
    if (req.tenantId && req.user?.tenant_id && req.user.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Token no pertenece a este tenant' })
    }

    const tenantId = req.tenantId || req.user?.tenant_id

    // Use tenantQuery so that SET LOCAL app.tenant_id is applied within the
    // transaction — required because usuarios and roles have FORCE ROW LEVEL
    // SECURITY with a policy that reads current_setting('app.tenant_id').
    // Select only the columns the mapping below consumes — avoids pulling wide
    // columns (notably password_hash) into request scope on every authenticated
    // request, and cuts DB→function transfer on this hot path.
    const result = await tenantQueryWithRetry(
      tenantId,
      `SELECT u.id, u.codigo, u.nombre_completo, u.email, u.rol_id,
              u.es_admin_tenant, u.estado, u.tenant_id, u.zona_horaria,
              u.permisos_override,
              r.nombre as rol_nombre, r.permisos as rol_permisos,
              t.zona_horaria as tenant_zona_horaria
       FROM usuarios u
       LEFT JOIN roles r ON u.rol_id = r.id
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.tenant_id = $2 AND u.estado = 'ACTIVO'`,
      [req.user.id, tenantId]
    )

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Usuario no encontrado o inactivo' })
    }

    const user = result.rows[0]
    req.fullUser = {
      id: user.id,
      codigo: user.codigo,
      nombre_completo: user.nombre_completo,
      email: user.email,
      rol_id: user.rol_id,
      rol_nombre: user.rol_nombre,
      es_admin_tenant: user.es_admin_tenant === true,
      permisos: getSafePermisos(user),
      estado: user.estado,
      tenant_id: user.tenant_id,
      zona_horaria: user.zona_horaria || user.tenant_zona_horaria || 'America/Mexico_City',
    }
    next()
  } catch (err) {
    console.error('[loadFullUser] error:', err.message)
    if (isDatabaseUnavailableError(err)) {
      return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' })
    }
    return res.status(500).json({ error: 'Error cargando usuario' })
  }
}
