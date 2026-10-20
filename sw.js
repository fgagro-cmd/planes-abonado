// Service worker: la app abre sin conexión (caché primero, se actualiza en segundo plano).
// Al cambiar cualquier fichero de la app, sube VERSION (y APP_VERSION en app.js).
const VERSION = 'v1.1.0';
const CACHE = 'planes-abonado-' + VERSION;
const ASSETS = [
  './', 'index.html', 'style.css', 'app.js', 'calc.js', 'importar.js', 'almacen.js', 'nube.js', 'pdf.js', 'maestros.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'vendor/xlsx.mini.min.js', 'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js'
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('planes-abonado-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => {
    const net = fetch(e.request).then((r) => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => null);
    return hit || net.then((r) => r || caches.match('index.html'));
  }));
});
