import { expect, test } from '@playwright/test';

test('keeps the original Smart Canvas UI as the production default', async ({ page }) => {
  await page.goto('/static/smart-canvas.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#shell')).toBeVisible();
  await expect(page.locator('#world')).toBeVisible();
  await expect(page.locator('#composer')).toBeAttached();
  await expect(page.locator('.smart-nav')).toBeVisible();
  await expect(page.locator('#smartWorkflowToggle')).toBeAttached();
  await expect(page.locator('#assetToggle')).toBeAttached();
  await expect(page.locator('#minimap')).toBeAttached();
  await expect(page.locator('#smartCanvasApp')).toHaveCount(0);
  await expect(page.getByTestId('smart-canvas-composer')).toHaveCount(0);

  const resources = await page.evaluate(() => ({
    scripts: [...document.scripts].map((script) => script.src),
    styles: [...document.styleSheets].map((sheet) => sheet.href),
  }));
  expect(resources.scripts.some((src) => /\/static\/js\/smart-canvas\.js/.test(src))).toBe(true);
  expect(resources.scripts.some((src) => /\/static\/dist\/smart-canvas-modern\.js/.test(src))).toBe(false);
  expect(resources.styles.some((href) => /\/static\/css\/smart-canvas\.css/.test(href || ''))).toBe(true);
});
