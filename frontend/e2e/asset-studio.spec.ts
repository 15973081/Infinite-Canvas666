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

  await page.goto('/static/asset-manager.html');
  await expect(page.getByRole('heading', { name: '素材工作台' })).toBeVisible();
  expect(await page.evaluate(() => ({ legacy: [...document.scripts].some(script => /asset-manager\.js/.test(script.src)), global: typeof (window as typeof window & { renderAssetLibrary?: unknown }).renderAssetLibrary }))).toEqual({ legacy: false, global: 'undefined' });
  await expect(page.getByText('Hero', { exact: true })).toBeVisible();

  await page.getByLabel('选择 Hero').check();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '删除' }).click();
  await expect.poll(() => deletedAssets).toMatchObject({ library_id: 'default', ids: ['asset-1'] });

  await page.getByRole('button', { name: '提示词' }).click();
  await page.getByRole('button', { name: '新建提示词' }).click();
  await page.getByLabel('名称').fill('电影感人像');
  await page.getByLabel('正向提示词').fill('cinematic portrait');
  await page.getByRole('button', { name: '保存提示词' }).click();
  await expect.poll(() => savedPrompt).toMatchObject({ library_id: 'system', name: '电影感人像', positive: 'cinematic portrait', category: 'view' });

  await page.getByRole('button', { name: '本地素材' }).click();
  await expect(page.getByText('Local', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Canvas 素材' }).click();
  await expect(page.getByText('Result', { exact: true })).toBeVisible();
});
