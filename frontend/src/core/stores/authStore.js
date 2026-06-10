import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api.js'
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

function getModuleLevel(permisos, modulePath) {
  if (!permisos || !modulePath) return 'sin_acceso'
  const parts = (MODULE_ALIASES[modulePath] || modulePath).split('.')
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

// Prefer the es_admin_tenant flag introduced in migration 041.
// Fall back to rol_nombre string for tokens issued before that migration (1-release compat).
function isTenantAdmin(user) {
  if (!user) return false
  if (user.es_admin_tenant === true) return true
  if (user.es_admin_tenant === undefined && user.rol_nombre === 'Administrador') return true
  return false
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          // Usar mock data en desarrollo
          if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
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
          const { data } = await api.post('/auth/login', { email, password })
          if (data.user?.zona_horaria) setTimezone(data.user.zona_horaria)
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
          })

          // Subdomain redirect: if on main domain and slug available, redirect to tenant subdomain
          const slug = data.user?.slug
          const hostname = window.location.hostname
          const tenantBase = import.meta.env.VITE_TENANT_BASE_DOMAIN || 'kirion.co'
          const mainDomains = [tenantBase, `www.${tenantBase}`, 'kirion.vercel.app', 'localhost', '127.0.0.1']
          const isMainDomain = mainDomains.some(h => hostname === h)

          if (slug && isMainDomain && !hostname.includes('localhost')) {
            window.location.href = `https://${slug}.${tenantBase}?token=${data.token}`
            return { success: true, redirecting: true }
          }

          return { success: true }
        } catch (error) {
          set({ isLoading: false })
          let errorMsg = 'Error de conexión'
          if (error.response?.data?.error) {
            const err = error.response.data.error
            errorMsg = typeof err === 'object' ? (err.message || JSON.stringify(err)) : err
          } else if (error.message) {
            errorMsg = error.message
          }
          return { success: false, error: errorMsg }
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
          api.get('/auth/me').then(({ data }) => {
            if (data.zona_horaria) setTimezone(data.zona_horaria)
            set({
              user: data,
              token,
              isAuthenticated: true,
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
        try {
          await api.post('/auth/logout')
        } catch (_e) { /* ignore — token may already be expired */ }
        set({ user: null, token: null, isAuthenticated: false })
        localStorage.removeItem('wms-auth')
      },

      refreshUser: async () => {
        try {
          const { data } = await api.get('/auth/me')
          if (data.zona_horaria) setTimezone(data.zona_horaria)
          set((state) => ({ user: { ...state.user, ...data } }))
        } catch (e) {
          // Only logout on 401 (token truly invalid/expired).
          // Other errors (network, 5xx) should NOT trigger logout — prevents login loops.
          if (e.response?.status === 401) {
            get().logout()
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
    }),
    {
      name: 'wms-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.user?.zona_horaria) setTimezone(state.user.zona_horaria)
      },
    }
  )
)
