/**
 * sw.js — Service Worker di SafeHub Archivio.
 *
 * Strategia:
 *  - Asset locali: cache-first (avvio istantaneo)
 *  - CDN (Alpine, Tailwind): stale-while-revalidate (funziona offline, si aggiorna in background)
 *
 * Bump CACHE_VERSION ogni volta che cambiano asset locali cachati (CLAUDE.md §Git).
 */

const CACHE_VERSION = 'safehub-archivio-v33';  // bump: modulo Manuale (marked + manuale.js + MANUALE-UTENTE.md)

const ASSET_LOCALI = [
  './',
  './index.html',
  './manifest.json',
  './shared/styles.css',
  './shared/utils.js',
  './shared/idb.js',
  './shared/filesystem.js',
  './shared/notifiche.js',
  './shared/errori.js',
  './shared/a11y.js',
  './shared/cantiere-corrente.js',
  './shared/impostazioni-service.js',
  './shared/alpine-init.js',
  './vendor/pizzip.min.js',
  './vendor/docxtemplater.js',
  './shared/m6-motore-docx.js',
  './shared/flusso-b-helpers.js',
  './moduli/placeholder/placeholder.js',
  './moduli/impostazioni/impostazioni.js',
  './moduli/cantieri/cantieri.js',
  './shared/cantieri-service.js',
  './shared/anagrafica-service.js',
  './moduli/anagrafica/imprese.js',
  './moduli/anagrafica/lavoratori.js',
  './moduli/anagrafica/mezzi-attrezzature.js',
  './moduli/anagrafica/noli.js',
  './moduli/anagrafica/persone.js',
  './moduli/anagrafica/cruscotto-scadenze.js',
  './moduli/anagrafica/export-safecant.js',
  './moduli/verbale-riunione/verbale-riunione.js',
  './moduli/proposta-sospensione/proposta-sospensione.js',
  './moduli/disposizione-rl/disposizione-rl.js',
  './moduli/verifica-pos/verifica-pos.js',
  './moduli/verifica-itp/verifica-itp.js',
  './moduli/verbale-sopralluogo/verbale-sopralluogo.js',
  './moduli/numeri-utili/numeri-utili.js',
  './vendor/marked.min.js',
  './moduli/manuale/manuale.js',
  './MANUALE-UTENTE.md',
  './templates/template.docx',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdn.tailwindcss.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(ASSET_LOCALI))
      // skipWaiting DOPO che la cache è completamente popolata.
      // Se addAll fallisce, l'errore si propaga: l'install fallisce e il
      // vecchio SW resta in controllo (stato sicuro, l'utente vedrà la
      // versione precedente invece di una versione rotta).
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      // clients.claim() dentro waitUntil: il browser aspetta che sia
      // completato prima di considerare il SW pienamente attivo.
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // CDN: stale-while-revalidate — risponde dalla cache, aggiorna in background
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(e.request);
        const networkFetch = fetch(e.request)
          .then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; })
          .catch(() => null);
        return cached ?? await networkFetch;
      })
    );
    return;
  }

  // Asset locali: cache-first, con fallback 404 per risorse non trovate.
  // Senza il catch, se il browser chiede un file assente (es. favicon.ico)
  // il SW rigetta la Promise anziché rispondere con un errore HTTP.
  e.respondWith(
    caches.match(e.request).then(r =>
      r ?? fetch(e.request).catch(() => new Response('', { status: 404, statusText: 'Not Found' }))
    )
  );
});
