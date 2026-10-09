// Service Worker der iPhone-App: erst das Netz (frische Daten nach /lern-session, /ki-news),
// bei Funkloch oder nach TIMEOUT der zuletzt geladene Stand aus dem Cache.
'use strict';
const CACHE = 'kilp-v1';   // nur erhöhen, wenn sich SHELL ändert
const SHELL = ['./', 'manifest.webmanifest', 'data/plan.js', 'data/log.js', 'data/news.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const TIMEOUT = 4000;
const SEITE = new URL('./', self.registration.scope).href;   // alle Seitenaufrufe teilen sich einen Eintrag

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kilp-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Quellen-Links usw. nicht anfassen
  const seite = req.mode === 'navigate';
  url.search = '';
  const key = seite ? SEITE : url.href;
  // no-cache: GitHub Pages erlaubt 10 Min. HTTP-Cache – so kommen neue Einträge sofort an (304 kostet kaum etwas).
  const netz = fetch(seite ? req : new Request(req, { cache: 'no-cache' }));
  e.waitUntil(netz.then((res) => {
    if (!res.ok || res.type !== 'basic' || res.redirected) return;
    // Wer data/news.js o. Ä. direkt im Tab öffnet, darf damit nicht die Startseite im Cache ersetzen.
    if (seite && !(res.headers.get('content-type') || '').includes('text/html')) return;
    const kopie = res.clone();   // sofort klonen, bevor die Seite den Body liest
    return caches.open(CACHE).then((c) => c.put(key, kopie));
  }).catch(() => {}));
  e.respondWith(antwort(netz, key));
});

async function antwort(netz, key) {
  let res;
  try {
    res = await Promise.race([netz, new Promise((r) => setTimeout(r, TIMEOUT))]);
    if (res && (res.ok || res.type === 'opaqueredirect')) return res;
  } catch (err) { /* offline */ }   // 404/5xx/Zeitüberschreitung: lieber der letzte gute Stand
  const alt = await caches.match(key, { cacheName: CACHE });
  return alt || res || netz;   // ohne Cache-Eintrag weiter aufs Netz warten
}
