import { expect, test } from '@playwright/test';

test('serves Smart Canvas from the React production entry without legacy scripts', async ({ page }) => {
  await page.goto('/static/smart-canvas.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#smartCanvasApp')).toBeAttached();
  await expect(page.locator('.canvas-modern-manager')).toBeVisible();
  await expect(page.locator('#shell')).toHaveCount(0);
  await expect(page.locator('#world')).toHaveCount(0);
  await expect(page.getByTestId('smart-canvas-composer')).toHaveCount(0);

  const resources = await page.evaluate(() => ({
    scripts: [...document.scripts].map((script) => script.src),
    styles: [...document.styleSheets].map((sheet) => sheet.href),
  }));
  expect(resources.scripts.some((src) => /\/static\/dist\/smart-canvas-modern\.js/.test(src))).toBe(true);
  expect(resources.scripts.some((src) => /\/static\/js\/(smart-canvas|canvas-core|canvas-api)\.js/.test(src))).toBe(false);
  expect(resources.styles.some((href) => /\/static\/css\/canvas\.css/.test(href || ''))).toBe(true);
  expect(resources.styles.some((href) => /\/static\/css\/smart-canvas\.css/.test(href || ''))).toBe(false);
});
