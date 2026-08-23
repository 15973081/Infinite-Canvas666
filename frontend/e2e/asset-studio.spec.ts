import { expect, test } from '@playwright/test';

const assetLibrary = {
  active_library_id: 'default',
  libraries: [{ id: 'default', name: '默认素材库', type: 'asset', categories: [
    { id: 'images', name: '角色', type: 'image', items: [{ id: 'asset-1', name: 'Hero', url: '/assets/hero.png', kind: 'image' }] },
    { id: 'workflows', name: '工作流', type: 'workflow', items: [{ id: 'wf-1', name: 'Portrait Flow', url: '/assets/flow.json', kind: 'workflow' }] },
  ] }],
};

test('asset manager runs as React AssetStudio and keeps real CRUD contracts', async ({ page }) => {
  let deletedAssets: Record<string, unknown> | null = null;
  let savedPrompt: Record<string, unknown> | null = null;
  await page.route('**/api/asset-library', route => route.fulfill({ json: { library: assetLibrary } }));
  await page.route('**/api/asset-library/items/delete', async route => { deletedAssets = route.request().postDataJSON(); await route.fulfill({ json: { library: assetLibrary } }); });
  await page.route('**/api/prompt-libraries', route => route.fulfill({ json: { library: { active_library_id: 'system', libraries: [{ id: 'system', name: '系统提示词库', system: true, categories: [{ id: 'view', name: '视角' }], items: [] }] } } }));
  await page.route('**/api/prompt-libraries/items', async route => {
    savedPrompt = route.request().postDataJSON();
    await route.fulfill({ json: { library: { active_library_id: 'system', libraries: [{ id: 'system', name: '系统提示词库', system: true, categories: [{ id: 'view', name: '视角' }], items: [{ id: 'new', ...savedPrompt }] }] } } });
  });
  await page.route('**/api/local-assets', route => route.fulfill({ json: { items: [{ id: 'local-1', file: 'local.png', name: 'Local', url: '/assets/uploads/local.png', kind: 'image', folder: '' }], tree: { id: '__root__', name: '全部上传', path: '', count: 1, items: [], children: [] } } }));
  await page.route('**/api/shared-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvas-assets', route => route.fulfill({ json: { categories: [{ id: 'all', name: '全部画布', count: 1 }], canvases: [], items: [{ id: 'canvas-1', name: 'Result', url: '/output/result.png', kind: 'image', canvas_kind: 'smart', canvas_name: 'Demo Canvas' }] } }));
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [] } }));

  await page.goto('/static/asset-manager.html');
  await expect(page.getByText('素材库管理', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ legacy: [...document.scripts].some(script => /asset-manager\.js/.test(script.src)), global: typeof (window as typeof window & { renderAssetLibrary?: unknown }).renderAssetLibrary }))).toEqual({ legacy: false, global: 'undefined' });
  await expect(page.locator('#assetTabAssets, #assetTabWorkflows, #assetTabPrompts, #assetTabCanvasAssets, #assetTabLocal')).toHaveCount(5);
  await expect(page.locator('[data-tab="shared"]')).toHaveCount(0);
  await expect(page.getByText('Hero', { exact: true })).toBeVisible();
  await expect(page.locator('.asset-manager-root > .asset-panel')).toHaveCount(3);
  await page.locator('[data-asset-card="asset-1"]').click();
  await expect(page.locator('[data-asset-inline-name="asset-1"]')).toHaveValue('Hero');

  await page.getByRole('button', { name: '批量管理' }).click();
  await page.locator('[data-asset-check="asset-1"]').check();
  await page.getByRole('button', { name: '删除所选' }).click();
  await expect.poll(() => deletedAssets).toMatchObject({ library_id: 'default', ids: ['asset-1'] });

  await page.locator('#assetTabPrompts').click();
  await page.getByRole('button', { name: '新增' }).click();
  await page.getByLabel('名称').fill('电影感人像');
  await page.getByLabel('正向提示词').fill('cinematic portrait');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => savedPrompt).toMatchObject({ library_id: 'system', name: '电影感人像', positive: 'cinematic portrait', category: 'custom' });

  await page.locator('#assetTabLocal').click();
  await expect(page.locator('.asset-card-name', { hasText: 'Local' }).first()).toBeVisible();
  await page.locator('#assetTabCanvasAssets').click();
  await expect(page.locator('.asset-card-name', { hasText: 'Result' }).first()).toBeVisible();
});

test('asset manager preserves existing authentication and registers every media kind with the original contracts', async ({ page }) => {
  const imageItem = { id: 'image-1', name: 'Certified portrait', url: '/assets/portrait.png', kind: 'image', registrations: { volcengine: { provider_id: 'volc', status: 'Active', task_id: 'task-active', asset_uri: 'asset://portrait-certified' } } };
  const videoItem = { id: 'video-1', name: 'Avatar clip', url: '/assets/avatar.mp4', kind: 'video', registrations: {} };
  const videoLibrary = { active_library_id: 'default', libraries: [{ id: 'default', name: '默认资产库', type: 'asset', categories: [{ id: 'videos', name: '角色', type: 'image', items: [imageItem, videoItem] }] }] };
  const queuedVideoItem = { ...videoItem, registrations: { volcengine: { provider_id: 'volc', status: 'Queued' } } };
  const queuedVideoLibrary = { active_library_id: 'default', libraries: [{ id: 'default', name: '默认资产库', type: 'asset', categories: [{ id: 'videos', name: '角色', type: 'image', items: [imageItem, queuedVideoItem] }] }] };
  let uploadedBatch: Record<string, unknown> | null = null;
  let registered: Record<string, unknown> | null = null;
  await page.route('**/api/asset-library', route => route.fulfill({ json: { library: videoLibrary } }));
  await page.route('**/api/ai/upload', route => route.fulfill({ json: { files: [{ url: '/assets/new.png', name: 'new.png' }] } }));
  await page.route('**/api/asset-library/items/batch', async route => { uploadedBatch = route.request().postDataJSON(); await route.fulfill({ json: { library: videoLibrary, items: [] } }); });
  await page.route('**/api/asset-library/items/video-1/register-avatar', async route => {
    registered = route.request().postDataJSON();
    await route.fulfill({ json: { library: queuedVideoLibrary, item: queuedVideoItem, status: 'Queued' } });
  });
  await page.route('**/api/asset-library/items/video-1/avatar-status', route => route.fulfill({ json: { library: queuedVideoLibrary, item: queuedVideoItem, status: 'Queued' } }));
  await page.route('**/api/prompt-libraries', route => route.fulfill({ json: { library: { active_library_id: 'system', libraries: [] } } }));
  await page.route('**/api/local-assets', route => route.fulfill({ json: { items: [], tree: { id: '__root__', name: '全部上传', path: '', items: [], children: [] } } }));
  await page.route('**/api/shared-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvas-assets', route => route.fulfill({ json: { categories: [], items: [] } }));
  await page.route('**/api/providers', route => route.fulfill({ json: { providers: [{ id: 'volc', name: '火山引擎', protocol: 'volcengine', enabled: true, has_key: true }] } }));

  await page.goto('/static/asset-manager.html');
  await page.locator('.asset-card').filter({ hasText: 'Certified portrait' }).locator('.asset-thumb').click();
  await expect(page.getByText('已认证可用')).toBeVisible();
  await expect(page.getByText('asset://portrait-certified')).toBeVisible();
  await expect(page.getByRole('button', { name: '复制 asset:// 地址' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重新注册到该平台' })).toBeVisible();
  await expect(page.locator('.avatar-provider-select')).toHaveValue('volc');

  await page.locator('input[type="file"]').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: Buffer.from('png') });
  await expect.poll(() => uploadedBatch).toMatchObject({ library_id: 'default', category_id: 'videos', items: [{ library_id: 'default', category_id: 'videos', url: '/assets/new.png', name: 'new.png' }] });

  await page.locator('[data-asset-card="video-1"]').click();
  await expect(page.locator('.avatar-provider-select')).toHaveValue('volc');
  await page.getByRole('button', { name: '注册并等待审核' }).click();
  await expect.poll(() => registered).toEqual({ library_id: 'default', provider_id: 'volc' });
  await expect(page.locator('.avatar-head').filter({ hasText: '排队中' })).toBeVisible();
});
