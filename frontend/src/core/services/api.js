import axios from 'axios'
import { useOfflineStore } from '../stores/offlineStore'
import { captureApiError } from './errorTelemetry'

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
      // In local development, route API traffic through the app origin so Vite's
      // proxy handles the backend hop and the browser avoids direct localhost calls.
      baseUrl = isLocalApi && isLocalPage ? buildSameOriginApiUrl('/api') : (
        isLocalApi && !isLocalPage ? buildSameOriginApiUrl('/api') : configured
      )
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
let backendUnavailableUntil = 0
const BACKEND_COOLDOWN_MS = 8000

// Per-endpoint 429 cooldown: key = url prefix, value = timestamp when cooldown expires
const rateLimitCooldowns = new Map()
const RATE_LIMIT_COOLDOWN_MS = 30000

function parseRetryAfterMs(value) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000

  const retryAt = Date.parse(value)
  if (!Number.isNaN(retryAt)) return Math.max(retryAt - Date.now(), 0)

  return null
}

// Callback registered by authStore to sync backendOnline Zustand state.
// Using a callback avoids circular imports (authStore imports api.js).
let _onBackendStatus = null
export function setBackendStatusCallback(cb) {
  _onBackendStatus = cb
}

let _onUnauthorized = null
export function setUnauthorizedCallback(cb) {
  _onUnauthorized = cb
}

// Returns the current auth token without importing authStore (would be circular).
// Registered by authStore at startup.
let _getToken = null
export function setGetTokenCallback(cb) {
  _getToken = cb
}

function isProtectedAuthRequest(config) {
  const url = String(config?.url || '')
  return url.includes('/auth/login') || url.includes('/auth/logout')
}

function shouldSkipBackendCooldown(config) {
  const method = String(config?.method || 'get').toLowerCase()
  if (method !== 'get') return true
  return isProtectedAuthRequest(config)
}

// Request interceptor - attach token and check cooldowns
api.interceptors.request.use((config) => {
  if (!shouldSkipBackendCooldown(config) && Date.now() < backendUnavailableUntil) {
    const error = new Error('Backend temporarily unavailable')
    error.code = 'ERR_BACKEND_UNAVAILABLE'
    error.config = config
    return Promise.reject(error)
  }

  // Block GET requests to rate-limited endpoints during cooldown
  const method = String(config?.method || 'get').toLowerCase()
  if (method === 'get' && config.url) {
    const urlKey = String(config.url).split('?')[0]
    const cooldownUntil = rateLimitCooldowns.get(urlKey)
    if (cooldownUntil && Date.now() < cooldownUntil) {
      const error = new Error('Rate limit cooldown active')
      error.code = 'ERR_RATE_LIMITED'
      error.config = config
      return Promise.reject(error)
    }
  }

  // If url is absolute, don't touch it. 
  // If it's relative, ensure it DOES NOT start with / to avoid Axios overriding baseURL path
  if (typeof config.url === 'string' && config.url && !/^https?:\/\//i.test(config.url)) {
    config.url = config.url.startsWith('/') ? config.url.slice(1) : config.url
  }
  const token = _getToken?.()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor - handle 401 gracefully
api.interceptors.response.use(
  (response) => {
    // First success after an outage — notify store
    if (backendUnavailableUntil > 0) {
      backendUnavailableUntil = 0
      _onBackendStatus?.(true)
    }
    useOfflineStore.getState().clearConnectionIssue()
    return response
  },
  async (error) => {
    captureApiError(error)
    // ECONNABORTED = axios request timeout (response took too long).
    // This means the server is slow, not necessarily down — don't blackout all queries.
    const isAxiosTimeout = error.code === 'ECONNABORTED'
    const isNetworkFailure = !error.response && !isAxiosTimeout && (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNREFUSED' ||
      /Network Error/i.test(error.message || '')
    )
    const isServiceUnavailable = [502, 503, 504].includes(error.response?.status)

    // Auto-retry once on 503 (transient DB pool exhaustion) before declaring backend down.
    // Only retry GET requests and only if this is the first attempt.
    const method = String(error.config?.method || 'get').toLowerCase()
    if (error.response?.status === 503 && method === 'get' && !error.config?._retried503) {
      error.config._retried503 = true
      await new Promise(r => setTimeout(r, 1500))
      try {
        return await api.request(error.config)
      } catch (retryErr) {
        // If retry also fails, fall through to normal error handling below
        const retryError = retryErr
        retryError._retried503 = true
        captureApiError(retryError)
      }
    }

    if ((isNetworkFailure || isServiceUnavailable) && !shouldSkipBackendCooldown(error.config)) {
      backendUnavailableUntil = Date.now() + BACKEND_COOLDOWN_MS
      _onBackendStatus?.(false)
      useOfflineStore.getState().setConnectionDegraded(
        isNetworkFailure ? 'network_failure' : 'server_unavailable'
      )
    }

    // 429: set a per-endpoint cooldown so subsequent GET requests are blocked immediately
    if (error.response?.status === 429 && error.config?.url) {
      const urlKey = String(error.config.url).split('?')[0]
      const retryAfterMs = parseRetryAfterMs(error.response.headers?.['retry-after'])
      const cooldownMs = retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS
      rateLimitCooldowns.set(urlKey, Date.now() + cooldownMs)
      // Auto-clear after cooldown so the endpoint becomes usable again
      setTimeout(() => rateLimitCooldowns.delete(urlKey), cooldownMs)
    }

    if (error.response?.status === 401) {
      const isLoginRequest = error.config?.url?.includes('/auth/login')
      // /auth/me 401 means the session expired during a background poll — logout but don't
      // redirect to login if the user is already navigating away (handled by isHandling401).
      const isAuthMeRequest = error.config?.url?.includes('/auth/me')

      if (!isLoginRequest && !isAuthMeRequest && !isHandling401) {
        isHandling401 = true

        _onUnauthorized?.()

        // Clear auth state via localStorage as a fallback
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
