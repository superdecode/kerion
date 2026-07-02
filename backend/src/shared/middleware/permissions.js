/**
 * Permission resolution for 4-action level system:
 *
 * Level stored in DB          Actions allowed
 * ─────────────────────────────────────────────
 * sin_acceso                  (none)
 * ver                         ver
 * crear                       ver, crear, imprimir
 * editar                      ver, crear, editar, imprimir
 * actualizar                  ver, crear, editar, imprimir, cancelar, exportar, desbloquear
 * eliminar                    ALL (ver, crear, editar, imprimir, cancelar, exportar, desbloquear, eliminar)
 *
 * Legacy level mapping (for data that wasn't fully migrated):
 *   total → eliminar, gestion → actualizar, escritura → crear, lectura → ver
 *
 * Frontend admin UI maps checkboxes to these same level names:
 *   [✓Ver] [✓Crear] [✓Editar] [✓Actualizar] [✓Eliminar]
 * Checking "Crear" also checks "Ver", checking "Editar" checks all previous, etc.
 */

const LEVEL_HIERARCHY = ['sin_acceso', 'ver', 'crear', 'editar', 'actualizar', 'eliminar']

// Legacy level mapping (for data that wasn't fully migrated)
const LEGACY_MAP = { total: 'eliminar', gestion: 'actualizar', escritura: 'crear', lectura: 'ver' }
const MODULE_ALIASES = {
  'dropscan.historial': 'dropscan.tarimas',
  'inventory.historial': 'inventory.tarimas',
}

// Fallback paths: if primary lookup returns sin_acceso, try the alternate path.
// Handles roles created before/after FEP was merged into DropScan (mig 011 vs mig 048).
const MODULE_FALLBACKS = {
  'fep.folios': 'dropscan.folios',
  'dropscan.folios': 'fep.folios',
  'despacho.validar': 'despacho.folios',
  'recepcion.validacion': 'recepcion.recibir',
}

function normalizeLevel(level) {
  if (!level) return 'sin_acceso'
  const lvl = String(level).toLowerCase()
  return LEGACY_MAP[lvl] || lvl
}

const ACTION_MIN_LEVEL = {
  ver:         'ver',
  crear:       'crear',
  editar:      'editar',
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

function lookupPath(permisos, path) {
  const parts = path.split('.')
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

function getPermissionLevel(permisos, modulePath) {
  if (!permisos || !modulePath) return 'sin_acceso'

  const resolvedModule = MODULE_ALIASES[modulePath] || modulePath
  const level = lookupPath(permisos, resolvedModule)
  if (level !== 'sin_acceso') return level

  const fallback = MODULE_FALLBACKS[modulePath]
  return fallback ? lookupPath(permisos, fallback) : 'sin_acceso'
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

    // Admin bypass: prefer es_admin_tenant flag; fall back to rol_nombre string for
    // tokens issued before migration 041 (backward compat for 1 release cycle).
    const isAdmin = user.es_admin_tenant === true ||
      (user.es_admin_tenant === undefined && user.rol_nombre === 'Administrador')
    if (isAdmin) {
      if (user.es_admin_tenant === undefined) {
        console.warn('[permissions] admin bypass via legacy rol_nombre — user should re-login', user.id)
      }
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

export function requireAnyPermission(candidates) {
  return (req, res, next) => {
    const user = req.fullUser
    if (!user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const isAdmin = user.es_admin_tenant === true ||
      (user.es_admin_tenant === undefined && user.rol_nombre === 'Administrador')
    if (isAdmin) {
      if (user.es_admin_tenant === undefined) {
        console.warn('[permissions] admin bypass via legacy rol_nombre — user should re-login', user.id)
      }
      return next()
    }

    const hasAnyPermission = Array.isArray(candidates) && candidates.some(({ modulePath, action }) => {
      const level = getPermissionLevel(user.permisos, modulePath)
      return resolvePermission(level, action)
    })

    if (!hasAnyPermission) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' })
    }

    next()
  }
}

export { resolvePermission, getPermissionLevel, normalizeLevel, LEVEL_HIERARCHY, ACTION_MIN_LEVEL }
