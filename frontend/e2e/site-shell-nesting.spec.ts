import { expect, test } from '@playwright/test';

test('promotes an accidentally nested homepage and keeps exactly one SiteShell', async ({ page }) => {
  const childHtml = '<!doctype html><html><body><h1>Child</h1></body></html>';
  for (const name of ['zimage', 'enhance', 'klein', 'angle', 'online', 'gpt-chat', 'canvas', 'asset-manager', 'api-settings', 'comfyui-settings']) {
    await page.route(`**/static/${name}.html`, route => route.fulfill({ contentType: 'text/html', body: childHtml }));
  }
  await page.route('**/api/app-info', route => route.fulfill({ json: { version: '1.0.0' } }));
  await page.route('**/api/check-update', route => route.fulfill({ json: { current: '1.0.0', update_available: false, reachable: true } }));
  await page.route('**/api/queue_status?**', route => route.fulfill({ json: { total: 0, position: 0 } }));

  await page.goto('/static/index.html#/online');
  await expect(page.locator('.shell-sidebar')).toHaveCount(1);

  await page.evaluate(() => {
    const nestedShell = document.createElement('iframe');
    nestedShell.src = '/static/index.html#/canvas';
    document.body.append(nestedShell);
  });

  await expect(page).toHaveURL(/\/static\/index\.html#\/canvas$/);
  await expect(page.locator('.site-shell')).toHaveCount(1);
  await expect(page.locator('.shell-sidebar')).toHaveCount(1);
  await expect(page.locator('.shell-content iframe')).toHaveCount(1);
});
