import { expect, test } from '@playwright/test';

test('runs Smart Canvas on the shared React V2 stack and imports the asset inbox', async ({ page }) => {
  let created = false;
  let createPayload: Record<string, unknown> = {};
  let saves = 0;
  let canvasDocument = {
    id: 'smart-modern-e2e', kind: 'smart', schemaVersion: 1, title: '智能画布', updated_at: 1,
    connections: [] as unknown[], nodes: [] as Array<Record<string, unknown>>,
  };

  await page.addInitScript(() => {
    localStorage.setItem('smart_canvas_asset_inbox', JSON.stringify({
      created_at: Date.now(),
      items: [{ url: '/output/inbox.png', name: 'Inbox asset', kind: 'image' }],
    }));
  });
  await page.route('**/api/canvas-folders', async (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', async (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-modern-e2e/lock', async (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-modern-e2e', async (route) => {
    if (route.request().method() === 'PUT') {
      saves += 1;
      canvasDocument = { ...canvasDocument, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves + 1 };
    }
    await route.fulfill({ json: { canvas: canvasDocument } });
  });
  await page.route('**/api/canvases', async (route) => {
    if (route.request().method() === 'POST') {
      createPayload = JSON.parse(route.request().postData() || '{}');
      created = true;
      await route.fulfill({ json: { canvas: canvasDocument } });
      return;
    }
    await route.fulfill({ json: { canvases: [
      { id: 'classic-hidden', kind: 'classic', title: 'Classic hidden', updated_at: 2 },
      ...(created ? [{ id: canvasDocument.id, kind: 'smart', title: canvasDocument.title, updated_at: canvasDocument.updated_at }] : []),
    ] } });
  });

  await page.goto('/static/smart-canvas.html');
  await expect(page.getByRole('heading', { name: '智能画布' })).toBeVisible();
  await expect(page.getByText('Classic hidden')).toHaveCount(0);
  await page.getByRole('button', { name: '新建智能画布' }).click();

  await expect(page.locator('.canvas-modern-editor')).toBeVisible();
  expect(createPayload).toMatchObject({ kind: 'smart', icon: 'sparkles', title: '智能画布' });
  await page.getByRole('button', { name: '导入素材' }).click();
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(1);
  await expect(page.locator('[data-node-type="image"]')).toContainText('Inbox asset');
  await expect.poll(() => saves).toBeGreaterThan(0);
  await expect.poll(() => canvasDocument.nodes.some((node) => node.url === '/output/inbox.png')).toBe(true);

  const isolation = await page.evaluate(() => ({
    inbox: localStorage.getItem('smart_canvas_asset_inbox'),
    legacyGlobal: typeof (window as typeof window & { addSmartNode?: unknown }).addSmartNode,
    legacyScript: [...document.scripts].some((script) => /\/static\/js\/smart-canvas\.js/.test(script.src)),
  }));
  expect(isolation).toEqual({ inbox: null, legacyGlobal: 'undefined', legacyScript: false });
});

test('opens a smart canvas directly from the id query', async ({ page }) => {
  const canvasDocument = {
    id: 'smart-direct', kind: 'smart', schemaVersion: 1, title: 'Direct Smart', updated_at: 1,
    settings: { engine: 'api', provider_id: 'mock', model: 'mock-image' },
    connections: [{ from: 'prompt-direct', to: 'output-direct' }],
    nodes: [
      { id: 'prompt-direct', type: 'smart-prompt', text: 'direct', x: 40, y: 80 },
      { id: 'output-direct', images: [{ url: '/output/legacy.png', name: 'Legacy' }], x: 800, y: 80 },
    ],
  };
  await page.route('**/api/canvas-folders', async (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', async (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-direct/lock', async (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-direct', async (route) => route.fulfill({ json: { canvas: canvasDocument } }));
  await page.route('**/api/canvases', async (route) => route.fulfill({ json: { canvases: [] } }));

  await page.goto('/static/smart-canvas.html?id=smart-direct');
  await expect(page.locator('.canvas-modern-editor')).toBeVisible();
  await expect(page.locator('[data-node-id="prompt-direct"]')).toContainText('direct');
  await expect(page.locator('[data-node-id="output-direct__generator"]')).toHaveAttribute('data-node-type', 'generator');
  await expect(page.locator('[data-node-id="output-direct"] img[src="/output/legacy.png"]')).toHaveCount(1);
});

test('creates and runs a generation chain from the React Smart Canvas composer', async ({ page }) => {
  let saves = 0;
  let submitted: Record<string, unknown> = {};
  let canvasDocument = {
    id: 'smart-composer-e2e', kind: 'smart', schemaVersion: 1, title: 'Composer Smart', updated_at: 1,
    connections: [] as Array<Record<string, unknown>>, nodes: [] as Array<Record<string, unknown>>,
  };
  await page.route('**/api/config', async (route) => route.fulfill({ json: {
    api_providers: [{ id: 'mock', name: 'Mock Provider', enabled: true, image_models: ['mock-image'], video_models: ['mock-video'] }],
  } }));
  await page.route('**/api/workflows', async (route) => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', async (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', async (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-composer-e2e/lock', async (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-composer-e2e', async (route) => {
    if (route.request().method() === 'PUT') {
      saves += 1;
      canvasDocument = { ...canvasDocument, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves + 1 };
    }
    await route.fulfill({ json: { canvas: canvasDocument } });
  });
  await page.route('**/api/canvases', async (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvas-image-tasks**', async (route) => {
    if (route.request().method() === 'POST') {
      submitted = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ json: { task_id: 'composer-task', status: 'queued' } });
    } else {
      await route.fulfill({ json: { id: 'composer-task', status: 'succeeded', result: { images: ['/output/composer.png'] } } });
    }
  });

  await page.goto('/static/smart-canvas.html?id=smart-composer-e2e');
  await expect(page.getByTestId('smart-canvas-composer')).toBeVisible();
  await page.getByLabel('智能画布提示词').fill('a city made of glass');
  await expect(page.getByLabel('智能生成平台')).toHaveValue('mock');
  await expect(page.getByLabel('智能生成模型')).toHaveValue('mock-image');
  await page.getByRole('button', { name: '创建并生成' }).click();

  await expect(page.getByRole('status')).toContainText('生成完成');
  await expect(page.locator('[data-node-type="prompt"]')).toHaveCount(1);
  await expect(page.locator('[data-node-type="generator"]')).toHaveCount(1);
  await expect(page.locator('[data-node-type="output"] img[src="/output/composer.png"]')).toHaveCount(1);
  expect(submitted).toMatchObject({ prompt: 'a city made of glass', provider_id: 'mock', model: 'mock-image' });
  await expect.poll(() => saves).toBeGreaterThan(0);
});
