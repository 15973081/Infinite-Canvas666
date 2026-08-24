import { expect, test, type Page } from '@playwright/test';

async function mockSmartCanvasMinimap(page: Page) {
  const document = {
    id: 'smart-minimap',
    kind: 'smart',
    schemaVersion: 1,
    title: 'Smart minimap',
    updated_at: 1,
    connections: [],
    nodes: [
      { id: 'image-a', type: 'image', x: 160, y: 120, w: 260, h: 336 },
      { id: 'prompt-b', type: 'prompt', x: 1320, y: 760, w: 310, h: 230 },
    ],
  };
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-minimap/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-minimap', route => route.fulfill({ json: { canvas: document } }));
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
}

test('migrates the legacy Smart Canvas minimap DOM and dynamic projections', async ({ page }) => {
  await mockSmartCanvasMinimap(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-minimap');

  const minimap = page.locator('#smartCanvasApp #minimap.smart-minimap');
  await expect(minimap).toHaveCount(1);
  await expect(minimap).toHaveCSS('width', '190px');
  await expect(minimap.locator(':scope > #minimapContent.smart-minimap-content')).toHaveCount(1);
  await expect(minimap.locator('.minimap-node')).toHaveCount(2);
  await expect(minimap.locator('[data-minimap-node-id="image-a"]')).toHaveAttribute('style', /height:.*left:.*top:.*width:/);
  await expect(minimap.locator('#minimapViewport.smart-minimap-viewport')).toHaveAttribute('style', /height:.*left:.*top:.*width:/);

  await page.setViewportSize({ height: 720, width: 700 });
  await expect(minimap).toHaveCSS('width', '148px');
});

test('centers the viewport when the Smart Canvas minimap is clicked or dragged', async ({ page }) => {
  await mockSmartCanvasMinimap(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-minimap');

  const board = page.locator('[data-testid="canvas-board-v2"]');
  const content = page.locator('#minimapContent');
  const before = await board.getAttribute('data-viewport');
  const box = await content.boundingBox();
  if (!box) throw new Error('minimap content is not visible');
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.75);
  await page.mouse.down();
  await expect.poll(() => board.getAttribute('data-viewport')).not.toBe(before);
  const afterClick = await board.getAttribute('data-viewport');
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3, { steps: 4 });
  await expect.poll(() => board.getAttribute('data-viewport')).not.toBe(afterClick);
  await page.mouse.up();
});
