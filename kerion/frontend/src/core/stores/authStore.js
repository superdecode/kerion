import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api.js'
import { mockLogin, mockAuthMe } from '../services/mockAuth.js'

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

function getModuleLevel(permisos, modulePath) {
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
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
          })
          return { success: true }
        } catch (error) {
          set({ isLoading: false })
          return { 
            success: false, 
            error: error.response?.data?.error || 'Error de conexión' 
          }
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
        localStorage.removeItem('wms-auth')
      },

      refreshUser: async () => {
        try {
          const { data } = await api.get('/auth/me')
          set((state) => ({ user: { ...state.user, ...data } }))
        } catch (e) {
          get().logout()
        }
      },

      // Permission check: hasPermission('dropscan.escaneo', 'crear')
      hasPermission: (modulePath, action) => {
        const { user } = get()
        if (!user) return false
        if (user.rol_nombre === 'Administrador') return true
        const level = getModuleLevel(user.permisos, modulePath)
        return resolvePermission(level, action)
      },

      // Get raw permission level: getPermissionLevel('dropscan.escaneo')
      getPermissionLevel: (modulePath) => {
        const { user } = get()
        if (!user) return 'sin_acceso'
        if (user.rol_nombre === 'Administrador') return 'total'
        return getModuleLevel(user.permisos, modulePath)
      },

      canView: (modulePath) => {
        const { user } = get()
        if (!user) return false
        if (user.rol_nombre === 'Administrador') return true
        const level = getModuleLevel(user.permisos, modulePath)
        return level !== 'sin_acceso'
      },

      canWrite: (modulePath) => {
        const { user } = get()
        if (!user) return false
        if (user.rol_nombre === 'Administrador') return true
        const level = getModuleLevel(user.permisos, modulePath)
        return ['escritura', 'gestion', 'total'].includes(level)
      },

      canDelete: (modulePath) => {
        const { user } = get()
        if (!user) return false
        if (user.rol_nombre === 'Administrador') return true
        const level = getModuleLevel(user.permisos, modulePath)
        return ['gestion', 'total'].includes(level)
      },

      canUnlock: (modulePath) => {
        const { user } = get()
        if (!user) return false
        if (user.rol_nombre === 'Administrador') return true
        const level = getModuleLevel(user.permisos, modulePath)
        return level === 'total'
      },
    }),
    {
      name: 'wms-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
