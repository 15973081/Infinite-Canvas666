import { expect, test, type Page } from '@playwright/test';

async function mockSmartCanvasPromptPreset(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-preset', kind: 'smart', schemaVersion: 1, title: 'Smart preset', updated_at: 1,
    connections: [],
    nodes: [{ id: 'prompt-1', type: 'prompt', x: 120, y: 100, text: '电影感山谷\n日落薄雾' }],
  };
  const saves: Array<Record<string, any>> = [];
  await page.addInitScript(() => localStorage.removeItem('smart_canvas_prompt_presets_v1'));
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-preset/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-preset', async route => {
    if (route.request().method() !== 'GET') {
      document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves.length + 2 };
      saves.push(structuredClone(document));
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  return { saves };
}

async function openPresetPanel(page: Page) {
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-preset');
  const prompt = page.locator('[data-node-id="prompt-1"]');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: '预设' }).click();
  await expect(page.locator('#promptPresetPanel.prompt-preset-panel.open')).toBeVisible();
  return page.locator('#promptPresetPanel');
}

test('keeps the original preset DOM and creates a local prompt preset', async ({ page }) => {
  const state = await mockSmartCanvasPromptPreset(page);
  const panel = await openPresetPanel(page);

  await expect(panel.locator('#promptPresetSelect')).toHaveValue('');
  await expect(panel.locator('#promptPresetApply')).toBeDisabled();
  await expect(panel.locator('#promptPresetDelete.danger')).toBeDisabled();
  await expect(panel.locator('#promptPresetNew')).toBeEnabled();
  await panel.locator('#promptPresetNew').click();

  await expect(panel.locator('#promptPresetName')).toHaveValue('电影感山谷');
  await expect(panel.locator('#promptPresetText')).toHaveValue('电影感山谷\n日落薄雾');
  await expect(panel.locator('#promptPresetStatus.ok')).toContainText('已存为新预设');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('smart_canvas_prompt_presets_v1') || '[]'))).toHaveLength(1);
  await expect.poll(() => state.saves.at(-1)?.nodes[0]?.promptPresetId).toBeTruthy();
});

test('saves and applies edits, then requires two clicks before deletion', async ({ page }) => {
  const state = await mockSmartCanvasPromptPreset(page);
  let panel = await openPresetPanel(page);
  await panel.locator('#promptPresetNew').click();
  await panel.locator('#promptPresetName').fill('新的名称');
  await panel.locator('#promptPresetText').fill('更新后的提示词');
  await panel.locator('#promptPresetSave').click();
  await expect(panel.locator('#promptPresetStatus.ok')).toContainText('预设修改已保存');
  await expect.poll(() => state.saves.at(-1)?.nodes[0]?.text).toBe('更新后的提示词');

  await panel.locator('#promptPresetApply').click();
  await expect(panel).toBeHidden();
  await page.locator('[data-node-id="prompt-1"]').getByRole('button', { name: '预设' }).click();
  panel = page.locator('#promptPresetPanel');
  await panel.locator('#promptPresetDelete').click();
  await expect(panel.locator('#promptPresetDelete.confirm-danger')).toHaveText('再次点击删除');
  await expect(panel.locator('#promptPresetStatus.warn')).toContainText('再次点击确认');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('smart_canvas_prompt_presets_v1') || '[]'))).toHaveLength(1);
  await panel.locator('#promptPresetDelete').click();
  await expect(panel.locator('#promptPresetStatus.ok')).toContainText('预设已删除');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('smart_canvas_prompt_presets_v1') || '[]'))).toEqual([]);
  await expect.poll(() => state.saves.at(-1)?.nodes[0]?.promptPresetId).toBeUndefined();
});
