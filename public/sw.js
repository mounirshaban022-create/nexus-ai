/* ==================================================================
 * NEXUS service worker — makes the chat installable & offline-aware.
 *
 * Strategy (deliberately conservative — this is a live AI app):
 *   • App shell + icons + fonts: stale-while-revalidate cache.
 *   • Navigation requests: network-first with cached shell fallback
 *     (users always get fresh UI when online, a working shell offline).
 *   • /api/*: NEVER cached — chat streams, generation jobs and auth
 *     must always hit the network.
 * ================================================================== */

const VERSION = 'nexus-v1'
const SHELL_CACHE = `${VERSION}-shell`

const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Live data must never be served from a cache.
  if (url.pathname.startsWith('/api/')) return

  // Navigations: network first, cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error()))
    )
    return
  }

  // Static assets: stale-while-revalidate.
  if (/\.(?:css|js|woff2?|png|jpe?g|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const fetching = fetch(request)
          .then((res) => {
            const copy = res.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
            return res
          })
          .catch(() => hit || Response.error())
        return hit || fetching
      })
    )
  }
})
