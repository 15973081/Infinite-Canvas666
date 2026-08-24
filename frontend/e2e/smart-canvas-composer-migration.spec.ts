import { expect, test, type Page } from '@playwright/test';

async function mockSmartCanvasComposer(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-composer', kind: 'smart', schemaVersion: 1, title: 'Smart composer', updated_at: 1,
    connections: [
      { from: 'prompt-1', to: 'generator-1' },
      { from: 'reference-1', to: 'generator-1' },
      { from: 'generator-1', to: 'output-1' },
    ],
    nodes: [
      { id: 'prompt-1', type: 'prompt', x: 20, y: 40, text: 'upstream cinematic prompt' },
      { id: 'reference-1', type: 'image', x: 20, y: 260, name: 'reference.png', mediaKind: 'image', url: '/static/images/logo.png' },
      { id: 'generator-1', type: 'generator', x: 240, y: 120, apiProvider: 'provider-a', model: 'image-a', ratio: 'square', resolution: '1k', quality: 'auto', count: 1 },
      { id: 'output-1', type: 'output', x: 500, y: 120, w: 460, h: 320, images: [{ kind: 'image', name: 'result.png', url: '/static/images/logo.png?result=1' }] },
    ],
  };
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/config', route => route.fulfill({ json: {
    api_providers: [
      { id: 'provider-a', name: 'Provider A', image_models: ['image-a', 'image-b'], video_models: ['video-a'] },
      { id: 'volcengine', name: '火山引擎', image_models: ['doubao-image'], video_models: ['seedance-video'] },
      { id: 'modelscope', name: 'ModelScope', image_models: ['custom-ms'] },
    ],
  } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [{ name: 'demo.json', title: 'Demo workflow' }] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-composer/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-composer', async route => {
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

async function openComposer(page: Page) {
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-composer');
  const output = page.locator('[data-node-id="output-1"]');
  await expect(output).toBeVisible();
  await output.locator('.node-head').click();
  await expect(page.locator('#composer.composer.open')).toBeVisible();
  return page.locator('#composer');
}

test('mounts the original Smart Canvas Composer DOM, position and reference media', async ({ page }) => {
  await mockSmartCanvasComposer(page);
  const composer = await openComposer(page);

  await expect(composer.locator('.composer-card')).toHaveCount(1);
  await expect(composer.locator('#engineSelect.engine-select')).toHaveValue('api');
  await expect(composer.locator('#apiKindToggle.kind-toggle [data-kind="image"]')).toHaveClass(/\bactive\b/);
  await expect(composer.locator('#inputThumbsRow.input-thumbs-row.has-items .input-thumb')).toHaveCount(2);
  await expect(composer.locator('#inputPromptPreview.input-prompt-preview.has-text')).toContainText('upstream cinematic prompt');
  await expect(composer.locator('#promptInput.prompt-input')).toHaveAttribute('contenteditable', 'true');
  await expect(composer.locator('#composerTemplateBtn.composer-template-btn')).toBeVisible();
  await expect(composer.locator('#dynamicParams.dynamic-params')).toContainText('Provider A');
  await expect(composer.locator('#cascadeRunBtn.cascade-run-btn')).toBeVisible();
  await expect(composer.locator('#runBtn.run-btn')).toBeVisible();
  await expect(composer).toHaveCSS('left', '460px');
  await expect(composer).toHaveCSS('top', '454px');
  await expect(composer).toHaveCSS('width', '540px');
});

test('switches engines and image/video modes while rendering and saving dynamic parameters', async ({ page }) => {
  const state = await mockSmartCanvasComposer(page);
  const composer = await openComposer(page);

  await composer.locator('#engineSelect').selectOption('modelscope');
  await expect(composer.locator('#apiKindToggle')).toBeHidden();
  await expect(composer.locator('#dynamicParams')).toContainText('Z-Image Turbo');
  await expect.poll(() => state.saves.at(-1)?.nodes.find((node: any) => node.id === 'generator-1')?.type).toBe('msgen');

  await composer.locator('#engineSelect').selectOption('api');
  await composer.locator('#apiKindToggle [data-kind="video"]').click();
  await expect(composer.locator('#apiKindToggle [data-kind="video"]')).toHaveClass(/\bactive\b/);
  await expect(composer.locator('#dynamicParams')).toContainText('video-a');
  await expect.poll(() => state.saves.at(-1)?.nodes.find((node: any) => node.id === 'generator-1')?.type).toBe('video');

  await composer.locator('#apiKindToggle [data-kind="image"]').click();
  await composer.getByRole('button', { name: '分辨率' }).click();
  await composer.locator('.direct-option[data-param="分辨率"][data-value="custom"]').click();
  await expect(composer.getByLabel('宽')).toBeVisible();
  await expect(composer.getByLabel('高')).toBeVisible();
  await expect.poll(() => state.saves.at(-1)?.nodes.find((node: any) => node.id === 'generator-1')).toMatchObject({ type: 'generator', resolution: 'custom' });
});

test('persists prompt drafts, opens the prompt library and runs the selected generator', async ({ page }) => {
  const state = await mockSmartCanvasComposer(page);
  const composer = await openComposer(page);
  await page.evaluate(() => {
    const target = window as typeof window & { __composerRuns?: Array<{ id: string; mode?: string }> };
    target.__composerRuns = [];
    if (target.CanvasBoardV2) target.CanvasBoardV2.runNode = async (id, mode) => { target.__composerRuns!.push({ id, mode }); };
  });

  await composer.locator('#promptInput').fill('new composer prompt');
  await composer.locator('.composer-head').click();
  await expect.poll(() => state.saves.at(-1)?.nodes.find((node: any) => node.id === 'output-1')?.promptDraftText).toBe('new composer prompt');

  await composer.locator('#composerTemplateBtn').click();
  await expect(page.locator('#promptTemplatePanel.prompt-template-panel.open[data-target="composer"]')).toBeVisible();
  await page.locator('#promptTemplateClose').click();

  await composer.locator('#runBtn').click();
  await composer.locator('#cascadeRunBtn').click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __composerRuns?: unknown[] }).__composerRuns)).toEqual([
    { id: 'generator-1', mode: 'node' },
    { id: 'generator-1', mode: 'cascade' },
  ]);
});
