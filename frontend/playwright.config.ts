import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:6005',
    headless: true,
  },
  webServer: {
    command: '.\\python\\python.exe main.py',
    cwd: '..',
    env: { CANVAS_ROLLOUT_METRICS_DISABLED: 'true', SERVER_PORT: '6005' },
    reuseExistingServer: false,
    timeout: 30_000,
    url: 'http://127.0.0.1:6005/static/canvas.html',
  },
});
