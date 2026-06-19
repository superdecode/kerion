import jwt from 'jsonwebtoken'
import env from '../../config/env.js'
import { query, tenantQuery } from '../../config/database.js'
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

  // Check token blacklist — fatal on DB error: a revoked token must never
  // silently pass through just because the blacklist table is unreachable.
  if (decoded.jti) {
    try {
      const blacklisted = await query(
        'SELECT 1 FROM token_blacklist WHERE token_jti = $1 LIMIT 1',
        [decoded.jti]
      )
      if (blacklisted.rows.length > 0) {
        return res.status(401).json({ error: 'Token revocado' })
      }
    } catch (err) {
      console.error('[auth] Token blacklist check failed:', err.message)
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
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null
    const ua = req.headers['user-agent'] || null
    await query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, userEmail, action, entityType, entityId, details ? JSON.stringify(details) : null, ip, ua]
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
    const result = await tenantQuery(
      tenantId,
      `SELECT u.*, r.nombre as rol_nombre, r.permisos as rol_permisos,
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
    return res.status(500).json({ error: 'Error cargando usuario' })
  }
}
