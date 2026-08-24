import { expect, test, type Page } from '@playwright/test';

async function mockSmartLoopNode(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-loop-node', kind: 'smart', schemaVersion: 1, title: 'Smart loop node', updated_at: 1,
    connections: [{ from: 'prompt', to: 'loop' }, { from: 'images', to: 'loop' }, { from: 'loop', to: 'target' }],
    nodes: [
      { id: 'prompt', type: 'smart-prompt', x: 20, y: 20, text: 'upstream prompt' },
      { id: 'images', type: 'smart-image', x: 20, y: 260, images: [{ url: '/assets/1.png' }, { url: '/assets/2.png' }, { url: '/assets/3.png' }] },
      { id: 'loop', type: 'smart-loop', x: 380, y: 30, count: 2, mode: 'serial', showPrompt: true, imageInput: true, loopStart: 1, imageBatchSize: 2, variablePrompts: ['round 《计数》', 'second 《进度》'], variablePrompt: 'round 《计数》\nsecond 《进度》' },
      { id: 'target', type: 'smart-image', x: 780, y: 30, images: [], runSettings: { engine: 'api' } },
    ],
  };
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-loop-node/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-loop-node', async route => {
    if (route.request().method() !== 'GET') { document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves.length + 2 }; saves.push(structuredClone(document)); }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  return { saves };
}

test('renders the original smart-loop DOM, image input and prompt fields', async ({ page }) => {
  await mockSmartLoopNode(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-loop-node');
  const node = page.locator('[data-node-id="loop"].image-node.loop-smart-node[data-node-type="smart-loop"]');
  await expect(node).toBeVisible();
  await expect(node.locator('.loop-smart-card.has-image.has-prompt')).toBeVisible();
  await expect(node.locator('.loop-smart-seg .active')).toContainText('串行');
  await expect(node.locator('.loop-smart-toggle.active')).toHaveCount(2);
  await expect(node.locator('.smart-node-input-thumb')).toHaveCount(3);
  await expect(node.locator('.loop-smart-upstream-text')).toContainText('upstream prompt');
  await expect(node.locator('.loop-smart-prompt-item')).toHaveCount(2);
  await expect(node.locator('.loop-smart-token-chip')).toHaveCount(1);
  await expect(node.locator('.loop-smart-footer .loop-number-control')).toHaveCount(2);
  await expect(node.locator('.loop-smart-run')).toContainText('运行全部');
});

test('edits rounds, variables and prompt fields while preserving the legacy controls', async ({ page }) => {
  const state = await mockSmartLoopNode(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-loop-node');
  const node = page.locator('[data-node-id="loop"]');
  await node.locator('.loop-smart-seg button').filter({ hasText: '并行' }).click();
  const rounds = node.locator('.loop-smart-footer .loop-number-control').filter({ hasText: '轮次' });
  await rounds.locator('.loop-number-trigger').hover();
  await rounds.locator('.loop-number-cell[data-loop-value="3"]').click();
  await node.locator('.loop-smart-add-prompt').click();
  await expect(node.locator('.loop-smart-prompt-item')).toHaveCount(3);
  await node.locator('.loop-smart-text').nth(2).fill('third 《计数》');
  await node.locator('.loop-smart-text').nth(2).press('Tab');
  await expect.poll(() => state.saves.at(-1)?.nodes.find((item: any) => item.id === 'loop')).toMatchObject({ mode: 'parallel', count: 3, variablePrompts: ['round 《计数》', 'second 《进度》', 'third 《计数》'] });
});

test('runs all loop rounds in parallel against the downstream chain', async ({ page }) => {
  const state = await mockSmartLoopNode(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-loop-node');
  await expect.poll(() => page.evaluate(() => Boolean(window.CanvasBoardV2))).toBe(true);
  await page.evaluate(() => {
    const target = window as typeof window & { __loopRuns?: Array<{ id: string; mode?: string }>; __loopStubbed?: boolean };
    target.__loopRuns = [];
    if (target.CanvasBoardV2) {
      const stub = async (id: string, mode?: 'cascade' | 'chat' | 'node') => { target.__loopRuns!.push({ id, mode }); };
      target.CanvasBoardV2.runNode = stub;
      target.__loopStubbed = target.CanvasBoardV2.runNode === stub;
    }
  });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __loopStubbed?: boolean }).__loopStubbed)).toBe(true);
  const node = page.locator('[data-node-id="loop"]');
  await node.locator('.loop-smart-seg button').filter({ hasText: '并行' }).click();
  await node.locator('.loop-smart-run').click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __loopRuns?: unknown[] }).__loopRuns)).toEqual([
    { id: 'target', mode: 'cascade' }, { id: 'target', mode: 'cascade' },
  ]);
  await expect.poll(() => state.saves.at(-1)?.nodes.find((item: any) => item.id === 'loop')?.running).toBe(false);
});
