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

test('opens a remotely locked canvas read-only and takes over after release', async ({ page }) => {
  let lockRequests = 0;
  let canvasDocument = {
    id: 'smart-locked', kind: 'smart', schemaVersion: 1, title: 'Locked Smart', updated_at: 1, connections: [],
    nodes: [{ id: 'locked-prompt', type: 'prompt', text: 'read only prompt', x: 40, y: 80 }],
  };
  let remoteUpdatedAt = 1;
  await page.route('**/api/config', (route) => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', (route) => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-locked/lock', async (route) => {
    lockRequests += 1;
    if (lockRequests === 1) {
      await route.fulfill({ status: 409, json: { detail: { message: 'locked', holder: { client_id: 'other', username: 'Alice', ip: '10.0.0.2' } } } });
      return;
    }
    if (lockRequests === 3) {
      await route.fulfill({ status: 503, json: { detail: 'lock service unavailable' } });
      return;
    }
    await route.fulfill({ json: { ok: true, renewed: false, holder: { client_id: 'mine', username: 'Bob' } } });
  });
  await page.route('**/api/canvases/smart-locked/meta', (route) => route.fulfill({ json: { id: 'smart-locked', updated_at: remoteUpdatedAt } }));
  await page.route('**/api/canvases/smart-locked', (route) => route.fulfill({ json: { canvas: canvasDocument } }));
  await page.route('**/api/canvases', (route) => route.fulfill({ json: { canvases: [] } }));

  await page.clock.install();
  await page.goto('/static/smart-canvas.html?id=smart-locked');
  await expect(page.locator('.canvas-modern-editor')).toBeVisible();
  await expect(page.getByText('Alice 正在编辑此画布')).toBeVisible();
  await expect(page.getByTestId('canvas-board-v2')).toHaveAttribute('aria-readonly', 'true');
  await expect(page.getByRole('button', { name: 'API生成' })).toBeDisabled();
  expect(await page.evaluate(() => window.CanvasBoardV2?.addNode('prompt'))).toBeNull();

  canvasDocument = { ...canvasDocument, updated_at: 2, nodes: [{ ...canvasDocument.nodes[0], text: 'remote saved prompt' }] };
  remoteUpdatedAt = 2;
  await page.evaluate(() => window.postMessage({ type: 'canvas_updated', canvas_id: 'smart-locked', updated_at: 2, client_id: 'other' }, '*'));
  await expect(page.locator('[data-node-id="locked-prompt"]')).toContainText('remote saved prompt');

  canvasDocument = { ...canvasDocument, updated_at: 3, nodes: [{ ...canvasDocument.nodes[0], text: 'remote polled prompt' }] };
  remoteUpdatedAt = 3;
  await page.clock.fastForward(5_100);
  await expect(page.locator('[data-node-id="locked-prompt"]')).toContainText('remote polled prompt');

  await page.getByRole('button', { name: '尝试取得编辑锁' }).click();
  await expect(page.getByText('Alice 正在编辑此画布')).toHaveCount(0);
  await expect(page.getByTestId('canvas-board-v2')).toHaveAttribute('aria-readonly', 'false');
  await expect(page.getByRole('button', { name: 'API生成' })).toBeEnabled();
  expect(lockRequests).toBe(2);

  await page.clock.fastForward(25_100);
  await expect(page.getByText('锁状态未知 正在编辑此画布')).toBeVisible();
  await expect(page.getByTestId('canvas-board-v2')).toHaveAttribute('aria-readonly', 'true');
  await expect(page.getByText(/编辑锁续期失败，已切换只读并将自动重试/)).toBeVisible();
  expect(lockRequests).toBe(3);
});

test('creates and runs a generation chain from the React Smart Canvas composer', async ({ page }) => {
  let saves = 0;
  let savedCanvasPayload: Record<string, unknown> = {};
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
      savedCanvasPayload = JSON.parse(route.request().postData() || '{}');
      canvasDocument = { ...canvasDocument, ...savedCanvasPayload, updated_at: saves + 1 };
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
  expect(savedCanvasPayload.client_id).toMatch(/^canvas_/);
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

test('manages canvas assets, saves outputs, and exports resource-complete workflows', async ({ page }) => {
  let assetState: any = {
    active_library_id: 'default',
    libraries: [{ id: 'default', name: '默认素材库', categories: [
      { id: 'images', name: '图片', type: 'image', items: [{ id: 'hero', name: 'Hero', kind: 'image', url: '/assets/hero.png' }] },
      { id: 'workflows', name: '工作流', type: 'workflow', items: [{ id: 'saved-flow', name: 'Saved workflow', kind: 'workflow', url: '/assets/library/saved-flow.zip' }] },
    ] }],
  };
  let added = 0;
  let renamed = 0;
  let deleted = 0;
  let exportPayload: Record<string, unknown> = {};
  let libraryExportPayload: Record<string, unknown> = {};
  let groupExportPayload: Record<string, unknown> = {};
  let canvasDocument: any = {
    id: 'smart-assets', kind: 'smart', schemaVersion: 1, title: 'Asset Smart', updated_at: 1, connections: [],
    nodes: [{ id: 'output-assets', type: 'output', x: 500, y: 100, images: [{ url: '/output/generated.png', name: 'generated.png', kind: 'image' }] }],
  };
  await page.route('**/api/config', (route) => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', (route) => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-assets/lock', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-assets', async (route) => {
    if (route.request().method() === 'PUT') canvasDocument = { ...canvasDocument, ...route.request().postDataJSON(), updated_at: canvasDocument.updated_at + 1 };
    await route.fulfill({ json: { canvas: canvasDocument } });
  });
  await page.route('**/api/canvases', (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvas-workflows/export', async (route) => {
    exportPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/zip', headers: { 'Content-Disposition': "attachment; filename*=UTF-8''smart-assets.zip" }, body: Buffer.from('PK mock zip') });
  });
  await page.route('**/api/canvas-workflows/export-to-library', async (route) => {
    libraryExportPayload = route.request().postDataJSON();
    const item = { id: 'exported-flow', name: 'Asset Smart', kind: 'workflow', url: '/assets/library/exported-flow.zip' };
    assetState.libraries[0].categories[1].items.push(item);
    await route.fulfill({ json: { library: assetState, item } });
  });
  await page.route('**/assets/library/saved-flow.zip', (route) => route.fulfill({ contentType: 'application/zip', body: Buffer.from('PK mock stored workflow') }));
  await page.route('**/api/canvas-workflows/import', (route) => route.fulfill({ json: { workflow: {
    nodes: [{ id: 'asset-prompt', type: 'prompt', x: 20, y: 20, text: 'imported from asset library' }], connections: [],
  } } }));
  await page.route('**/api/smart-canvas/group-export', async (route) => {
    groupExportPayload = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, count: (groupExportPayload.items as unknown[])?.length || 0, folder: 'D:/exports/Asset Smart' } });
  });
  await page.route('**/api/asset-library**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() as Record<string, any> | null;
    const category = assetState.libraries[0].categories[0];
    if (request.method() === 'POST' && pathname.endsWith('/items')) {
      added += 1;
      const item = { id: `added-${added}`, name: body?.name || '', kind: 'image', url: body?.url || '' };
      category.items.push(item);
      await route.fulfill({ json: { library: assetState, item } });
      return;
    }
    if (request.method() === 'PATCH' && pathname.includes('/items/')) {
      renamed += 1;
      const item = category.items.find((candidate: any) => candidate.id === pathname.split('/').pop());
      if (item) item.name = body?.name || item.name;
      await route.fulfill({ json: { library: assetState, item } });
      return;
    }
    if (request.method() === 'POST' && pathname.endsWith('/items/delete')) {
      deleted += 1;
      category.items = category.items.filter((item: any) => !body?.ids?.includes(item.id));
      await route.fulfill({ json: { library: assetState, removed: 1 } });
      return;
    }
    if (request.method() === 'POST' && pathname.endsWith('/categories')) {
      const next = { id: 'created-category', name: body?.name || '', type: 'image', items: [] };
      assetState.libraries[0].categories.push(next);
      await route.fulfill({ json: { library: assetState, category: next } });
      return;
    }
    await route.fulfill({ json: { library: assetState } });
  });

  await page.goto('/static/smart-canvas.html?id=smart-assets');
  await page.getByRole('button', { name: '资产库', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('图片');
  await page.locator('.canvas-asset-preview').filter({ hasText: 'Hero' }).click();
  await expect(page.locator('[data-node-type="image"]')).toContainText('Hero');

  await page.getByRole('button', { name: '资产库', exact: true }).click();
  await page.getByLabel('素材地址').fill('/output/new.png');
  await page.getByLabel('素材名称').fill('New asset');
  await page.getByRole('button', { name: '添加地址' }).click();
  await expect.poll(() => added).toBe(1);
  page.once('dialog', (dialog) => dialog.accept('Renamed asset'));
  await page.locator('.canvas-modern-asset-grid article').filter({ hasText: 'New asset' }).getByRole('button', { name: '重命名' }).click();
  await expect.poll(() => renamed).toBe(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.canvas-modern-asset-grid article').filter({ hasText: 'Renamed asset' }).getByRole('button', { name: '删除' }).click();
  await expect.poll(() => deleted).toBe(1);
  await page.getByRole('button', { name: '关闭' }).click();

  await page.locator('[data-node-id="output-assets"]').getByRole('button', { name: '保存到资产库' }).click();
  await expect(page.getByLabel('素材地址')).toHaveValue('/output/generated.png');
  await page.getByRole('button', { name: '保存输出' }).click();
  await expect.poll(() => added).toBe(2);

  await page.getByRole('button', { name: '工作流', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 ZIP（含资源）' }).click();
  await download;
  expect(exportPayload).toMatchObject({ filename: 'Asset Smart-workflow.zip', include_resources: true });
  expect(Array.isArray(exportPayload.nodes)).toBe(true);

  await page.getByRole('button', { name: '工作流', exact: true }).click();
  await page.getByRole('button', { name: '保存到工作流库' }).click();
  await expect(page.getByRole('dialog')).toContainText('保存工作流到资产库');
  await expect(page.getByRole('button', { name: '保存工作流' })).toBeEnabled();
  await page.getByRole('button', { name: '保存工作流' }).click();
  await expect.poll(() => libraryExportPayload).toMatchObject({ library_id: 'default', category_id: 'workflows', include_resources: true, name: 'Asset Smart' });

  await page.getByRole('button', { name: '资产库', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /工作流/ }).click();
  await page.locator('.canvas-asset-preview').filter({ hasText: 'Saved workflow' }).click();
  await expect(page.locator('[data-node-type="prompt"]')).toContainText('imported from asset library');

  await page.getByRole('button', { name: '工作流', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept('D:/exports'));
  await page.getByRole('button', { name: '批量导出选区结果' }).click();
  await expect.poll(() => groupExportPayload).toMatchObject({ folder: 'D:/exports', group_name: 'Asset Smart' });
  expect(groupExportPayload.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'image', url: '/output/generated.png' }),
    expect.objectContaining({ kind: 'text', text: 'imported from asset library' }),
  ]));
});
