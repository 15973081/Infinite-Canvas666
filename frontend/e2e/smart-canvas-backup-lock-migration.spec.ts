import { expect, test, type Page, type Route } from '@playwright/test';

async function mockBackupLock(page: Page, options: { locked?: boolean; running?: boolean } = {}) {
  let otherLock = Boolean(options.locked);
  let document: Record<string, any> = {
    id: 'smart-backup-lock', kind: 'smart', schemaVersion: 1, title: 'Local canvas', updated_at: 1, connections: [],
    nodes: [{ id: 'image', type: 'smart-image', title: 'Local run', x: 220, y: 150, running: Boolean(options.running), images: [{ name: 'local.png', url: '/local.png' }] }],
  };
  let remoteDocument: Record<string, any> | null = null;
  let blockNextSave = false;
  let releaseSave: (() => void) | null = null;
  let saveStarted = 0;
  let backups = [
    { filename: 'backup-1.json', title: 'First backup', timestamp: 1_760_000_000_000, node_count: 3, size: 1536 },
    { filename: 'backup-2.json', title: 'Second backup', timestamp: 1_760_000_001_000, node_count: 1, size: 800 },
  ];
  const lockRequests: string[] = [];
  const savedPayloads: Array<Record<string, any>> = [];
  let backupCreates = 0;
  let restoreCalls = 0;
  const deleted: string[] = [];
  const fulfillCanvas = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'GET') { await route.fulfill({ json: { canvas: remoteDocument || document } }); return; }
    const payload = request.postDataJSON() as Record<string, any>;
    saveStarted += 1;
    if (blockNextSave) {
      blockNextSave = false;
      await new Promise<void>((resolve) => { releaseSave = resolve; });
    }
    document = { ...document, ...payload, updated_at: Number(document.updated_at) + 1 };
    remoteDocument = null;
    savedPayloads.push(payload);
    await route.fulfill({ json: { canvas: document } });
  };
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-backup-lock/lock/release', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-backup-lock/lock', async route => {
    lockRequests.push(route.request().method());
    const holder = otherLock ? { client_id: 'other-client', username: 'Alice', ip: '10.0.0.8' } : { client_id: String((route.request().postDataJSON?.() || {}).client_id || 'browser-client'), username: 'Bob' };
    if (route.request().method() === 'GET') { await route.fulfill({ json: { holder: otherLock ? holder : null } }); return; }
    if (otherLock) { await route.fulfill({ status: 409, json: { detail: { holder } } }); return; }
    await route.fulfill({ json: { ok: true, holder, renewed: lockRequests.filter(method => method === 'POST').length > 1 } });
  });
  await page.route('**/api/canvases/smart-backup-lock/backups/*/restore', async route => {
    restoreCalls += 1;
    document = { ...document, title: 'Restored canvas', updated_at: Number(document.updated_at) + 10, nodes: [{ id: 'restored', type: 'prompt', text: 'from backup', x: 100, y: 100 }] };
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route(/\/api\/canvases\/smart-backup-lock\/backups\/[^/]+$/, async route => {
    const filename = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) || '');
    deleted.push(filename); backups = backups.filter(backup => backup.filename !== filename);
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/canvases/smart-backup-lock/backups', route => route.fulfill({ json: { backups } }));
  await page.route('**/api/canvases/smart-backup-lock/backup', async route => { backupCreates += 1; await route.fulfill({ json: { updated_at: 1_760_000_010_000 } }); });
  await page.route('**/api/canvases/smart-backup-lock/meta', route => route.fulfill({ json: { id: 'smart-backup-lock', updated_at: Number((remoteDocument || document).updated_at) } }));
  await page.route('**/api/canvases/smart-backup-lock', fulfillCanvas);
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mP8z8AARMAgYKSBEwAA//8DAJ0CAQn7fksAAAAASUVORK5CYII=', 'base64');
  await page.route('**/local.png', route => route.fulfill({ body: png, contentType: 'image/png' }));
  return {
    activateRemote() {
      remoteDocument = { ...document, title: 'Remote canvas', updated_at: Number(document.updated_at) + 1, nodes: [{ id: 'image', type: 'smart-image', title: 'Stale remote', x: 500, y: 400, running: false, images: [{ name: 'local.png', url: '/local.png' }, { name: 'remote.png', url: '/remote.png' }] }] };
    },
    allowLock() { otherLock = false; },
    backupCreates: () => backupCreates,
    blockSave() { blockNextSave = true; },
    deleted,
    lockRequests,
    releaseSave() { releaseSave?.(); },
    restoreCalls: () => restoreCalls,
    savedPayloads,
    saveStarted: () => saveStarted,
  };
}

test('migrates backup DOM and waits for an in-flight save before restore', async ({ page }) => {
  const state = await mockBackupLock(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-backup-lock');
  await page.locator('#smartBackupToggle').click();
  const modal = page.locator('#smartBackupModal.log-modal.open');
  await expect(modal.locator('.backup-panel')).toBeVisible();
  await expect(modal.locator('[data-backup-filename="backup-1.json"]')).toContainText('First backup');
  await expect(modal.locator('[data-backup-filename="backup-1.json"]')).toContainText('3 个节点');
  await expect(modal.locator('[data-backup-filename="backup-1.json"]')).toContainText('1.5 KB');
  await modal.locator('.backup-create').click();
  await expect.poll(state.backupCreates).toBe(1);
  await modal.locator('[data-backup-delete="backup-2.json"]').click();
  await expect.poll(() => state.deleted).toEqual(['backup-2.json']);

  state.blockSave();
  await page.evaluate(() => window.CanvasBoardV2?.updateNode('image', { title: 'dirty before restore' }));
  await expect.poll(state.saveStarted).toBeGreaterThan(0);
  page.once('dialog', dialog => void dialog.accept());
  await modal.locator('[data-backup-restore="backup-1.json"]').click();
  await new Promise(resolve => setTimeout(resolve, 150));
  expect(state.restoreCalls()).toBe(0);
  state.releaseSave();
  await expect.poll(state.restoreCalls).toBe(1);
  await expect(modal).toHaveCount(0);
  await expect(page.locator('#smartTitle')).toHaveText('Restored canvas');
});

test('preserves lock overlay, read-only behavior, retry and five-second renewal', async ({ page }) => {
  const state = await mockBackupLock(page, { locked: true });
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-backup-lock');
  const overlay = page.locator('#smartLockOverlay:not([hidden])');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('#smartLockMessage')).toHaveText('Alice 正在编辑此画布');
  await expect(page.locator('#smartLockBadge.other')).toContainText('Alice 编辑中');
  expect(await page.evaluate(() => window.CanvasBoardV2?.addNode('smart-image'))).toBeNull();
  await page.locator('#smartBackupToggle').click();
  await page.locator('#smartBackupModal [data-backup-restore="backup-1.json"]').click();
  await expect(page.locator('#toast')).toContainText('画布正在被其他人编辑，无法恢复备份');
  expect(state.restoreCalls()).toBe(0);
  await page.locator('#smartBackupModal .log-head button').click();

  state.allowLock();
  await overlay.locator('#smartLockRetryBtn').click();
  await expect(page.locator('#smartLockOverlay')).toBeHidden();
  await expect(page.locator('#smartLockBadge.mine')).toContainText('你正在编辑');
  const postsAfterRetry = state.lockRequests.filter(method => method === 'POST').length;
  await expect.poll(() => state.lockRequests.filter(method => method === 'GET').length, { timeout: 7_000 }).toBeGreaterThan(0);
  await expect.poll(() => state.lockRequests.filter(method => method === 'POST').length, { timeout: 7_000 }).toBeGreaterThan(postsAfterRetry);
});

test('merges remote updates without overwriting an in-flight Smart node', async ({ page }) => {
  const state = await mockBackupLock(page, { running: true });
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-backup-lock');
  await expect.poll(() => page.evaluate(() => Boolean(window.CanvasBoardV2))).toBe(true);
  await page.waitForTimeout(100);
  state.activateRemote();
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'canvas_updated', canvas_id: 'smart-backup-lock', client_id: 'remote-client', updated_at: 2 } })));
  await expect.poll(() => state.savedPayloads.length).toBeGreaterThan(0);
  const merged = state.savedPayloads.at(-1)!;
  expect(merged.nodes[0]).toMatchObject({ id: 'image', title: 'Local run', running: true });
  expect(merged.nodes[0].images).toMatchObject([{ name: 'local.png', url: '/local.png' }, { name: 'remote.png', url: '/remote.png' }]);
});
