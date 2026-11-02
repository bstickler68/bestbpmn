import type { TFunction } from '@bestbpmn/i18n';

/**
 * Service Worker der installierbaren Web-App. Nur vom Webserver (http/https), nicht in der
 * einzelnen Datei über file://. Gibt es eine neue Version, erscheint ein Hinweis mit „Neu laden“;
 * ohne Klick gilt die neue Version beim nächsten Start.
 */
export function registerServiceWorker(banner: HTMLElement, t: () => TFunction): void {
  if (!__BESTBPMN_PWA__ || !('serviceWorker' in navigator) || !location.protocol.startsWith('http')) {
    return;
  }
  const offer = (worker: ServiceWorker): void => {
    banner.innerHTML = '';
    const text = document.createElement('span');
    text.textContent = t()('app.update.available');
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = t()('app.update.reload');
    reload.addEventListener('click', () => {
      requested = true;
      worker.postMessage('skipWaiting');
    });
    banner.append(text, reload);
    banner.hidden = false;
  };
  // Neu laden nur, wenn die Person es gewählt hat; beim ersten Besuch übernimmt der Worker still.
  let requested = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (requested) {
      requested = false;
      location.reload();
    }
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        offer(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          // Nur bei einem Update fragen; beim ersten Besuch gibt es noch keinen alten Worker.
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            offer(worker);
          }
        });
      });
    })
    .catch(() => {
      // Ohne Service Worker läuft die App trotzdem, nur nicht offline.
    });
}

/** Installierte App: Doppelklick auf eine `.bpmn`-Datei öffnet sie in bestbpmn (Edge, Chrome). */
export function handleLaunchedFiles(open: (text: Promise<string>, fileName: string) => void): void {
  const queue = (window as unknown as { launchQueue?: { setConsumer(consumer: (params: { files: FileSystemFileHandle[] }) => void): void } })
    .launchQueue;
  queue?.setConsumer(({ files }) => {
    const handle = files?.[0];
    if (handle) {
      open(handle.getFile().then((file) => file.text()), handle.name);
    }
  });
}
