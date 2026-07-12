const CACHE_NAME = 'kirion-v20'
const STATIC_ASSETS = [
  '/',
  '/logo.png',
]

const OFFLINE_HTML = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reconectando...</title>
<meta http-equiv="refresh" content="4">
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f7f5}
p{color:#6b7280;font-size:1rem;text-align:center}</style>
</head><body><p>Reconectando con el servidor...<br>La página se actualizará en unos segundos.</p></body></html>`

// Install: cache app shell
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => {})
    )
  )
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Safe message handler for explicit SW commands.
self.addEventListener('message', (event) => {
  const data = event.data || {}
  const port = event.ports && event.ports[0]

  const reply = (payload) => {
    if (!port) return
    try { port.postMessage(payload) } catch {}
  }

  if (data.type === 'SKIP_WAITING') {
    event.waitUntil((async () => {
      try {
        await self.skipWaiting()
        reply({ ok: true, type: 'SKIP_WAITING' })
      } catch (error) {
        reply({ ok: false, type: 'SKIP_WAITING', error: error?.message || 'Failed' })
      }
    })())
    return
  }

  if (data.type === 'GET_VERSION') {
    reply({ ok: true, type: 'GET_VERSION', version: CACHE_NAME })
  }
})

// Fetch: network-first for API, cache-first for static assets.
// All respondWith() paths must never reject and never resolve to undefined.
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle http/https — skip chrome-extension://, data:, etc.
  if (!url.protocol.startsWith('http')) return

  // API calls: always network, never cache
  if (url.pathname.startsWith('/api')) return

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Never intercept Vite dev-server internals
  if (
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.includes('/.vite/')
  ) return

  // Hashed JS/CSS assets: cache-first, then network.
  // .catch() ensures respondWith never rejects — a network failure returns 503
  // rather than a silent blank page.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            // Clone synchronously before the body is consumed by respondWith.
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
      }).catch(() => new Response('', { status: 503, statusText: 'Service Unavailable' }))
    )
    return
  }

  // Navigation requests (HTML): network-first, fall back to cached shell,
  // then a self-refreshing offline page — never resolves to undefined.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then((r) =>
          r || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        )
      )
    )
    return
  }

  // Other static files (logo.png, manifest.json, etc.): network-first, cache fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          // Clone synchronously before the body is consumed by respondWith.
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() =>
        caches.match(request).then((r) =>
          r || new Response('', { status: 503, statusText: 'Service Unavailable' })
        )
      )
  )
})
