import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  let active = [
    { id: 'recent', title: '最近画布', kind: 'classic', folder_id: 'folder-a', icon: 'layers', updated_at: 30, owner: '项目 A' },
    { id: 'alpha', title: 'Alpha', kind: 'classic', folder_id: '', icon: 'palette', updated_at: 10 },
    { id: 'smart', title: '智能画布', kind: 'smart', folder_id: '', icon: 'sparkles', updated_at: 20 },
  ];
  let trash = [{ id: 'deleted', title: '已删除画布', kind: 'classic', deleted_at: 40 }];
  const folders = [{ id: 'folder-a', name: '项目 A', parent_id: '' }, { id: 'folder-child', name: '子项目', parent_id: 'folder-a' }];

  await page.route('**/api/canvas-rollout/events', (route) => route.fulfill({ json: { accepted: true } }));
  await page.route('**/api/canvas-rollout', (route) => route.fulfill({ json: { version: 1, configured_percentage: 100, effective_percentage: 100, enabled: true, kill_switch: false, blocked_reasons: [] } }));
  await page.route('**/api/config', (route) => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', (route) => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') await route.fulfill({ json: { folders } });
    else await route.fulfill({ json: { folders, folder: folders[0] } });
  });
  await page.route('**/api/canvases/trash', (route) => route.fulfill({ json: { canvases: trash } }));
  await page.route('**/api/canvases/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/canvases/trash') {
      await route.fulfill({ json: { canvases: trash } });
      return;
    }
    const id = decodeURIComponent(url.pathname.split('/')[3] || '');
    if (url.pathname.endsWith('/meta') && request.method() === 'POST') {
      const patch = JSON.parse(request.postData() || '{}');
      active = active.map((item) => item.id === id ? { ...item, ...patch } : item);
      await route.fulfill({ json: { canvas: active.find((item) => item.id === id) } });
      return;
    }
    if (url.pathname.endsWith('/folder') && request.method() === 'PATCH') {
      const patch = JSON.parse(request.postData() || '{}');
      active = active.map((item) => item.id === id ? { ...item, folder_id: patch.folder_id } : item);
      await route.fulfill({ json: { canvas: active.find((item) => item.id === id) } });
      return;
    }
    if (url.pathname.endsWith('/restore') && request.method() === 'POST') {
      const restored = trash.find((item) => item.id === id);
      if (restored) active.push(restored);
      trash = trash.filter((item) => item.id !== id);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (url.pathname.endsWith('/purge') && request.method() === 'DELETE') {
      trash = trash.filter((item) => item.id !== id);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (request.method() === 'DELETE') {
      const removed = active.find((item) => item.id === id);
      if (removed) trash.push({ ...removed, deleted_at: 50 });
      active = active.filter((item) => item.id !== id);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: { canvas: active.find((item) => item.id === id) } });
  });
  await page.route('**/api/canvases', async (route) => {
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      const created = { id: 'created', title: body.title, kind: body.kind, folder_id: body.folder_id, updated_at: 60 };
      active.push(created);
      await route.fulfill({ json: { canvas: created } });
      return;
    }
    await route.fulfill({ json: { canvases: active } });
  });
});

test('preserves the legacy Canvas manager DOM and CSS classes in React', async ({ page }) => {
  await page.goto('/static/canvas.html?canvas_v2_rollout=100');
  const manager = page.locator('.canvas-modern-manager');
  await expect(manager).toBeVisible();
  await expect(manager.locator('.canvas-gate > .gate-panel')).toHaveCount(1);
  await expect(manager.locator('.gate-head .gate-title')).toHaveText('选择画布');
  await expect(manager.locator('.gate-sort-btn')).toHaveCount(2);
  await expect(manager.locator('.gate-folder-pane .gate-folder-node')).toHaveCount(4);
  await expect(manager.locator('.gate-canvas-pane > .gate-list .canvas-item')).toHaveCount(3);
  await expect(manager.locator('.canvas-item.smart-canvas')).toHaveCount(1);
  await expect(manager.locator('.canvas-item').first()).toHaveClass(/canvas-item/);
  await expect(page.locator('#shell')).toBeHidden();
});

test('keeps sorting, folders, create mode, metadata and trash behavior', async ({ page }) => {
  await page.goto('/static/canvas.html?canvas_v2_rollout=100');
  const manager = page.locator('.canvas-modern-manager');

  await manager.getByRole('button', { name: '名称' }).click();
  await expect(manager.locator('.canvas-card-title').first()).toHaveText('智能画布');
  await manager.getByRole('button', { name: '最近编辑' }).click();
  await expect(manager.locator('.canvas-card-title').first()).toHaveText('最近画布');

  await manager.locator('.gate-folder-node[data-folder-id="folder-a"] > .gate-folder-main').click();
  await expect(manager.locator('.gate-list .canvas-item')).toHaveCount(1);
  await expect(manager.locator('.gate-folder-current')).toContainText('项目 A');

  await manager.getByRole('button', { name: '新建画布' }).click();
  await expect(manager.locator('.canvas-gate')).toHaveClass(/creating/);
  await expect(manager.locator('.gate-create-row')).toBeVisible();
  await manager.getByRole('button', { name: '取消' }).click();
  await expect(manager.locator('.canvas-gate')).not.toHaveClass(/creating/);

  await manager.locator('.gate-folder-node[data-folder-id="all"] > .gate-folder-main').click();
  const recent = manager.locator('.canvas-item[data-canvas-id="recent"]');
  await recent.locator('.canvas-preview-mark').click();
  await expect(page.locator('.canvas-meta-pop')).toBeVisible();
  await page.locator('.canvas-color-swatch.cc-blue').click();
  await expect(recent).toHaveClass(/has-color/);

  await manager.locator('.gate-title').click();
  await expect(page.locator('.canvas-meta-pop')).toHaveCount(0);
  await recent.hover();
  await recent.getByRole('button', { name: '移入回收站 最近画布' }).click();
  await expect(recent.locator('.canvas-delete-confirm')).toBeVisible();
  await recent.getByRole('button', { name: '确定' }).click();
  await expect(manager.locator('.canvas-item[data-canvas-id="recent"]')).toHaveCount(0);

  await manager.getByRole('button', { name: '打开回收站' }).click();
  await expect(manager.locator('.canvas-gate')).toHaveClass(/trash-mode/);
  await expect(manager.locator('.trash-note')).toBeVisible();
  await expect(manager.locator('.canvas-item[data-canvas-id="deleted"]')).toBeVisible();
});
