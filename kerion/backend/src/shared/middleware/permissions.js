/**
 * Permission resolution for 5-level system:
 * sin_acceso (0) → lectura (1) → escritura (2) → gestion (3) → total (4)
 */

function resolvePermission(level, action) {
  if (!level) return false
  const lvl = String(level).toLowerCase()

  if (lvl === 'total') return true
  if (lvl === 'sin_acceso' || lvl === '') return false
  if (lvl === 'lectura') return action === 'ver'
  if (lvl === 'escritura') return ['ver', 'crear', 'editar'].includes(action)
  if (lvl === 'gestion') return action !== 'desbloquear'

  return false
}

function getPermissionLevel(permisos, modulePath) {
  if (!permisos || !modulePath) return 'sin_acceso'

  const parts = modulePath.split('.')
  let current = permisos

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      return 'sin_acceso'
    }
  }

  return typeof current === 'string' ? current : 'sin_acceso'
}

/**
 * Middleware factory: requirePermission('dropscan.escaneo', 'crear')
 */
export function requirePermission(modulePath, action) {
  return (req, res, next) => {
    const user = req.fullUser
    if (!user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    // Admin fallback
    if (user.rol_nombre === 'Administrador') {
      return next()
    }

    const level = getPermissionLevel(user.permisos, modulePath)
    const hasPermission = resolvePermission(level, action)

    if (!hasPermission) {
      return res.status(403).json({
        error: 'No tienes permisos para esta acción',
        required: `${modulePath}.${action}`,
        current: level,
      })
    }

    next()
  }
}

export { resolvePermission, getPermissionLevel }
