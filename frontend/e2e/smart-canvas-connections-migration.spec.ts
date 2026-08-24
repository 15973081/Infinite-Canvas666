import { expect, test, type Page } from '@playwright/test';

async function mockSmartCanvasConnections(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-connections', kind: 'smart', schemaVersion: 1, title: 'Smart connections', updated_at: 1,
    connections: [
      { cascadeState: 'active', from: 'loop', to: 'a' },
      { cascadeState: 'wait', from: 'a', to: 'b' },
      { from: 'b', kind: 'history', to: 'history' },
    ],
    nodes: [
      { count: 2, id: 'loop', imageInput: true, running: true, showPrompt: true, type: 'smart-loop', x: 80, y: 100 },
      { h: 180, id: 'a', images: [], running: true, type: 'smart-image', w: 260, x: 480, y: 100 },
      { h: 180, id: 'b', images: [], type: 'smart-image', w: 260, x: 820, y: 100 },
      { h: 180, historyFor: 'b', id: 'history', images: [], isHistoryGroup: true, type: 'smart-image', w: 260, x: 820, y: 400 },
      { id: 'prompt', text: 'reference', type: 'smart-prompt', x: 80, y: 620 },
    ],
  };
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-connections/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-connections', async route => {
    if (route.request().method() !== 'GET') {
      document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves.length + 2 };
      saves.push(structuredClone(document));
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  return { saves };
}

async function dragPort(page: Page, from: string, fromPort: 'in' | 'out', to: string, toPort: 'in' | 'out', pause = false) {
  const source = page.locator(`[data-node-id="${from}"] .node-port.port-${fromPort}`);
  const target = page.locator(`[data-node-id="${to}"] .node-port.port-${toPort}`);
  await source.hover({ force: true });
  await page.waitForTimeout(50);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Missing Smart Canvas port');
  await source.dispatchEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: sourceBox.x + sourceBox.width / 2, clientY: sourceBox.y + sourceBox.height / 2, pointerId: 1 });
  await page.waitForTimeout(20);
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: x, clientY: y, pointerId: 1 })), { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 });
  if (pause) return;
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 })), { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 });
}

test('renders the original bezier, hit, cut and cascade connection DOM', async ({ page }) => {
  await mockSmartCanvasConnections(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-connections');
  const layer = page.locator('#world svg.connection-layer');
  await expect(layer).toHaveCount(1);
  await expect(layer.locator('.conn-hit')).toHaveCount(3);
  await expect(layer.locator('.conn-cut')).toHaveCount(3);
  await expect(layer.locator('.conn-cascade.conn-cascade-active')).toHaveCount(1);
  await expect(layer.locator('.conn-cascade.conn-cascade-wait')).toHaveCount(2);
  await expect(layer.locator('.conn-history')).toHaveCount(1);
  await expect(layer.locator('.conn-hit').first()).toHaveAttribute('d', /^M\d+ \d+ C /);
});

test('drags ports, shows the temporary line, rejects cycles and cuts a connection', async ({ page }) => {
  const state = await mockSmartCanvasConnections(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-connections');
  await dragPort(page, 'prompt', 'out', 'a', 'in', true);
  await expect(page.locator('#shell')).toHaveClass(/\bport-dragging\b/);
  await expect(page.locator('#world .port-drag-temp.conn-pending')).toHaveCount(1);
  await page.locator('[data-node-id="a"] .node-port.port-in').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, pointerId: 1 }));
  });
  await expect.poll(() => state.saves.at(-1)?.connections.length).toBe(4);

  await dragPort(page, 'b', 'out', 'loop', 'in');
  await expect.poll(() => state.saves.at(-1)?.connections.length).toBe(4);
  await expect(page.locator('#world .conn-hit')).toHaveCount(4);

  await page.locator('#world .conn-cut[data-conn-index="0"]').click({ force: true });
  await expect.poll(() => state.saves.at(-1)?.connections.length).toBe(3);
  await expect(page.locator('#world .conn-hit')).toHaveCount(3);
});
