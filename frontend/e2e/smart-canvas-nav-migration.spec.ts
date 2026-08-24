import { expect, test, type Page } from '@playwright/test';

async function mockSmartCanvasNav(page: Page) {
  const document = {
    id: 'smart-nav',
    kind: 'smart',
    schemaVersion: 1,
    title: 'Smart navigation',
    updated_at: 1_725_000_000,
    connections: [],
    nodes: [],
  };
  await page.addInitScript(() => localStorage.setItem('canvasUserName', 'Bob'));
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-nav/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-nav/backups', route => route.fulfill({ json: { backups: [] } }));
  await page.route('**/api/canvases/smart-nav', route => route.fulfill({ json: { canvas: document } }));
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/asset-library', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
}

test('preserves the legacy Smart Canvas navigation DOM, states and responsive position', async ({ page }) => {
  await mockSmartCanvasNav(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-nav');

  const shell = page.locator('#smartCanvasApp > #shell');
  const nav = shell.locator(':scope > .smart-nav');
  await expect(nav).toBeVisible();
  await expect(nav.locator('.smart-nav-back')).toHaveCount(1);
  await expect(nav.locator('#smartTitle.smart-title')).toHaveText('Smart navigation');
  await expect(nav.locator('#smartCanvasTime.smart-canvas-time')).not.toHaveText('--');
  await expect(nav.locator('#smartLockBadge.smart-lock-badge.mine')).toContainText('你正在编辑');
  await expect(nav.locator('#smartIdentityBtn.smart-identity-btn #smartIdentityLabel')).toHaveText('Bob');
  await expect(shell.locator('.canvas-nav')).toHaveCount(0);

  await expect(shell.locator('#smartWorkflowToggle.smart-workflow-toggle')).toBeVisible();
  await expect(shell.locator('#smartShortcutToggle.smart-shortcut-toggle')).toBeVisible();
  await expect(shell.locator('#smartCostToggle.smart-cost-toggle')).toBeVisible();
  await expect(shell.locator('#smartLogToggle.smart-log-toggle')).toBeVisible();
  await expect(shell.locator('#smartBackupToggle.smart-backup-toggle')).toBeVisible();
  await expect(shell.locator('#assetToggle.asset-toggle')).toBeVisible();
  await expect(nav).toHaveCSS('top', '22px');

  await page.setViewportSize({ height: 720, width: 800 });
  await expect(nav).toHaveCSS('top', '70px');
  await expect(shell.locator('#smartWorkflowToggle span')).toBeHidden();
});

test('keeps the migrated navigation buttons wired to their existing React functions', async ({ page }) => {
  await mockSmartCanvasNav(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-nav');
  const shell = page.locator('#smartCanvasApp > #shell');

  await shell.locator('#smartShortcutToggle').click();
  await expect(shell.locator('#smartShortcutModal.shortcut-modal.open')).toBeVisible();
  await expect(shell.locator('#smartShortcutModal .shortcut-item')).toHaveCount(12);
  await shell.locator('#smartShortcutModal .preview-icon-btn').click();
  await expect(shell.locator('#smartShortcutModal')).not.toHaveClass(/\bopen\b/);

  await shell.locator('#smartWorkflowToggle').click();
  await expect(shell.locator('#smartWorkflowTransferModal.workflow-transfer-panel.open')).toContainText('导入导出工作流');
  await shell.locator('#smartWorkflowTransferModal .workflow-transfer-head button').click();

  await shell.locator('#smartCostToggle').click();
  await expect(shell.locator('.canvas-modern-backups')).toContainText('费用汇总');
  await shell.locator('.canvas-modern-backups header button').click();

  await shell.locator('#smartLogToggle').click();
  await expect(shell.locator('.canvas-modern-backups')).toContainText('生成日志');
  await shell.locator('.canvas-modern-backups header button').click();

  await shell.locator('#smartBackupToggle').click();
  await expect(shell.locator('.canvas-modern-backups')).toContainText('画布备份');
  await shell.locator('.canvas-modern-backups header button').click();

  await shell.locator('#assetToggle').click();
  await expect(shell.locator('#assetPanel.asset-panel.open')).toBeVisible();
});

test('keeps the legacy back-navigation destination', async ({ page }) => {
  await mockSmartCanvasNav(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-nav');
  await page.locator('#smartCanvasApp .smart-nav-back').click();
  await expect(page).toHaveURL(/\/static\/canvas\.html/);
});
