import { expect, test, type Page } from '@playwright/test';

async function mockManagerApis(page: Page) {
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
}

test('keeps the original Smart Canvas UI behind the explicit production fallback', async ({ page }) => {
  await page.goto('/static/smart-canvas.html?smart_canvas_react=0', { waitUntil: 'domcontentloaded' });

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

test('mounts React from the production Smart Canvas URL without loading the legacy runtime', async ({ page }) => {
  await mockManagerApis(page);

  await page.goto('/static/smart-canvas.html');

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

  await page.goto('/static/smart-canvas.html');

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

test('keeps Light/Dark theme and responsive Smart Canvas breakpoints after cutover', async ({ page }) => {
  await mockManagerApis(page);
  await page.addInitScript(() => localStorage.setItem('studio_theme', 'dark'));
  await page.setViewportSize({ width: 800, height: 720 });

  await page.goto('/static/smart-canvas.html');

  await expect(page.locator('html')).toHaveClass(/studio-theme-dark/);
  await expect(page.locator('body')).toHaveClass(/studio-theme-dark/);
  await expect(page.locator('#smartCanvasApp .canvas-modern-manager')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

  await page.evaluate(() => window.postMessage({ type: 'studio-theme', theme: 'light' }, '*'));
  await expect(page.locator('html')).not.toHaveClass(/studio-theme-dark/);
  await expect(page.locator('body')).not.toHaveClass(/studio-theme-dark/);
});

test('loads and saves a historical Smart Canvas through the production URL without splitting smart-image nodes', async ({ page }) => {
  let document: Record<string, any> = {
    id: 'smart-production-cutover', kind: 'smart', schemaVersion: 1, title: 'Historical Smart Canvas', updated_at: 1,
    settings: { engine: 'modelscope', model: 'fixture/model', width: 768, height: 1024, count: 1 },
    connections: [{ from: 'prompt', to: 'target' }, { from: 'loop', to: 'target' }],
    nodes: [
      { id: 'prompt', type: 'smart-prompt', x: 20, y: 20, text: 'historical prompt' },
      { id: 'loop', type: 'smart-loop', x: 380, y: 20, count: 2, variablePrompt: 'round' },
      { id: 'target', x: 760, y: 20, images: [{ url: '/assets/historical.png', name: 'historical.png' }] },
    ],
  };
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-production-cutover/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-production-cutover', async route => {
    if (route.request().method() !== 'GET') {
      document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves.length + 2 };
      saves.push(structuredClone(document));
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));

  await page.goto('/static/smart-canvas.html?id=smart-production-cutover');

  await expect(page.locator('[data-node-id="prompt"].prompt-smart-node')).toBeVisible();
  await expect(page.locator('[data-node-id="loop"].loop-smart-node')).toBeVisible();
  await expect(page.locator('[data-node-id="target"][data-node-type="smart-image"]')).toBeVisible();
  await expect(page.locator('[data-node-type="generator"]')).toHaveCount(0);
  await expect(page.locator('[data-node-type="output"]')).toHaveCount(0);

  await page.locator('[data-node-id="prompt"] .prompt-node-text').fill('historical prompt updated');
  await page.locator('[data-node-id="prompt"] .prompt-node-text').press('Tab');
  await expect.poll(() => saves.at(-1)?.nodes.find((node: Record<string, any>) => node.id === 'target')).toMatchObject({
    type: 'smart-image',
    images: [{ url: '/assets/historical.png', name: 'historical.png', kind: 'image' }],
  });
});
