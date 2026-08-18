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
  await page.route('**/api/ai/upload', async (route) => route.fulfill({ json: {
    files: [{ kind: 'image', name: 'reference.png', url: '/uploads/reference.png' }],
  } }));
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
  await page.getByTestId('smart-canvas-composer').locator('input[type="file"]').setInputFiles({
    name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from('reference'),
  });
  await expect(page.getByTestId('smart-canvas-composer')).toContainText('reference.png');
  await expect(page.getByLabel('智能生成平台')).toHaveValue('mock');
  await expect(page.getByLabel('智能生成模型')).toHaveValue('mock-image');
  await page.getByRole('button', { name: '创建并生成' }).click();

  await expect(page.getByRole('status')).toContainText('生成完成');
  await expect(page.locator('[data-node-type="prompt"]')).toHaveCount(1);
  await expect(page.locator('[data-node-type="generator"]')).toHaveCount(1);
  await expect(page.locator('[data-node-type="output"] img[src="/output/composer.png"]')).toHaveCount(1);
  expect(submitted).toMatchObject({
    prompt: 'a city made of glass', provider_id: 'mock', model: 'mock-image',
    reference_images: [{ kind: 'image', name: 'reference.png', url: '/uploads/reference.png' }],
  });
  await expect.poll(() => saves).toBeGreaterThan(0);
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('[data-node-type="prompt"]')).toHaveCount(0);
  await page.getByRole('button', { name: '重做' }).click();
  await expect(page.locator('[data-node-type="output"] img[src="/output/composer.png"]')).toHaveCount(1);
});

test('manages and applies the shared prompt library from Smart Canvas', async ({ page }) => {
  let promptState = {
    active_library_id: 'mine',
    libraries: [{
      id: 'mine', name: '我的提示词', categories: [{ id: 'scene', name: '场景' }],
      items: [{ id: 'prompt-1', name: '晨雾城市', category: 'scene', positive: 'city in morning fog', negative: 'low quality', scene: '城市' }],
    }],
  };
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let libraryChanges = 0;
  const canvasDocument = { id: 'smart-prompts', kind: 'smart', schemaVersion: 1, title: 'Prompt Smart', updated_at: 1, connections: [], nodes: [] };
  await page.route('**/api/config', async (route) => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', async (route) => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', async (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', async (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-prompts/lock', async (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-prompts', async (route) => route.fulfill({ json: { canvas: canvasDocument } }));
  await page.route('**/api/canvases', async (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() as Record<string, string> | null;
    if (request.method() === 'POST' && path.endsWith('/items')) {
      created += 1;
      const item = { id: 'prompt-created', name: body?.name || '', category: body?.category || '', positive: body?.positive || '', negative: body?.negative || '', scene: body?.scene || '' };
      promptState = { ...promptState, libraries: promptState.libraries.map((library) => ({ ...library, items: [item, ...library.items] })) };
      await route.fulfill({ json: { library: promptState, item } });
      return;
    }
    if (request.method() === 'PATCH' && path.includes('/items/')) {
      updated += 1;
      promptState = { ...promptState, libraries: promptState.libraries.map((library) => ({ ...library, items: library.items.map((item) => item.id === 'prompt-created' ? { ...item, ...body } : item) })) };
      await route.fulfill({ json: { library: promptState, item: promptState.libraries[0].items[0] } });
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/items/delete')) {
      deleted += 1;
      promptState = { ...promptState, libraries: promptState.libraries.map((library) => ({ ...library, items: library.items.filter((item) => item.id !== 'prompt-created') })) };
      await route.fulfill({ json: { library: promptState, removed: 1 } });
      return;
    }
    if (request.method() === 'POST' && path === '/api/prompt-libraries') {
      libraryChanges += 1;
      const library = { id: 'library-created', name: body?.name || '新提示词库', categories: [], items: [] as typeof promptState.libraries[0]['items'] };
      promptState = { active_library_id: library.id, libraries: [...promptState.libraries, library] };
      await route.fulfill({ json: { library: promptState, prompt_library: library } });
      return;
    }
    if (request.method() === 'PATCH' && path.endsWith('/library-created')) {
      libraryChanges += 1;
      promptState = { ...promptState, libraries: promptState.libraries.map((library) => library.id === 'library-created' ? { ...library, name: body?.name || library.name } : library) };
      await route.fulfill({ json: { library: promptState } });
      return;
    }
    if (request.method() === 'DELETE' && path.endsWith('/library-created')) {
      libraryChanges += 1;
      promptState = { active_library_id: 'mine', libraries: promptState.libraries.filter((library) => library.id !== 'library-created') };
      await route.fulfill({ json: { library: promptState } });
      return;
    }
    await route.fulfill({ json: { library: promptState } });
  });

  await page.goto('/static/smart-canvas.html?id=smart-prompts');
  await page.getByRole('button', { name: '提示词库' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /晨雾城市/ }).click();
  await page.getByRole('button', { name: '应用正向' }).click();
  await expect(page.getByLabel('智能画布提示词')).toHaveValue('city in morning fog');

  await page.getByRole('button', { name: '提示词库' }).click();
  await page.getByRole('button', { name: '新建提示词' }).click();
  await page.getByLabel('提示词名称').fill('夜景');
  await page.getByLabel('正向提示词').fill('neon city at night');
  await page.getByRole('button', { name: '创建提示词' }).click();
  await expect.poll(() => created).toBe(1);
  await page.getByLabel('正向提示词').fill('neon city after rain');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect.poll(() => updated).toBe(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除提示词' }).click();
  await expect.poll(() => deleted).toBe(1);
  page.once('dialog', (dialog) => dialog.accept('项目提示词'));
  await page.getByRole('button', { name: '新建库' }).click();
  await expect(page.getByLabel('提示词库')).toHaveValue('library-created');
  page.once('dialog', (dialog) => dialog.accept('项目提示词 2'));
  await page.getByRole('button', { name: '重命名库' }).click();
  await expect(page.getByLabel('提示词库')).toContainText('项目提示词 2');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除库' }).click();
  await expect.poll(() => libraryChanges).toBe(3);
});
