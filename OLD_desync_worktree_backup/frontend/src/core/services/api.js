import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// Track whether we're already handling a 401 redirect to prevent loops
let isHandling401 = false

// Request interceptor - attach token
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('wms-auth')
  if (stored) {
    try {
      const { state } = JSON.parse(stored)
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`
      }
    } catch (e) { /* ignore */ }
  }
  return config
})

// Response interceptor - handle 401 gracefully
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isLoginRequest = error.config?.url?.includes('/auth/login')
      const isAuthMeRequest = error.config?.url?.includes('/auth/me')

      if (!isLoginRequest && !isHandling401) {
        isHandling401 = true

        // Clear auth state via localStorage (Zustand persist will pick this up)
        localStorage.removeItem('wms-auth')

        // Use soft redirect instead of hard reload to prevent login loops.
        // Skip redirect on super-admin paths — those have their own auth flow.
        const currentPath = window.location.pathname
        const isOnPublicOrAdminPath = currentPath === '/login' || currentPath.startsWith('/super-admin')
        if (!isOnPublicOrAdminPath) {
          window.history.replaceState(null, '', '/login')
          // Dispatch a popstate so React Router picks up the change
          window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
        }

        // Reset guard after 2 seconds to allow future redirects if needed
        setTimeout(() => { isHandling401 = false }, 2000)
      }
    }
    return Promise.reject(error)
  }
)

export default api
