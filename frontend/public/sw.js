const CACHE_NAME = 'kirion-v11'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.png',
]

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Safe message handler for explicit SW commands.
// Avoids dangling async responses and only replies when a MessagePort exists.
self.addEventListener('message', (event) => {
  const data = event.data || {}
  const port = event.ports && event.ports[0]

  const reply = (payload) => {
    if (!port) return
    try {
      port.postMessage(payload)
    } catch {
      // Ignore channel closure races.
    }
  }

  if (data.type === 'SKIP_WAITING') {
    event.waitUntil((async () => {
      try {
        await self.skipWaiting()
        reply({ ok: true, type: 'SKIP_WAITING' })
      } catch (error) {
        reply({
          ok: false,
          type: 'SKIP_WAITING',
          error: error?.message || 'Failed to skip waiting',
        })
      }
    })())
    return
  }

  if (data.type === 'GET_VERSION') {
    reply({ ok: true, type: 'GET_VERSION', version: CACHE_NAME })
  }
})

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle http/https — skip chrome-extension://, data:, etc.
  if (!url.protocol.startsWith('http')) return

  // API calls: always network, never cache
  if (url.pathname.startsWith('/api')) return

  // Only cache same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Static assets: try network first, fall back to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  )
})
