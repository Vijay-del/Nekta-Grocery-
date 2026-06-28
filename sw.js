// Nekta SW v21 — Network-first JS/CSS, instant deploy updates
// Change this version string on EVERY deploy to bust old caches
const CACHE_VERSION = 'nekta-v23';
const CACHE = CACHE_VERSION;

// Only cache truly static assets that never change between deploys
const STATIC_IMMUTABLE = [
  '/images/nektaIcon.svg',
  '/images/UserAppIcon.jpeg',
  '/images/riderAppIcon.jpeg',
  '/images/SellerAppIcon.jpeg',
  '/css/all.min.css',
  '/js/xlsx.min.js',
  '/js/chart.umd.min.js',
  '/js/lottie.min.js',
  '/js/bcrypt.min.js',
  '/js/firebase-app-compat.js',
  '/js/firebase-auth-compat.js',
  '/js/firebase-firestore-compat.js',
  '/js/firebase-database-compat.js',
];

self.addEventListener('install', e => {
  // Skip waiting — take control immediately on deploy
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // Only pre-cache immutable vendor files
      Promise.allSettled(
        STATIC_IMMUTABLE.map(u => c.add(new Request(u, { cache: 'reload' })))
      )
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() =>
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }))
      )
    )
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;

  // ── ALWAYS NETWORK: Firebase, Maps, routing APIs, external CDNs ──
  if (
    url.includes('firestore.googleapis') ||
    url.includes('firebase') ||
    url.includes('googleapis.com/maps') ||
    url.includes('osrm.org') ||
    url.includes('openrouteservice') ||
    url.includes('cartocdn.com') ||
    url.includes('unpkg.com') ||
    url.includes('lottie.host') ||
    url.includes('twilio') ||
    url.includes('gtag') ||
    url.includes('googletagmanager') ||
    url.includes('fonts.googleapis') ||
    url.includes('fonts.gstatic')
  ) {
    // Pure network — no caching for live data
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // ── HTML pages — NETWORK FIRST, no cache fallback for HTML ──
  // This ensures deploys are always seen immediately
  if (
    url.endsWith('.html') ||
    url.endsWith('/') ||
    (!url.includes('.') && url.startsWith(self.location.origin))
  ) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => res)
        .catch(() =>
          // Offline fallback only
          caches.match(e.request).then(r => r || caches.match('/index.html'))
        )
    );
    return;
  }

  // ── JS / CSS — NETWORK FIRST with 5s timeout, cache as fallback ──
  // Network first = users always get latest code after deploy
  if (url.includes('/js/') || url.includes('/css/')) {
    e.respondWith(
      Promise.race([
        fetch(e.request, { cache: 'no-cache' }).then(res => {
          if (res.ok) {
            // Update cache in background for offline fallback
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }),
        // 5 second timeout → fall back to cache
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]).catch(() =>
        caches.match(e.request)
      )
    );
    return;
  }

  // ── Images — cache-first (images don't change often) ──
  if (url.includes('/images/') && url.startsWith(self.location.origin)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => caches.match('/images/nektaIcon.svg'));
      })
    );
    return;
  }

  // ── Everything else — network with cache fallback ──
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
