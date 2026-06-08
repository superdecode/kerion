import axios from 'axios'

function buildSameOriginApiUrl(pathname = '/api') {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return new URL(normalizedPath, window.location.origin).toString()
}

function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_URL || '').trim()
  let baseUrl = ''

  if (!configured) {
    baseUrl = buildSameOriginApiUrl('/api')
  } else if (/^https?:\/\//i.test(configured)) {
    try {
      const url = new URL(configured)
      const isLocalApi = ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)
      const isLocalPage = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)
      baseUrl = isLocalApi && !isLocalPage ? buildSameOriginApiUrl('/api') : configured
    } catch {
      baseUrl = buildSameOriginApiUrl('/api')
    }
  } else {
    baseUrl = buildSameOriginApiUrl(configured)
  }

  // Ensure trailing slash for Axios baseURL consistency
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
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
  // If url is absolute, don't touch it. 
  // If it's relative, ensure it DOES NOT start with / to avoid Axios overriding baseURL path
  if (typeof config.url === 'string' && config.url && !/^https?:\/\//i.test(config.url)) {
    config.url = config.url.startsWith('/') ? config.url.slice(1) : config.url
  }
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
