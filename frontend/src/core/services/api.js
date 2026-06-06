import axios from 'axios'

function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_URL || '').trim()
  if (!configured) return '/api'

  if (/^https?:\/\//i.test(configured)) {
    try {
      const url = new URL(configured)
      const isLocalApi = ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)
      const isLocalPage = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)
      return isLocalApi && !isLocalPage ? '/api' : configured
    } catch {
      return '/api'
    }
  }

  return configured.startsWith('/') ? configured : `/${configured}`
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
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
