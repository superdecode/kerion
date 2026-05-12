import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAdminAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      admin: null,
      isAuthenticated: false,

      login: (token, admin) => set({ token, admin, isAuthenticated: true }),
      logout: () => set({ token: null, admin: null, isAuthenticated: false }),
      getToken: () => get().token,
    }),
    { name: 'kirion-admin-auth' }
  )
)
