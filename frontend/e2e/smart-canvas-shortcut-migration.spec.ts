import { expect, test, type Page } from '@playwright/test';

async function mockSmartCanvasShortcuts(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-shortcuts', kind: 'smart', schemaVersion: 1, title: 'Smart shortcuts', updated_at: 1, connections: [],
    nodes: [
      { id: 'left', type: 'smart-image', title: 'Left', x: 160, y: 160, images: [{ name: 'left.png', url: '/left.png' }] },
      { id: 'right', type: 'smart-image', title: 'Right', x: 1500, y: 760, images: [{ name: 'right.png', url: '/right.png' }] },
      { id: 'prompt', type: 'smart-prompt', title: 'Prompt', text: 'editable', x: 600, y: 500 },
    ],
  };
  const saves: Array<Record<string, any>> = [];
  let uploads = 0;
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-shortcuts/lock', route => route.fulfill({ json: route.request().method() === 'GET' ? { holder: null } : { ok: true } }));
  await page.route('**/api/canvases/smart-shortcuts', async route => {
    if (route.request().method() !== 'GET') {
      document = { ...document, ...route.request().postDataJSON(), updated_at: Number(document.updated_at) + 1 };
      saves.push(structuredClone(document));
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  await page.route('**/api/asset-library', route => route.fulfill({ json: { library: { active_library_id: 'default', libraries: [{ categories: [], id: 'default', items: [], name: '默认库' }] } } }));
  await page.route('**/api/ai/upload', async route => {
    uploads += 1;
    await route.fulfill({ json: { files: [{ kind: 'image', name: 'clipboard.png', url: '/clipboard.png' }] } });
  });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mP8z8AARMAgYKSBEwAA//8DAJ0CAQn7fksAAAAASUVORK5CYII=', 'base64');
  await page.route(/\/(left|right|clipboard)\.png$/, route => route.fulfill({ body: png, contentType: 'image/png' }));
  return { getDocument: () => document, saves, uploads: () => uploads };
}

async function openSmartShortcuts(page: Page) {
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-shortcuts');
  await expect(page.locator('[data-testid="canvas-board-v2"]')).toBeVisible();
}

test('preserves the legacy shortcut help DOM, Escape and A asset toggle', async ({ page }) => {
  await mockSmartCanvasShortcuts(page);
  await openSmartShortcuts(page);
  await page.locator('#smartShortcutToggle').click();
  const modal = page.locator('#smartShortcutModal.shortcut-modal.open');
  await expect(modal.locator('.shortcut-item')).toHaveCount(12);
  await expect(modal.locator('.shortcut-item').nth(2)).toContainText('CtrlShiftG');
  await expect(modal).toContainText('粘贴节点或剪贴板图片');
  await page.keyboard.press('Escape');
  await expect(page.locator('#smartShortcutModal')).not.toHaveClass(/\bopen\b/);

  await page.keyboard.press('a');
  const assets = page.locator('#assetPanel.asset-panel.open');
  await expect(assets).toBeVisible();
  const search = assets.locator('#assetNameSearch');
  await search.focus();
  await page.keyboard.press('a');
  await expect(assets).toBeVisible();
  await search.blur();
  await page.keyboard.press('a');
  await expect(page.locator('#assetPanel')).toHaveCount(0);
});

test('preserves Smart image grouping, ungrouping, copy, paste, delete and undo keys', async ({ page }) => {
  const state = await mockSmartCanvasShortcuts(page);
  await openSmartShortcuts(page);
  await page.locator('[data-node-type="smart-image"][data-node-id="left"]').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('[data-node-type="smart-image"][data-node-id="left"]')).toHaveClass(/\bselected\b/);
  await page.keyboard.down('Control');
  await page.locator('[data-node-type="smart-image"][data-node-id="right"]').click({ position: { x: 2, y: 2 } });
  await page.keyboard.up('Control');
  await expect(page.locator('[data-node-id].selected')).toHaveCount(2);
  await page.keyboard.press('Control+g');
  await expect(page.locator('[data-node-type="smart-image"][data-node-id^="smart_"]')).toHaveCount(1);
  await expect(page.locator('[data-node-type="smart-image"][data-node-id^="smart_"] .thumb-item')).toHaveCount(2);
  await expect.poll(() => state.saves.length).toBeGreaterThan(0);

  await page.keyboard.press('Control+Shift+g');
  await expect(page.locator('[data-node-type="smart-image"][data-node-id^="smart_"]')).toHaveCount(2);
  await expect(page.locator('[data-node-type="smart-image"].selected')).toHaveCount(2);
  expect(await page.evaluate(() => window.getSelection?.()?.toString() || '')).toBe('');
  await page.keyboard.press('Control+C');
  await expect(page.locator('#toast')).toContainText('已复制 2 个节点');
  await page.keyboard.press('Control+V');
  await expect(page.locator('#toast')).toContainText('已粘贴 2 个节点');
  await expect(page.locator('[data-node-type="smart-image"]')).toHaveCount(4);
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-node-type="smart-image"]')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-node-type="smart-image"]')).toHaveCount(4);

  const prompt = page.locator('[data-node-id="prompt"] textarea').first();
  await prompt.focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-node-id="prompt"]')).toHaveCount(1);
});

test('preserves Z overview/click location and clipboard media paste', async ({ page }) => {
  const state = await mockSmartCanvasShortcuts(page);
  await openSmartShortcuts(page);
  const board = page.locator('[data-testid="canvas-board-v2"]');
  const initial = await board.getAttribute('data-viewport');
  await page.keyboard.press('z');
  await expect(page.locator('#shell')).toHaveClass(/\bzoom-preview\b/);
  await expect.poll(() => board.getAttribute('data-viewport')).not.toBe(initial);
  await page.locator('[data-node-id="right"]').click({ force: true });
  await expect(page.locator('#shell')).not.toHaveClass(/\bzoom-preview\b/);

  await board.hover({ position: { x: 500, y: 300 } });
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'clipboard.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }));
  });
  await expect.poll(state.uploads).toBe(1);
  await expect.poll(() => state.getDocument().nodes.some((node: Record<string, any>) => Array.isArray(node.images) && node.images.some((image: Record<string, any>) => image.url === '/clipboard.png'))).toBe(true);
});
