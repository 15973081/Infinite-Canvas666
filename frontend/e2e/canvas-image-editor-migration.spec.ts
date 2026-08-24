import { expect, test, type Page } from '@playwright/test';

type CanvasDocument = {
  connections: Array<Record<string, unknown>>;
  id: string;
  nodes: Array<Record<string, unknown>>;
  schemaVersion: number;
  title: string;
  updated_at: number;
};

async function prepare(page: Page) {
  let updatedAt = 1;
  let document: CanvasDocument = {
    id: 'image-editor-e2e', schemaVersion: 1, title: '图片编辑器', updated_at: updatedAt,
    connections: [],
    nodes: [{ id: 'source-image', type: 'image', url: '/static/images/logo.png', name: 'logo.png', mediaKind: 'image', x: 100, y: 120 }],
  };
  const saves: CanvasDocument[] = [];
  const uploads: string[][] = [];
  await page.route('**/api/canvas-rollout/events', (route) => route.fulfill({ json: { accepted: true } }));
  await page.route('**/api/canvas-rollout', (route) => route.fulfill({ json: { version: 1, configured_percentage: 100, effective_percentage: 100, enabled: true, kill_switch: false, blocked_reasons: [] } }));
  await page.route('**/api/config', (route) => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', (route) => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/image-editor-e2e/lock', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/image-editor-e2e', async (route) => {
    if (route.request().method() === 'PUT') {
      updatedAt += 1;
      document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: updatedAt };
      saves.push(structuredClone(document));
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', (route) => route.fulfill({ json: { canvases: [{ id: document.id, title: document.title, kind: 'classic', updated_at: 1 }] } }));
  await page.route('**/api/ai/upload', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') || '';
    const filenames = [...body.matchAll(/filename="([^"]+)"/g)].map((match) => match[1]);
    uploads.push(filenames);
    await route.fulfill({ json: { files: filenames.map((name, index) => ({ kind: 'image', name, url: `/static/images/logo.png?upload=${uploads.length}-${index + 1}` })) } });
  });

  await page.goto('/static/canvas.html?canvas_v2_rollout=100');
  await page.locator('.canvas-item[data-canvas-id="image-editor-e2e"] .canvas-open').click();
  await expect(page.locator('[data-node-id="source-image"] img')).toBeVisible();
  return { getDocument: () => document, saves, uploads };
}

async function openEditor(page: Page) {
  await page.locator('[data-node-id="source-image"]').getByRole('button', { name: '编辑图片' }).click();
  const modal = page.locator('.image-edit-modal.open.canvas-modern-image-edit');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.image-edit-panel')).toBeVisible();
  await expect(modal.locator('img[alt="crop source"]')).toBeVisible();
  return modal;
}

test('restores the complete legacy image editor DOM, modes and zoom behavior', async ({ page }) => {
  await prepare(page);
  const modal = await openEditor(page);
  for (const label of ['预览', '裁剪', '扩图', '遮罩', '画笔', '宫格切分']) await expect(modal.getByRole('button', { name: label, exact: true })).toBeVisible();

  await modal.getByRole('button', { name: '遮罩', exact: true }).click();
  await expect(modal.locator('.crop-canvas')).toHaveClass(/\bmask-mode\b/);
  await expect(modal.locator('.image-edit-tools.active').getByLabel('遮罩笔刷大小')).toBeVisible();

  await modal.getByRole('button', { name: '画笔', exact: true }).click();
  await expect(modal.locator('.crop-canvas')).toHaveClass(/\bbrush-mode\b/);
  await modal.getByRole('button', { name: '文字标签' }).click();
  await expect(modal.locator('.crop-canvas')).toHaveClass(/\btext-mode\b/);

  await modal.getByRole('button', { name: '宫格切分', exact: true }).click();
  await expect(modal.locator('.crop-canvas')).toHaveClass(/\bgrid-mode\b/);
  await expect(modal.getByText('将输出 9 张图片')).toBeVisible();
  await modal.getByRole('button', { name: '2×2', exact: true }).click();
  await expect(modal.getByText('将输出 4 张图片')).toBeVisible();
  await modal.getByRole('button', { name: '自定义', exact: true }).click();
  await modal.getByRole('button', { name: '水平', exact: true }).click();
  await expect(modal.locator('.crop-canvas')).toHaveClass(/\bgrid-custom-h\b/);

  await modal.getByRole('button', { name: '预览', exact: true }).click();
  const stage = modal.locator('.image-edit-stage');
  await stage.hover();
  await page.mouse.wheel(0, -100);
  await expect(modal.getByText('112%')).toBeVisible();
});

test('uploads mask, brush and grid results with legacy node metadata', async ({ page }) => {
  const state = await prepare(page);
  let modal = await openEditor(page);
  await modal.getByRole('button', { name: '遮罩', exact: true }).click();
  const maskCanvas = modal.locator('canvas.edit-draw-canvas');
  const maskBox = await maskCanvas.boundingBox();
  if (!maskBox) throw new Error('mask canvas is unavailable');
  await page.mouse.move(maskBox.x + maskBox.width * 0.3, maskBox.y + maskBox.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(maskBox.x + maskBox.width * 0.7, maskBox.y + maskBox.height * 0.7, { steps: 5 });
  await page.mouse.up();
  await modal.getByRole('button', { name: '应用遮罩', exact: true }).click();
  await expect(page.locator('[data-node-type="image"] img[src="/static/images/logo.png?upload=1-1"]')).toBeVisible();
  await expect.poll(() => state.getDocument().nodes.some((node) => node.role === 'mask')).toBe(true);

  modal = await openEditor(page);
  await modal.getByRole('button', { name: '画笔', exact: true }).click();
  const brushCanvas = modal.locator('canvas.edit-draw-canvas');
  const brushBox = await brushCanvas.boundingBox();
  if (!brushBox) throw new Error('brush canvas is unavailable');
  await page.mouse.move(brushBox.x + brushBox.width * 0.25, brushBox.y + brushBox.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(brushBox.x + brushBox.width * 0.75, brushBox.y + brushBox.height * 0.55, { steps: 5 });
  await page.mouse.up();
  await modal.getByRole('button', { name: '应用画笔', exact: true }).click();
  await expect(page.locator('[data-node-id="source-image"] img')).toHaveAttribute('src', '/static/images/logo.png?upload=2-1');
  await expect.poll(() => state.getDocument().nodes.find((node) => node.id === 'source-image')?.lastImageEdit).toMatchObject({ mode: 'brush' });

  modal = await openEditor(page);
  await modal.getByRole('button', { name: '宫格切分', exact: true }).click();
  await modal.getByRole('button', { name: '2×2', exact: true }).click();
  await modal.getByRole('button', { name: '应用切分', exact: true }).click();
  const output = page.locator('[data-node-type="output"]');
  await expect(output.locator('img')).toHaveCount(4);
  await expect.poll(() => state.getDocument().nodes.find((node) => node.type === 'output')?.outputLayout).toMatchObject({ type: 'grid-split', rows: 2, cols: 2 });
  expect(state.uploads.map((names) => names.length)).toEqual([1, 1, 4]);
  expect(state.saves.length).toBeGreaterThan(2);
});
