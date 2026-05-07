const CACHE_NAME = 'kirion-v7'
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
