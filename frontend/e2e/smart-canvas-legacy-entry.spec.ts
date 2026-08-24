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
  await expect(page.locator('html')).toHaveAttribute('data-smart-canvas-react', 'disabled');
  await expect(page.locator('#smartCanvasApp')).toBeHidden();
  await expect(page.getByTestId('smart-canvas-composer')).toHaveCount(0);

  const resources = await page.evaluate(() => ({
    scripts: [...document.scripts].map((script) => script.src),
    styles: [...document.styleSheets].map((sheet) => sheet.href),
  }));
  expect(resources.scripts.some((src) => /\/static\/js\/smart-canvas\.js/.test(src))).toBe(true);
  expect(resources.scripts.some((src) => /\/static\/dist\/smart-canvas-modern\.js/.test(src))).toBe(false);
  expect(resources.styles.some((href) => /\/static\/css\/smart-canvas\.css/.test(href || ''))).toBe(true);
});

test('mounts the React candidate from the real Smart Canvas entry without loading the legacy runtime', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));

  await page.goto('/static/smart-canvas.html?smart_canvas_react=1');

  await expect(page.locator('html')).toHaveAttribute('data-smart-canvas-react', 'enabled');
  await expect(page.locator('#shell')).toBeHidden();
  await expect(page.locator('#smartCanvasApp')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('#smartCanvasApp > .canvas-modern-manager')).toBeVisible();

  const isolation = await page.evaluate(() => ({
    legacyApi: typeof (window as typeof window & { CanvasApi?: unknown }).CanvasApi,
    legacyGlobal: typeof (window as typeof window & { addSmartNode?: unknown }).addSmartNode,
    legacyScript: [...document.scripts].some(script => /\/static\/js\/smart-canvas\.js/.test(script.src)),
    modernScript: [...document.scripts].some(script => /\/static\/dist\/smart-canvas-modern\.js/.test(script.src)),
  }));
  expect(isolation).toEqual({ legacyApi: 'undefined', legacyGlobal: 'undefined', legacyScript: false, modernScript: true });
});

test('falls back to the original Smart Canvas runtime when the React entry cannot load', async ({ page }) => {
  await page.route('**/static/dist/smart-canvas-modern.js*', route => route.abort());

  await page.goto('/static/smart-canvas.html?smart_canvas_react=1');

  await expect(page.locator('html')).toHaveAttribute('data-smart-canvas-react', 'fallback');
  await expect(page.locator('#shell')).toBeVisible();
  await expect(page.locator('#smartCanvasApp')).toBeHidden();

  const fallback = await page.evaluate(() => ({
    legacyApi: typeof (window as typeof window & { CanvasApi?: unknown }).CanvasApi,
    legacyScript: [...document.scripts].some(script => /\/static\/js\/smart-canvas\.js/.test(script.src)),
    legacyStylesDisabled: (document.querySelector('#smartCanvasLegacyStyles') as HTMLLinkElement | null)?.disabled,
  }));
  expect(fallback).toEqual({ legacyApi: 'object', legacyScript: true, legacyStylesDisabled: false });
});
