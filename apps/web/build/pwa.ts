import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Installierbare Web-App (PWA): verweist auf das Manifest und schreibt einen Service Worker,
 * der alle Dateien des Builds vorhält. So startet bestbpmn auch ohne Verbindung zum Webserver.
 * Jeder Build bekommt einen eigenen Cache-Namen; der alte wird nach dem Wechsel gelöscht.
 */
export function pwa(): Plugin {
  return {
    name: 'bestbpmn-pwa',
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: 'manifest.webmanifest' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: 'icon-192.png' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0969da' }, injectTo: 'head' },
      ];
    },
    generateBundle(_options, bundle) {
      const files = ['./', ...Object.keys(bundle), 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'].sort();
      const hash = createHash('sha256');
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name]!;
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      const cache = `bestbpmn-${hash.digest('hex').slice(0, 12)}`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(cache, files) });
    },
  };
}

function serviceWorker(cache: string, files: string[]): string {
  return `// Erzeugt beim Build von bestbpmn. Hält die App für den Offline-Betrieb vor.
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('bestbpmn-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Die Seite bittet darum, wenn die Person „Neu laden“ wählt.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Erst aus dem Cache, sonst aus dem Netz. Die App lädt nichts von fremden Servern.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(event.request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || (event.request.mode === 'navigate' ? cache.match('./') : undefined)).then((hit) => hit || fetch(event.request)),
    ),
  );
});
`;
}
