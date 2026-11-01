import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  define: { __BESTBPMN_PWA__: 'false', __BESTBPMN_VERSION__: '"test"' },
  server: { fs: { allow: ['../..'] } },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
