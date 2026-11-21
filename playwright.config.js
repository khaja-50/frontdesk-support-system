import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'node e2e/server.js', url: 'http://127.0.0.1:4175/health', reuseExistingServer: false },
});
