import { expect, test, type Page } from '@playwright/test';

async function mockMentionPicker(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-mention', kind: 'smart', schemaVersion: 1, title: 'Smart mention', updated_at: 1,
    connections: [
      { from: 'reference-a', to: 'generator-1' },
      { from: 'reference-b', to: 'generator-1' },
      { from: 'generator-1', to: 'output-1' },
    ],
    nodes: [
      { id: 'reference-a', type: 'image', x: 20, y: 80, name: '山谷', mediaKind: 'image', url: '/static/images/logo.png?reference=a' },
      { id: 'reference-b', type: 'image', x: 20, y: 280, name: '海面', mediaKind: 'image', url: '/static/images/logo.png?reference=b' },
      { id: 'generator-1', type: 'generator', x: 260, y: 140, apiProvider: 'provider-a', model: 'image-a' },
      { id: 'output-1', type: 'output', x: 560, y: 140, w: 460, h: 320, images: [] },
    ],
  };
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [{ id: 'provider-a', name: 'Provider A', image_models: ['image-a'], video_models: [] }] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/asset-library', route => route.fulfill({ json: { library: {
    active_library_id: 'library-a',
    libraries: [{ id: 'library-a', name: '主资产库', categories: [{ id: 'folder-a', name: '人物', type: 'image', items: [{ id: 'asset-a', kind: 'image', name: '资产角色', url: '/static/images/logo.png?asset=a' }] }] }],
  } } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-mention/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-mention', async route => {
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

async function openMentionComposer(page: Page) {
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-mention');
  await page.locator('[data-node-id="output-1"] .node-head').click();
  await expect(page.locator('#composer.composer.open')).toBeVisible();
  return page.locator('#composer');
}

test('migrates @ sources, token preview, blocked references and persisted reference order', async ({ page }) => {
  const state = await mockMentionPicker(page);
  const composer = await openMentionComposer(page);
  const prompt = composer.locator('#promptInput');

  await prompt.fill('让 ');
  await prompt.pressSequentially('@');
  await expect(composer.locator('#mentionPicker.mention-picker.open')).toBeVisible();
  await expect(composer.locator('[data-mention-source="input"]')).toHaveClass(/\bactive\b/);
  await expect(composer.locator('.mention-option')).toHaveCount(2);
  await composer.locator('.mention-option').first().click();
  await expect(prompt.locator('.mention-image-token')).toHaveCount(1);
  await expect(prompt.locator('.mention-image-token')).toHaveAttribute('data-name', '山谷');

  await prompt.locator('.mention-image-token').hover();
  await expect(page.locator('#mentionPreview.mention-preview')).toBeVisible();
  await expect(page.locator('#mentionPreview img')).toHaveAttribute('src', /reference=a/);

  const firstThumb = composer.locator('#inputThumbsRow .input-thumb').first();
  await firstThumb.click();
  await expect(firstThumb).toHaveClass(/\binput-blocked\b/);
  await expect.poll(() => state.saves.at(-1)?.nodes.find((node: any) => node.id === 'output-1')?.blockedInputRefs).toEqual(['reference-a|0']);

  await prompt.press('End');
  await prompt.pressSequentially('@');
  await composer.locator('[data-mention-source="asset"]').click();
  await expect(composer.locator('.mention-library-select')).toHaveValue('library-a');
  await expect(composer.locator('.mention-folder-chip.active')).toContainText('人物');
  await composer.locator('.mention-option').click();
  await expect(prompt.locator('.mention-image-token')).toHaveCount(2);
  await expect(prompt.locator('.mention-image-token').nth(1)).toHaveAttribute('data-name', '资产角色');

  const thumbs = composer.locator('#inputThumbsRow .input-thumb');
  await expect(thumbs).toHaveCount(3);
  await thumbs.nth(0).dragTo(thumbs.nth(1));
  await expect.poll(() => state.saves.at(-1)?.nodes.find((node: any) => node.id === 'output-1')?.inputRefOrder).toEqual(['reference-b|0', 'reference-a|0', 'url|/static/images/logo.png?asset=a']);

  await page.reload();
  const restored = await openMentionComposer(page);
  await expect(restored.locator('#promptInput .mention-image-token')).toHaveCount(2);
  await expect(restored.locator('#inputThumbsRow .input-thumb').first()).toHaveAttribute('data-node-id', 'reference-b');
});
