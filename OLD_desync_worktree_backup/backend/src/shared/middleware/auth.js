import jwt from 'jsonwebtoken'
import env from '../../config/env.js'
import { query } from '../../config/database.js'

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

  // Check token blacklist (non-fatal — DB errors don't block auth)
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
      console.error('Token blacklist check failed (non-fatal):', err.message)
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
    const result = await query(
      `SELECT u.*, r.nombre as rol_nombre, r.permisos as rol_permisos
       FROM usuarios u
       LEFT JOIN roles r ON u.rol_id = r.id
       WHERE u.id = $1 AND u.estado = 'ACTIVO'`,
      [req.user.id]
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
      permisos: user.permisos_override || user.rol_permisos || {},
      estado: user.estado,
      zona_horaria: user.zona_horaria || 'America/Mexico_City',
    }
    next()
  } catch (err) {
    return res.status(500).json({ error: 'Error cargando usuario' })
  }
}
