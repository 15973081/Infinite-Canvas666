import { expect, test, type Page } from '@playwright/test';

async function mockSmartCanvasShell(page: Page, locked = false) {
  const document = {
    id: 'smart-shell',
    kind: 'smart',
    schemaVersion: 1,
    title: 'Smart shell',
    updated_at: 1,
    connections: [],
    nodes: [],
  };
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-shell/lock', route => route.fulfill(locked
    ? { status: 409, json: { detail: { message: 'locked', holder: { client_id: 'other', username: 'Alice', ip: '10.0.0.2' } } } }
    : { json: { ok: true } }));
  await page.route('**/api/canvases/smart-shell', route => route.fulfill({ json: { canvas: document } }));
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
}

test('mounts the React editor with the legacy Smart Canvas shell DOM and CSS', async ({ page }) => {
  await mockSmartCanvasShell(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-shell');

  const root = page.locator('#smartCanvasApp');
  const shell = root.locator(':scope > #shell');
  await expect(shell).toBeVisible();
  await expect(shell).toHaveClass(/\bshell\b/);
  await expect(shell.locator(':scope > #world.world')).toHaveCount(1);
  await expect(shell.locator(':scope > #selectionBox.selection-box')).toHaveCount(1);
  await expect(shell.locator(':scope > #toast.toast')).toHaveCount(1);
  await expect(page.locator('#shell')).toHaveCount(1);
  await expect(page.locator('#world')).toHaveCount(1);
  await expect(page.locator('link[href*="/static/css/smart-canvas.css"]')).toBeEnabled();
  await expect(shell).toHaveCSS('background-size', '24px 24px');
});

test('uses the legacy read-only body state and lock overlay DOM', async ({ page }) => {
  await mockSmartCanvasShell(page, true);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-shell');

  await expect(page.locator('body')).toHaveClass(/\bsmart-canvas-readonly\b/);
  const overlay = page.locator('#smartCanvasApp #smartLockOverlay.smart-lock-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.smart-lock-card')).toContainText('Alice');
  await expect(overlay.locator('#smartLockRetryBtn')).toBeVisible();
  await expect(page.locator('.canvas-modern-readonly-overlay')).toHaveCount(0);
});
