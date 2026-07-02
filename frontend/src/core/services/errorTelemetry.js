import { useAuthStore } from '../stores/authStore'

const reportedFingerprints = new Set()
const MAX_FIELD = 4000

function truncate(value, max = MAX_FIELD) {
  if (value === null || value === undefined) return null
  const str = String(value)
  return str.length > max ? `${str.slice(0, max)}...` : str
}

function normalizeUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value, window.location.origin)
    return `${url.pathname}${url.search}`
  } catch {
    return String(value).slice(0, 500)
  }
}

function getToken() {
  try {
    return useAuthStore.getState().token || localStorage.getItem('token') || null
  } catch {
    return null
  }
}

function makeFingerprint(payload) {
  return [
    payload.source || 'frontend',
    payload.message || '',
    payload.route || '',
    payload.api_url || '',
    payload.http_status || '',
  ].join('|').slice(0, 500)
}

export function captureErrorEvent(input = {}) {
  const token = getToken()
  if (!token) return

  const payload = {
    source: input.source || 'frontend',
    severity: input.severity || 'error',
    message: truncate(input.message || input.error?.message || 'Error inesperado', 1000),
    stack: truncate(input.stack || input.error?.stack),
    component_stack: truncate(input.componentStack || input.component_stack),
    page_url: normalizeUrl(input.page_url || window.location.href),
    route: window.location.pathname,
    http_method: input.http_method || null,
    http_status: input.http_status || null,
    api_url: normalizeUrl(input.api_url),
    metadata: input.metadata || {},
  }
  payload.fingerprint = input.fingerprint || makeFingerprint(payload)

  if (reportedFingerprints.has(payload.fingerprint)) return
  reportedFingerprints.add(payload.fingerprint)

  const body = JSON.stringify(payload)
  const url = '/api/support/error-event'

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
    keepalive: true,
  }).catch(() => {})
}

export function captureApiError(error) {
  const status = error?.response?.status || null
  const isNetwork = !error?.response
  if (!isNetwork && status < 500) return

  captureErrorEvent({
    source: 'api',
    severity: status >= 500 || isNetwork ? 'error' : 'warning',
    message: error?.response?.data?.error || error?.message || 'API request failed',
    stack: error?.stack,
    http_method: error?.config?.method?.toUpperCase() || null,
    http_status: status,
    api_url: error?.config?.url || null,
    metadata: {
      code: error?.code || null,
      detail: error?.response?.data?.detalle || null,
    },
  })
}
