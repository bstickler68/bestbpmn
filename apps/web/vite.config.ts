import { defineConfig } from 'vite';

export default defineConfig({
  // bpmn-js ist allein schon gut 500 kB groß.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    // Erlaubt den Zugriff auf templates/ und packages/ im Repository-Root.
    fs: { allow: ['../..'] },
  },
});
