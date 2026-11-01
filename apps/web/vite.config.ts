import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { pwa } from './build/pwa';
import { singleFile } from './build/singleFile';

/**
 * Zwei Fassungen:
 * - `vite build` (Standard): Web-App mit Service Worker zum Installieren (PWA), für einen Webserver.
 * - `vite build --mode single`: alles in einer Datei `bestbpmn.html` zum Doppelklicken.
 */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    // Relative Pfade: Die App läuft in jedem Unterordner des Webservers und über file://.
    base: './',
    define: {
      __BESTBPMN_PWA__: JSON.stringify(!single && mode !== 'development'),
      __BESTBPMN_VERSION__: JSON.stringify(version),
    },
    publicDir: single ? false : 'public',
    plugins: single ? [singleFile()] : [pwa()],
    build: {
      outDir: single ? 'dist/single' : 'dist/web',
      emptyOutDir: true,
      // bpmn-js ist allein schon gut 500 kB groß; die einzelne Datei enthält alles.
      chunkSizeWarningLimit: 4000,
      // Grafiken und Schriften als data:-URL, damit die einzelne Datei nichts nachladen muss.
      ...(single ? { assetsInlineLimit: () => true, cssCodeSplit: false } : {}),
    },
    server: {
      // Erlaubt den Zugriff auf templates/ und packages/ im Repository-Root.
      fs: { allow: ['../..'] },
    },
  };
});
