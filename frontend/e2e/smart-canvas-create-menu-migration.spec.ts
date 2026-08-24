import { expect, test, type Page } from '@playwright/test';

async function mockSmartCanvasCreateMenu(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-create-menu', kind: 'smart', schemaVersion: 1, title: 'Smart create menu', updated_at: 1, connections: [], nodes: [],
  };
  const saves: Array<Record<string, any>> = [];
  let uploads = 0;
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-create-menu/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-create-menu', async route => {
    if (route.request().method() !== 'GET') {
      document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves.length + 2 };
      saves.push(structuredClone(document));
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/ai/upload', async route => {
    uploads += 1;
    await route.fulfill({ json: { files: [{ kind: 'image', name: 'dropped.png', url: `/uploads/dropped-${uploads}.png` }] } });
  });
  return { saves, uploads: () => uploads };
}

async function openMenu(page: Page, x: number, y: number) {
  await expect(page.getByTestId('canvas-board-v2')).toBeVisible();
  await page.mouse.dblclick(x, y);
  await expect(page.locator('#createMenu.create-menu.open')).toBeVisible();
}

test('opens the legacy three-card Smart Canvas create menu on blank-space double click', async ({ page }) => {
  await mockSmartCanvasCreateMenu(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-create-menu');

  await openMenu(page, 500, 360);
  const menu = page.locator('#createMenu');
  await expect(menu.locator('.create-menu-grid')).toHaveCount(1);
  await expect(menu.locator('.create-card')).toHaveCount(3);
  await expect(menu.locator('[data-create-type="image"]')).toContainText('上传节点支持图片/音频/视频/批量上传');
  await expect(menu.locator('[data-create-type="prompt"]')).toContainText('提示词手写或用 LLM 生成文本');
  await expect(menu.locator('[data-create-type="loop"]')).toContainText('循环节点控制一键运行轮数和批次');
  await expect(page.locator('#fileInput[type="file"][multiple]')).toHaveCount(1);
  await expect(menu).toHaveCSS('width', '420px');
});

test('creates upload, prompt and loop nodes with the legacy Smart Canvas coordinate offsets', async ({ page }) => {
  const state = await mockSmartCanvasCreateMenu(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-create-menu');

  await openMenu(page, 520, 360);
  await page.locator('[data-create-type="image"]').click();
  await expect(page.locator('#createMenu')).toHaveCount(0);
  await expect(page.locator('[data-node-type="smart-image"]')).toHaveCount(1);

  await openMenu(page, 800, 100);
  await page.locator('[data-create-type="prompt"]').click();
  await expect(page.locator('[data-node-type="smart-prompt"]')).toHaveCount(1);

  await openMenu(page, 1100, 250);
  await page.locator('[data-create-type="loop"]').click();
  await expect(page.locator('[data-node-type="smart-loop"]')).toHaveCount(1);

  await expect.poll(() => state.saves.at(-1)?.nodes.length).toBe(3);
  const saved = state.saves.at(-1)!;
  const image = saved.nodes.find((node: any) => node.type === 'smart-image');
  const prompt = saved.nodes.find((node: any) => node.type === 'prompt');
  const loop = saved.nodes.find((node: any) => node.type === 'loop');
  expect(image).toMatchObject({ x: 520 - 158, y: 360 - 97, images: [] });
  expect(prompt).toMatchObject({ x: 800 - 158, y: 100 - 97 });
  expect(loop).toMatchObject({ x: 1100 - 135, y: 250 - 95 });
  expect(saved.connections).toEqual([]);
});

test('uploads dropped media into one Smart Image node at the drop point', async ({ page }) => {
  const state = await mockSmartCanvasCreateMenu(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-create-menu');

  await page.getByTestId('canvas-board-v2').evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['image'], 'dropped.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, clientX: 640, clientY: 420, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, clientX: 640, clientY: 420, dataTransfer: transfer }));
  });

  await expect.poll(state.uploads).toBe(1);
  await expect(page.locator('[data-node-type="smart-image"]')).toHaveCount(1);
  await expect.poll(() => state.saves.at(-1)?.nodes[0]).toMatchObject({
    type: 'smart-image', x: 640 - 158, y: 420 - 97, images: [{ kind: 'image', name: 'dropped.png', url: '/uploads/dropped-1.png' }],
  });
});
