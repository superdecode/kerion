import { useAuthStore } from '../stores/authStore'

// Time-windowed dedup instead of report-once-per-session. Warehouse tabs stay open for a
// full shift; a permanent Set meant a recurring error was sent exactly once and the
// backend `occurrences` counter never reflected how often it actually happened — which is
// the single most useful signal when triaging a production issue. Re-allow the same
// fingerprint after DEDUP_WINDOW_MS so the backend (which increments occurrences on repeat)
// sees real frequency, while still throttling a hot loop to at most one POST per window.
const DEDUP_WINDOW_MS = 2 * 60 * 1000
const lastSentByFingerprint = new Map()
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

  const now = Date.now()
  const lastSent = lastSentByFingerprint.get(payload.fingerprint)
  if (lastSent && now - lastSent < DEDUP_WINDOW_MS) return
  lastSentByFingerprint.set(payload.fingerprint, now)
  // Bound the map so a tab that hits many distinct errors over a shift can't grow it
  // unbounded — evict the oldest entries once it gets large.
  if (lastSentByFingerprint.size > 200) {
    const cutoff = now - DEDUP_WINDOW_MS
    for (const [fp, ts] of lastSentByFingerprint) {
      if (ts < cutoff) lastSentByFingerprint.delete(fp)
    }
  }

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
