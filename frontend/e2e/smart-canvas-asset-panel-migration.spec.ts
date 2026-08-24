import { expect, test, type Page } from '@playwright/test';

type MockAssetState = ReturnType<typeof makeAssetLibrary>;

function makeAssetLibrary() {
  return {
    active_library_id: 'library-1',
    libraries: [{
      id: 'library-1', name: '默认资产库', categories: [
        { id: 'images', name: '图片素材', type: 'image', items: [
          { id: 'face', kind: 'image', name: 'Face Portrait.png', url: '/face.png', registrations: { volcengine: { status: 'Active', asset_uri: 'asset://face' } } },
          { id: 'pending', kind: 'image', name: 'Pending Avatar.png', url: '/pending.png', registrations: { volcengine: { status: 'Processing' } } },
          { id: 'failed', kind: 'image', name: 'Failed Avatar.png', url: '/failed.png', registrations: { volcengine: { status: 'Failed', detail: 'upstream rejected' } } },
        ] },
        { id: 'workflows', name: '工作流', type: 'workflow', items: [{ id: 'workflow-1', kind: 'workflow', name: 'Portrait flow', url: '/portrait-workflow.json' }] },
      ],
    }],
  };
}

async function mockSmartAssets(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-assets', kind: 'smart', schemaVersion: 1, title: 'Smart assets', updated_at: 1, connections: [],
    nodes: [{ id: 'canvas-image', type: 'smart-image', title: 'Canvas Face', x: 220, y: 160, images: [{ name: 'canvas-face.png', url: '/canvas-face.png', kind: 'image' }] }],
  };
  let library: MockAssetState = makeAssetLibrary();
  const requests: Array<{ body: any; method: string; path: string }> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-assets/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-assets', async route => {
    if (route.request().method() !== 'GET') document = { ...document, ...(route.request().postDataJSON() as Record<string, unknown>), updated_at: Number(document.updated_at) + 1 };
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  await page.route('**/api/asset-library**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON?.() ?? {};
    requests.push({ body, method: request.method(), path: url.pathname });
    if (url.pathname === '/api/asset-library/items/delete') {
      const ids = new Set<string>(body.ids || []);
      library.libraries[0].categories.forEach(category => { category.items = category.items.filter(item => !ids.has(item.id)); });
    } else if (/\/api\/asset-library\/items\/[^/]+$/.test(url.pathname) && request.method() === 'PATCH') {
      const id = decodeURIComponent(url.pathname.split('/').at(-1) || '');
      library.libraries[0].categories.forEach(category => category.items.forEach(item => { if (item.id === id) item.name = String(body.name); }));
    } else if (/\/api\/asset-library\/categories\/[^/]+$/.test(url.pathname) && request.method() === 'PATCH') {
      const id = decodeURIComponent(url.pathname.split('/').at(-1) || '');
      library.libraries[0].categories.forEach(category => { if (category.id === id) category.name = String(body.name); });
    } else if (url.pathname === '/api/asset-library/items' && request.method() === 'POST') {
      library.libraries[0].categories[0].items.push({ id: `saved-${library.libraries[0].categories[0].items.length}`, kind: 'image', name: String(body.name), url: String(body.url), registrations: undefined });
    }
    await route.fulfill({ json: { library } });
  });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mP8z8AARMAgYKSBEwAA//8DAJ0CAQn7fksAAAAASUVORK5CYII=', 'base64');
  await page.route(/\/(face|pending|failed|canvas-face)\.png(?:\?.*)?$/, route => route.fulfill({ body: png, contentType: 'image/png' }));
  return { document: () => document, requests };
}

test('migrates the legacy asset panel DOM, category/search, rename/delete and avatar states', async ({ page }) => {
  const state = await mockSmartAssets(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-assets');
  await page.locator('#assetToggle').click();
  const panel = page.locator('#assetPanel.asset-panel.open');
  await expect(panel).toBeVisible();
  await expect(panel.locator('#assetLibrarySelect')).toHaveValue('library-1');
  await expect(panel.locator('#assetCategorySelect')).toHaveValue('images');
  await expect(panel.locator('.asset-item')).toHaveCount(3);
  await expect(panel.locator('[data-asset-id="face"] .smart-face-verified-badge')).toBeVisible();
  await expect(panel.locator('[data-asset-id="pending"]')).toContainText('认证中');
  await expect(panel.locator('[data-asset-id="failed"]')).toContainText('认证失败');

  await panel.locator('#assetNameSearch').fill('portrait');
  await expect(panel.locator('.asset-item')).toHaveCount(1);
  await panel.locator('#assetNameSearch').fill('');
  await panel.locator('[data-rename-asset="face"]').click();
  const rename = panel.locator('[data-asset-id="face"] .asset-rename-input');
  await rename.fill('Renamed Face.png');
  await rename.press('Enter');
  await expect(panel.locator('[data-asset-id="face"] .asset-name')).toHaveText('Renamed Face.png');
  await panel.locator('[data-delete-asset="failed"]').click();
  await expect(panel.locator('[data-asset-id="failed"]')).toHaveCount(0);

  await panel.locator('#assetRenameCategoryBtn').click();
  const dialog = page.locator('#assetDialogBackdrop.open');
  await expect(dialog).toBeVisible();
  await dialog.locator('#assetDialogInput').fill('人物素材');
  await dialog.locator('#assetDialogOk').click();
  await expect(panel.locator('#assetCategorySelect')).toContainText('人物素材');
  expect(state.requests).toEqual(expect.arrayContaining([
    expect.objectContaining({ body: { name: 'Renamed Face.png' }, method: 'PATCH', path: '/api/asset-library/items/face' }),
    expect.objectContaining({ body: { ids: ['failed'], library_id: 'library-1' }, method: 'POST', path: '/api/asset-library/items/delete' }),
    expect.objectContaining({ body: { library_id: 'library-1', name: '人物素材' }, method: 'PATCH', path: '/api/asset-library/categories/images' }),
  ]));
});

test('keeps asset-to-canvas and canvas-to-asset drag payloads on smart-image nodes', async ({ page }) => {
  const state = await mockSmartAssets(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-assets');
  await page.locator('#assetToggle').click();
  const panel = page.locator('#assetPanel');
  await expect(panel.locator('[data-asset-id="face"]')).toBeVisible();

  await panel.locator('[data-asset-id="face"]').dragTo(page.locator('[data-testid="canvas-board-v2"]'));
  await expect.poll(() => state.document().nodes.filter((node: Record<string, unknown>) => node.type === 'smart-image').length).toBe(2);
  const inserted = state.document().nodes.find((node: Record<string, unknown>) => node.id !== 'canvas-image');
  expect(inserted).toMatchObject({ type: 'smart-image', images: [{ asset_item_id: 'face', asset_uris: { volcengine: 'asset://face' }, kind: 'image', name: 'Face Portrait.png', url: '/face.png' }] });

  await page.locator('[data-node-id="canvas-image"] .image-wrap').dragTo(panel.locator('#assetDropZone'));
  await expect.poll(() => state.requests.filter(request => request.path === '/api/asset-library/items' && request.method === 'POST')).toHaveLength(1);
  expect(state.requests.find(request => request.path === '/api/asset-library/items' && request.method === 'POST')?.body).toMatchObject({ category_id: 'images', library_id: 'library-1', name: 'canvas-face.png', url: '/canvas-face.png' });
});
