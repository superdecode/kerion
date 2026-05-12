/**
 * Permission resolution for 4-action level system:
 *
 * Level stored in DB          Actions allowed
 * ─────────────────────────────────────────────
 * sin_acceso                  (none)
 * ver                         ver
 * crear                       ver, crear, editar, imprimir
 * actualizar                  ver, crear, editar, imprimir, cancelar, exportar, desbloquear
 * eliminar                    ALL (ver, crear, editar, imprimir, cancelar, exportar, desbloquear, eliminar)
 *
 * Legacy level mapping (for data that wasn't fully migrated):
 *   total → eliminar, gestion → actualizar, escritura → crear, lectura → ver
 *
 * Frontend admin UI maps checkboxes to these same level names:
 *   [✓Ver] [✓Crear] [✓Actualizar] [✓Eliminar]
 * Checking "Crear" also checks "Ver", checking "Actualizar" checks all previous, etc.
 */

const LEVEL_HIERARCHY = ['sin_acceso', 'ver', 'crear', 'actualizar', 'eliminar']

// Legacy level mapping (for data that wasn't fully migrated)
const LEGACY_MAP = { total: 'eliminar', gestion: 'actualizar', escritura: 'crear', lectura: 'ver' }

function normalizeLevel(level) {
  if (!level) return 'sin_acceso'
  const lvl = String(level).toLowerCase()
  return LEGACY_MAP[lvl] || lvl
}

const ACTION_MIN_LEVEL = {
  ver:         'ver',
  crear:       'crear',
  editar:      'crear',
  imprimir:    'crear',
  actualizar:  'actualizar',
  cancelar:    'actualizar',
  exportar:    'actualizar',
  desbloquear: 'actualizar',
  eliminar:    'eliminar',
}

function resolvePermission(level, action) {
  const lvl = normalizeLevel(level)

  if (lvl === 'eliminar') return true
  if (lvl === 'sin_acceso' || lvl === '') return false

  const minLevel = ACTION_MIN_LEVEL[action]
  if (!minLevel) return false

  const currentIdx = LEVEL_HIERARCHY.indexOf(lvl)
  const requiredIdx = LEVEL_HIERARCHY.indexOf(minLevel)

  return currentIdx >= requiredIdx
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

  return typeof current === 'string' ? normalizeLevel(current) : 'sin_acceso'
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
      return res.status(403).json({ error: 'No tienes permisos para esta acción' })
    }

    next()
  }
}

export { resolvePermission, getPermissionLevel, normalizeLevel, LEVEL_HIERARCHY, ACTION_MIN_LEVEL }
