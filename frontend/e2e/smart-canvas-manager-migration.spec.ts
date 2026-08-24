import { expect, test, type Page } from '@playwright/test';

type ManagerState = {
  active: Array<Record<string, unknown>>;
  createPayload: Record<string, unknown>;
  trash: Array<Record<string, unknown>>;
};

async function mockSmartCanvasManager(page: Page): Promise<ManagerState> {
  const state: ManagerState = {
    active: [
      { id: 'smart-recent', title: 'Smart recent', kind: 'smart', folder_id: 'folder-a', icon: 'sparkles', updated_at: 30 },
      { id: 'smart-root', title: 'Smart root', kind: 'smart', folder_id: '', icon: 'sparkles', updated_at: 20 },
      { id: 'classic-hidden', title: 'Classic hidden', kind: 'classic', folder_id: '', updated_at: 40 },
    ],
    createPayload: {},
    trash: [{ id: 'smart-deleted', title: 'Smart deleted', kind: 'smart', deleted_at: 50 }],
  };
  const folders = [
    { id: 'folder-a', name: 'Folder A', parent_id: '' },
    { id: 'folder-child', name: 'Folder child', parent_id: 'folder-a' },
  ];
  const createdDocument = {
    id: 'created-smart',
    kind: 'smart',
    schemaVersion: 1,
    title: 'Migrated smart',
    updated_at: 60,
    connections: [],
    nodes: [],
  };

  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: state.trash } }));
  await page.route('**/api/canvases/created-smart/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/created-smart', route => route.fulfill({ json: { canvas: createdDocument } }));
  await page.route('**/api/canvases', async route => {
    if (route.request().method() === 'POST') {
      state.createPayload = JSON.parse(route.request().postData() || '{}');
      state.active.push(createdDocument);
      await route.fulfill({ json: { canvas: createdDocument } });
      return;
    }
    await route.fulfill({ json: { canvases: state.active } });
  });

  return state;
}

test('uses the complete legacy manager DOM and CSS classes from the real Smart Canvas entry', async ({ page }) => {
  await mockSmartCanvasManager(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1');

  const manager = page.locator('.canvas-modern-manager');
  await expect(manager).toBeVisible();
  await expect(manager.locator('.canvas-gate > .gate-panel')).toHaveCount(1);
  await expect(manager.locator('.canvas-modern-gate')).toHaveCount(0);
  await expect(manager.locator('.gate-sort-btn')).toHaveCount(2);
  await expect(manager.locator('.gate-folder-pane .gate-folder-node')).toHaveCount(4);
  await expect(manager.locator('.gate-canvas-pane > .gate-list .canvas-item')).toHaveCount(2);
  await expect(manager.getByText('Classic hidden')).toHaveCount(0);

  await manager.locator('.gate-folder-node[data-folder-id="folder-a"] > .gate-folder-main').click();
  await expect(manager.locator('.gate-list .canvas-item')).toHaveCount(1);
  await expect(manager.locator('.canvas-item[data-canvas-id="smart-recent"]')).toBeVisible();

  await manager.locator('.gate-trash-entry').click();
  await expect(manager.locator('.canvas-gate')).toHaveClass(/trash-mode/);
  await expect(manager.locator('.trash-note')).toBeVisible();
  await expect(manager.locator('.canvas-item[data-canvas-id="smart-deleted"]')).toBeVisible();
});

test('keeps Smart Canvas creation on the complete manager path', async ({ page }) => {
  const state = await mockSmartCanvasManager(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1');

  const manager = page.locator('.canvas-modern-manager');
  await manager.locator('.primary-btn').click();
  await expect(manager.locator('.canvas-gate')).toHaveClass(/creating/);
  await expect(manager.locator('.gate-create-row')).toBeVisible();
  await manager.locator('.gate-name-input').fill('Migrated smart');
  await manager.locator('.create-confirm').click();

  await expect(page.locator('.canvas-modern-editor')).toBeVisible();
  expect(state.createPayload).toMatchObject({
    icon: 'sparkles',
    kind: 'smart',
    title: 'Migrated smart',
  });
});
