import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  let updatedAt = 1;
  let document = {
    id: 'editor-e2e', schemaVersion: 1, title: '旧版编辑器', updated_at: updatedAt,
    connections: [],
    nodes: [
      { id: 'prompt-a', type: 'prompt', text: 'A', x: 100, y: 180 },
      { id: 'prompt-b', type: 'prompt', text: 'B', x: 450, y: 180 },
    ],
  };
  await page.route('**/api/canvas-rollout/events', (route) => route.fulfill({ json: { accepted: true } }));
  await page.route('**/api/canvas-rollout', (route) => route.fulfill({ json: { version: 1, configured_percentage: 100, effective_percentage: 100, enabled: true, kill_switch: false, blocked_reasons: [] } }));
  await page.route('**/api/config', (route) => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', (route) => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/editor-e2e/lock', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/editor-e2e', async (route) => {
    if (route.request().method() === 'PUT') {
      updatedAt += 1;
      document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: updatedAt };
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', (route) => route.fulfill({ json: { canvases: [{ id: 'editor-e2e', title: '旧版编辑器', kind: 'classic', updated_at: 1 }] } }));
});

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/static/canvas.html?canvas_v2_rollout=100');
  await page.locator('.canvas-item[data-canvas-id="editor-e2e"] .canvas-open').click();
  await expect(page.locator('.canvas-modern-editor')).toBeVisible();
}

test('preserves the legacy editor shell and quick toolbar DOM classes', async ({ page }) => {
  await openEditor(page);
  const editor = page.locator('.canvas-modern-editor');
  await expect(editor).toHaveClass(/\bshell\b/);
  await expect(editor.locator('.topbar > .panel.canvas-nav')).toHaveCount(1);
  await expect(editor.locator('.current-canvas-title')).toHaveText('旧版编辑器');
  await expect(editor.locator('.toolbar.editor-only .toolbar-items .tool-btn')).toHaveCount(11);
  await expect(editor.locator('.toolbar-fixed .toolbar-workflow')).toBeVisible();
  await expect(editor.locator('.toolbar-fixed .toolbar-asset')).toBeVisible();
  await expect(editor.locator('.toolbar-fixed .toolbar-cost')).toContainText('费用 ¥0.00');
  await expect(editor.locator('.toolbar-fixed .toolbar-log')).toBeVisible();
  await expect(editor.locator('.toolbar-fixed .toolbar-backup')).toBeVisible();
  await expect(editor.locator('.hint.editor-only')).toBeVisible();
  await expect(page.getByTestId('canvas-board-v2')).toHaveClass(/\bboard\b/);
  await expect(page.getByTestId('canvas-board-v2').locator('.world > .links')).toHaveCount(1);
  await expect(page.getByTestId('canvas-board-v2').locator('.minimap')).toBeVisible();

  await editor.getByRole('button', { name: '折叠快捷菜单' }).click();
  await expect(editor.locator('.toolbar.editor-only')).toHaveClass(/\bcollapsed\b/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('canvas_quick_toolbar_collapsed'))).toBe('1');
  await editor.getByRole('button', { name: '展开快捷菜单' }).click();
  await expect(editor.locator('.toolbar.editor-only')).not.toHaveClass(/\bcollapsed\b/);
});

test('keeps right-click creation, anchored zoom, marquee selection and grouped movement', async ({ page }) => {
  await openEditor(page);
  const board = page.getByTestId('canvas-board-v2');
  const initialViewport = await board.getAttribute('data-viewport');

  await board.click({ button: 'right', position: { x: 900, y: 520 } });
  const menu = board.locator('.create-menu.open');
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '上传节点' }).click();
  await expect(board.locator('[data-node-type="image"]')).toHaveCount(1);

  await board.hover({ position: { x: 760, y: 420 } });
  await page.mouse.wheel(0, -120);
  await expect.poll(() => board.getAttribute('data-viewport')).not.toBe(initialViewport);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('canvas_session_viewports_v1') || '{}')['editor-e2e']?.zoom)).toBeGreaterThan(1);

  await page.reload();
  await page.locator('.canvas-item[data-canvas-id="editor-e2e"] .canvas-open').click();
  await expect(page.getByTestId('canvas-board-v2')).toHaveAttribute('data-viewport', /1\.08$/);

  const activeBoard = page.getByTestId('canvas-board-v2');
  await page.keyboard.down('Control');
  await page.mouse.move(20, 120);
  await page.mouse.down();
  await page.mouse.move(850, 540, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(activeBoard.locator('.node.selected')).toHaveCount(2);

  const first = activeBoard.locator('[data-node-id="prompt-a"]');
  const second = activeBoard.locator('[data-node-id="prompt-b"]');
  const before = await Promise.all([first.evaluate((element) => getComputedStyle(element).left), second.evaluate((element) => getComputedStyle(element).left)]);
  const box = await first.boundingBox();
  if (!box) throw new Error('prompt-a is not visible');
  await page.mouse.move(box.x + 40, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 48, { steps: 3 });
  await page.mouse.up();
  const after = await Promise.all([first.evaluate((element) => getComputedStyle(element).left), second.evaluate((element) => getComputedStyle(element).left)]);
  expect(after[0]).not.toBe(before[0]);
  expect(after[1]).not.toBe(before[1]);
});
