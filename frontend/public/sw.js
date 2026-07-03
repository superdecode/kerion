const CACHE_NAME = 'kirion-v16'
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

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Never cache Vite dev-server internals
  if (
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.includes('/.vite/')
  ) return

  // Hashed JS/CSS assets: cache-first (filenames contain content hash, safe to cache forever)
  const isHashedAsset = url.pathname.startsWith('/assets/')
  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        // If network fails and asset not cached, propagate the error
        // so the browser shows a proper error instead of receiving HTML
      })
    )
    return
  }

  // Navigation requests (HTML pages): network-first, fall back to install-time cached shell.
  // Do NOT cache navigation responses — security checkpoints or other platform-level pages
  // returned as 200 would otherwise overwrite the app shell in the cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    )
    return
  }

  // Other static files (logo.png, manifest.json, etc.): network-first, fall back to cache only
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
