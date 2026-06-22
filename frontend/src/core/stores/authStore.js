import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api, { setBackendStatusCallback, setUnauthorizedCallback, setGetTokenCallback } from '../services/api.js'
import { mockLogin, mockAuthMe } from '../services/mockAuth.js'
import { setTimezone } from '../utils/dateFormat.js'

/**
 * Permission resolution for 5-level system (action-verb names):
 * sin_acceso → ver → crear → actualizar → eliminar
 */
const LEVEL_HIERARCHY = { sin_acceso: 0, ver: 1, crear: 2, actualizar: 3, eliminar: 4 }

// Legacy level mapping (for data that wasn't fully migrated)
const LEGACY_MAP = { total: 'eliminar', gestion: 'actualizar', escritura: 'crear', lectura: 'ver' }
const MODULE_ALIASES = {
  'dropscan.historial': 'dropscan.tarimas',
  'inventory.historial': 'inventory.tarimas',
  'dropscan.folios': 'fep.folios',
  'fep.historial': 'fep.folios',
}

// Fallback keys: if primary lookup returns sin_acceso, try these alternate paths.
// Handles tokens issued before migration 052 that used 'inventory' instead of 'inventario'.
// Also handles FEP/folios that lives under dropscan after migration 048 (mig 011 used fep.folios).
const MODULE_FALLBACKS = {
  'inventario.escaneo': 'inventory.escaneo',
  'inventario.registros': 'inventory.tarimas',
  'fep.folios': 'dropscan.folios',
  'dropscan.folios': 'fep.folios',
  'despacho.validar': 'despacho.folios',
}

function normalizeLevel(level) {
  if (!level) return 'sin_acceso'
  const lvl = String(level).toLowerCase()
  return LEGACY_MAP[lvl] || lvl
}

const ACTION_MIN_LEVEL = {
  ver: 'ver',
  crear: 'crear',
  editar: 'crear',
  imprimir: 'crear',
  actualizar: 'actualizar',
  cancelar: 'actualizar',
  exportar: 'actualizar',
  desbloquear: 'actualizar',
  eliminar: 'eliminar',
}

function resolvePermission(level, action) {
  if (!level) return false
  const lvl = normalizeLevel(level)
  if (lvl === 'sin_acceso' || lvl === '') return false
  const lvlRank = LEVEL_HIERARCHY[lvl] ?? -1
  const minRank = LEVEL_HIERARCHY[ACTION_MIN_LEVEL[action]] ?? 99
  return lvlRank >= minRank
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

function getModuleLevel(permisos, modulePath) {
  if (!permisos || !modulePath) return 'sin_acceso'
  const resolved = MODULE_ALIASES[modulePath] || modulePath
  const level = lookupPath(permisos, resolved)
  if (level !== 'sin_acceso') return level
  // Try legacy fallback key (pre-052 tokens used 'inventory' instead of 'inventario')
  const fallback = MODULE_FALLBACKS[modulePath]
  return fallback ? lookupPath(permisos, fallback) : 'sin_acceso'
}

// Prefer the es_admin_tenant flag introduced in migration 041.
// Fall back to rol_nombre string for tokens issued before that migration (1-release compat).
function isTenantAdmin(user) {
  if (!user) return false
  if (user.es_admin_tenant === true) return true
  const roleName = String(user.rol_nombre || user.rol || '').trim().toLowerCase()
  if (user.es_admin_tenant === undefined && ['administrador', 'admin', 'administrator'].includes(roleName)) return true
  return false
}

function clearPersistedAuth() {
  Object.keys(localStorage)
    .filter(k => k === 'wms-auth' || k.startsWith('kirion_'))
    .forEach(k => localStorage.removeItem(k))
}

function resolveTenantBaseDomain() {
  const configured = (import.meta.env.VITE_TENANT_BASE_DOMAIN || '').trim()
  if (configured) return configured

  const hostname = window.location.hostname
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)) return hostname

  const parts = hostname.split('.').filter(Boolean)
  if (parts.length >= 2) return parts.slice(-2).join('.')

  return hostname
}

function getReadableAuthError(error) {
  if (error.response?.data?.error) {
    const err = error.response.data.error
    return typeof err === 'object' ? (err.message || JSON.stringify(err)) : err
  }
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
    return 'El servidor tardó demasiado en responder. Intenta de nuevo.'
  }
  if (!error.response && (error.code === 'ERR_NETWORK' || /Network Error/i.test(error.message || ''))) {
    return 'No se pudo conectar con el servidor. Verifica la conexión e intenta de nuevo.'
  }
  if (error.message) return error.message
  return 'Error de conexión'
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      enabledModules: [],
      backendOnline: true,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          // Mock data — only active in dev builds
          if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === 'true') {
            const result = await mockLogin(email, password)
            if (result.success) {
              set({
                user: result.user,
                token: result.token,
                isAuthenticated: true,
                isLoading: false,
              })
            }
            set({ isLoading: false })
            return result
          }
          
          // API real
          const { data } = await api.post('/auth/login', { email, password }, { timeout: 30000 })
          if (data.user?.zona_horaria) setTimezone(data.user.zona_horaria)
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            enabledModules: data.user?.enabledModules || [],
          })

          // Subdomain redirect: if on main domain and slug available, redirect to tenant subdomain
          const slug = data.user?.slug
          const hostname = window.location.hostname
          const tenantBase = resolveTenantBaseDomain()
          const mainDomains = [tenantBase, `www.${tenantBase}`, 'kirion.vercel.app', 'localhost', '127.0.0.1']
          const isMainDomain = mainDomains.some(h => hostname === h)

          if (slug && isMainDomain && !hostname.includes('localhost')) {
            window.location.href = `https://${slug}.${tenantBase}?token=${data.token}`
            return { success: true, redirecting: true }
          }

          return { success: true }
        } catch (error) {
          set({ isLoading: false })
          return { success: false, error: getReadableAuthError(error) }
        }
      },

      // Bootstrap auth from token passed in URL (from subdomain redirect)
      setTokenFromUrl: (token) => {
        if (!token) return
        try {
          // Decode JWT to extract user info (basic decode without verification, since server validated it)
          const parts = token.split('.')
          if (parts.length !== 3) return
          const decoded = JSON.parse(atob(parts[1]))
          set({
            user: decoded,
            token,
            isAuthenticated: true,
          })
          // Call me endpoint to get full user info
          api.defaults.headers.common.Authorization = `Bearer ${token}`
          api.get('/auth/me', { timeout: 30000 }).then(({ data }) => {
            if (data.zona_horaria) setTimezone(data.zona_horaria)
            set({
              user: data,
              token,
              isAuthenticated: true,
              enabledModules: data.enabledModules || [],
            })
            // Remove token from URL
            window.history.replaceState({}, '', window.location.pathname)
          }).catch(() => {
            window.history.replaceState({}, '', window.location.pathname)
          })
        } catch (e) {
          console.error('Error setting token from URL:', e)
        }
      },

      logout: async () => {
        const { token, isAuthenticated } = get()
        try {
          if (token && isAuthenticated) {
            await api.post('/auth/logout')
          }
        } catch (_e) { /* ignore — token may already be expired */ }
        set({ user: null, token: null, isAuthenticated: false, enabledModules: [] })
        clearPersistedAuth()
      },

      refreshUser: async () => {
        try {
          const { data } = await api.get('/auth/me', { timeout: 30000 })
          if (data.zona_horaria) setTimezone(data.zona_horaria)
          set((state) => ({
            user: { ...state.user, ...data },
            enabledModules: data.enabledModules || state.enabledModules,
            backendOnline: true,
          }))
        } catch (e) {
          // Network error (no response) → backend is unreachable, stop polling
          if (!e.response) {
            set({ backendOnline: false })
            return
          }
          // Only logout on 401 (token truly invalid/expired).
          // Other errors (network, 5xx) should NOT trigger logout — prevents login loops.
          if (e.response?.status === 401) {
            set({ user: null, token: null, isAuthenticated: false, enabledModules: [] })
            clearPersistedAuth()
          }
          // Silently ignore non-auth errors to avoid disrupting the user session
        }
      },

      updateTimezone: async (zona_horaria) => {
        const { data } = await api.put('/auth/preferences', { zona_horaria })
        if (data.success) {
          setTimezone(zona_horaria)
          set((state) => ({ user: { ...state.user, zona_horaria } }))
        }
        return data
      },

      markTourComplete: async () => {
        try {
          await api.put('/auth/tour-complete')
          set((state) => ({ user: state.user ? { ...state.user, tour_completado: true } : state.user }))
        } catch (_e) { /* non-critical — ignore */ }
      },

      updateProfile: async ({ nombre, apellido }) => {
        const { data } = await api.put('/auth/profile', { nombre, apellido })
        if (data.success && data.user) {
          set((state) => ({ user: { ...state.user, ...data.user } }))
        }
        return data
      },

      // Permission check: hasPermission('dropscan.escaneo', 'crear')
      hasPermission: (modulePath, action) => {
        const { user } = get()
        if (!user) return false
        if (isTenantAdmin(user)) return true
        const level = getModuleLevel(user.permisos, modulePath)
        return resolvePermission(level, action)
      },

      // Get raw permission level: getPermissionLevel('dropscan.escaneo')
      getPermissionLevel: (modulePath) => {
        const { user } = get()
        if (!user) return 'sin_acceso'
        if (isTenantAdmin(user)) return 'eliminar'
        return getModuleLevel(user.permisos, modulePath)
      },

      canView: (modulePath) => {
        const { user } = get()
        if (!user) return false
        if (isTenantAdmin(user)) return true
        const level = getModuleLevel(user.permisos, modulePath)
        return level !== 'sin_acceso'
      },

      canWrite: (modulePath) => {
        const { user } = get()
        if (!user) return false
        if (isTenantAdmin(user)) return true
        const level = getModuleLevel(user.permisos, modulePath)
        return ['crear', 'actualizar', 'eliminar'].includes(level)
      },

      canDelete: (modulePath) => {
        const { user } = get()
        if (!user) return false
        if (isTenantAdmin(user)) return true
        const level = getModuleLevel(user.permisos, modulePath)
        return level === 'eliminar'
      },

      canUnlock: (modulePath) => {
        const { user } = get()
        if (!user) return false
        if (isTenantAdmin(user)) return true
        const level = getModuleLevel(user.permisos, modulePath)
        return level === 'eliminar'
      },

      // Check per-tenant module entitlement (from tenant_modules table)
      isModuleEnabled: (moduleCode) => {
        const { user, enabledModules } = get()
        if (!user) return false
        if (isTenantAdmin(user)) return true
        return enabledModules.includes(moduleCode)
      },
    }),
    {
      name: 'wms-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        enabledModules: state.enabledModules,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.user?.zona_horaria) setTimezone(state.user.zona_horaria)
      },
    }
  )
)

// Sync api.js network failure detection → Zustand backendOnline flag.
// This runs once at module load — no circular imports because api.js doesn't import authStore.
setBackendStatusCallback((online) => {
  useAuthStore.setState({ backendOnline: online })
})

setUnauthorizedCallback(() => {
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    enabledModules: [],
  })
  clearPersistedAuth()
})

// Provide token to api.js without creating a circular import
setGetTokenCallback(() => useAuthStore.getState().token)
