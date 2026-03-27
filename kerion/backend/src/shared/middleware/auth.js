import jwt from 'jsonwebtoken'
import env from '../../config/env.js'
import { query } from '../../config/database.js'

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' })
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
    }
    next()
  } catch (err) {
    return res.status(500).json({ error: 'Error cargando usuario' })
  }
}
