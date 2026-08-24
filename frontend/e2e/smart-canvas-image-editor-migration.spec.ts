import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, includeVideo = false) {
  let uploads = 0;
  let saves = 0;
  let document: Record<string, any> = {
    id: 'smart-image-editor', kind: 'smart', schemaVersion: 1, title: 'Smart image editor', updated_at: 1, connections: [],
    nodes: [{
      id: 'smart-media', type: 'smart-image', title: 'Group', x: 180, y: 120, scale: .8,
      runSettings: { engine: 'modelscope', msResolution: '1024x1024' },
      images: includeVideo ? [{ kind: 'video', name: 'movie.mp4', url: '/movie.mp4' }] : [
        { kind: 'image', name: 'one.png', natural_h: 96, natural_w: 128, url: '/static/images/logo.png' },
        { kind: 'image', name: 'two.png', natural_h: 96, natural_w: 128, url: '/static/images/logo.png?two=1' },
      ],
    }],
  };
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  await page.route('**/api/canvases/smart-image-editor/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-image-editor', async route => {
    if (route.request().method() === 'PUT') { saves += 1; document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves + 1 }; }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/ai/upload', async route => {
    uploads += 1;
    const body = route.request().postDataBuffer()?.toString('latin1') || '';
    const names = [...body.matchAll(/filename="([^"]+)"/g)].map(match => match[1]);
    await route.fulfill({ json: { files: names.map((name, index) => ({ kind: 'image', name, url: `/uploads/editor-${uploads}-${index + 1}.png` })) } });
  });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARAwMjDAGjAIAAP//AwB8BwMDv4L2WQAAAABJRU5ErkJggg==', 'base64');
  await page.route(/\/uploads\/editor-\d+-\d+\.png(?:\?.*)?$/, route => route.fulfill({ body: png, contentType: 'image/png' }));
  await page.route('**/movie.mp4', route => route.fulfill({ body: '', contentType: 'video/mp4' }));
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-image-editor');
  return { getDocument: () => document, getUploads: () => uploads };
}

async function openPreview(page: Page, index = 0) {
  const node = page.locator('[data-node-id="smart-media"]');
  const thumb = node.locator(`.thumb-item[data-image-index="${index}"]`);
  if (await thumb.count()) await thumb.dispatchEvent('click');
  else await node.dispatchEvent('click');
  await node.locator('.smart-node-floating-menu button[title="预览"]').dispatchEvent('click');
  const preview = page.locator('[data-testid="smart-canvas-preview"]');
  await expect(preview).toBeVisible();
  return preview;
}

test('migrates crop and smart-image data writeback', async ({ page }) => {
  const state = await prepare(page);
  const preview = await openPreview(page);
  await preview.locator('[data-image-edit-mode="crop"]').click();
  const editor = page.locator('.image-edit-modal.open.canvas-modern-image-edit');
  await expect(editor).toBeVisible();
  await expect(editor.locator('.crop-canvas')).toHaveClass(/crop-canvas/);
  await editor.getByRole('button', { name: '应用裁剪', exact: true }).click();
  await expect.poll(() => state.getUploads()).toBe(1);
  await expect.poll(() => state.getDocument().nodes.find((node: any) => node.id === 'smart-media')?.images?.[0]?.url).toBe('/uploads/editor-1-1.png');
});

test('keeps outpaint size, prompt draft and engine-specific settings equivalent', async ({ page }) => {
  const state = await prepare(page);
  const preview = await openPreview(page);
  await preview.locator('[data-image-edit-mode="outpaint"]').click();
  const editor = page.locator('.image-edit-modal.open.canvas-modern-image-edit');
  await expect(editor.locator('.crop-canvas')).toHaveClass(/outpaint-mode/);
  await editor.getByRole('button', { name: '应用扩图', exact: true }).click();
  await expect.poll(() => state.getUploads()).toBe(1);
  await expect.poll(() => state.getDocument().nodes.find((node: any) => node.id === 'smart-media')?.lastImageEdit).toMatchObject({ mode: 'outpaint' });
  const node = state.getDocument().nodes.find((item: any) => item.id === 'smart-media');
  expect(node).toMatchObject({ promptDraftHtml: 'Remove white area and fill the scene', promptDraftText: 'Remove white area and fill the scene', promptDraftTouched: true });
  expect(node.outpaintSize).toMatchObject({ height: expect.any(Number), width: expect.any(Number) });
  expect(node.runSettings).toMatchObject({ engine: 'modelscope', msRatio: '', msResolution: 'custom', outpaintResolutionLocked: true, resolution: 'custom' });
  expect(node.runSettings.msCustomSize).toBe(`${node.outpaintSize.width}x${node.outpaintSize.height}`);
});

test('keeps brush and text tools on the legacy canvas and replaces the selected smart image', async ({ page }) => {
  const state = await prepare(page);
  const preview = await openPreview(page);
  await preview.locator('[data-image-edit-mode="brush"]').click();
  const editor = page.locator('.image-edit-modal.open.canvas-modern-image-edit');
  const canvas = editor.locator('canvas.edit-draw-canvas');
  await expect.poll(async () => Number(await canvas.getAttribute('width'))).toBeGreaterThan(1);
  await editor.getByRole('button', { name: '文字标签' }).click();
  await expect(editor.locator('.crop-canvas')).toHaveClass(/text-mode/);
  await editor.getByRole('button', { name: '自由画笔' }).click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('brush canvas is unavailable');
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .2); await page.mouse.down(); await page.mouse.move(box.x + box.width * .8, box.y + box.height * .6, { steps: 5 }); await page.mouse.up();
  await editor.getByRole('button', { name: '应用画笔', exact: true }).click();
  await expect.poll(() => state.getUploads()).toBe(1);
  await expect.poll(() => state.getDocument().nodes.find((node: any) => node.id === 'smart-media')?.lastImageEdit).toMatchObject({ mode: 'brush' });
  expect(state.getDocument().nodes.find((node: any) => node.id === 'smart-media')?.images?.[0]?.url).toBe('/uploads/editor-1-1.png');
});

test('keeps mask brush undo and redo on the original editor canvas', async ({ page }) => {
  const state = await prepare(page);
  const preview = await openPreview(page);
  await preview.locator('[data-image-edit-mode="mask"]').click();
  const editor = page.locator('.image-edit-modal.open.canvas-modern-image-edit');
  const canvas = editor.locator('canvas.edit-draw-canvas');
  await expect(editor.locator('.crop-canvas')).toHaveClass(/mask-mode/);
  await expect.poll(async () => Number(await canvas.getAttribute('width'))).toBeGreaterThan(1);
  await expect.poll(async () => Number(await canvas.getAttribute('height'))).toBeGreaterThan(1);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('mask canvas is unavailable');
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .25); await page.mouse.down(); await page.mouse.move(box.x + box.width * .75, box.y + box.height * .75, { steps: 4 }); await page.mouse.up();
  await expect(editor.getByRole('button', { name: '撤销遮罩' })).toBeEnabled();
  await editor.getByRole('button', { name: '撤销遮罩' }).click();
  await expect(editor.getByRole('button', { name: '恢复遮罩' })).toBeEnabled();
  await editor.getByRole('button', { name: '恢复遮罩' }).click();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5); await page.mouse.down(); await page.mouse.up();
  await editor.getByRole('button', { name: '应用遮罩', exact: true }).click();
  await expect.poll(() => state.getUploads()).toBe(1);
  await expect(editor).toHaveCount(0);
  await expect.poll(() => state.getDocument().nodes.find((node: any) => node.id === 'smart-media')?.images?.some((item: any) => item.role === 'mask')).toBe(true);
  expect(state.getDocument().nodes.filter((node: any) => node.type === 'smart-image')).toHaveLength(1);
});

test('keeps grid split and join as new smart-image nodes', async ({ page }) => {
  const state = await prepare(page);
  let preview = await openPreview(page);
  await preview.locator('[data-image-edit-mode="grid"]').click();
  let editor = page.locator('.image-edit-modal.open.canvas-modern-image-edit');
  await editor.getByRole('button', { name: '2×2', exact: true }).first().click();
  await editor.getByRole('button', { name: '应用切分', exact: true }).click();
  await expect.poll(() => state.getDocument().nodes.find((node: any) => node.title === 'Grid')?.images?.length).toBe(4);
  expect(state.getDocument().nodes.find((node: any) => node.title === 'Grid')?.type).toBe('smart-image');

  preview = await openPreview(page);
  await preview.locator('[data-image-edit-mode="grid"]').click();
  editor = page.locator('.image-edit-modal.open.canvas-modern-image-edit');
  await editor.locator('#gridJoinModeBtn').click();
  await expect(editor.locator('.crop-canvas')).toHaveClass(/grid-join-mode/);
  await expect(editor.locator('#gridJoinCanvas .grid-join-item')).toHaveCount(2);
  await editor.getByRole('button', { name: '输出拼接', exact: true }).click();
  await expect.poll(() => state.getDocument().nodes.find((node: any) => node.title === 'Grid Join')?.images?.[0]?.url).toMatch(/^\/uploads\/editor-/);
  expect(state.getDocument().nodes.find((node: any) => node.title === 'Grid Join')?.type).toBe('smart-image');
});

test('exports the current video frame to a smart-image node', async ({ page }) => {
  const state = await prepare(page, true);
  const preview = await openPreview(page);
  await expect(preview.locator('#videoFrameTools')).toBeVisible();
  await preview.locator('#previewCurrentVideo').evaluate((video: HTMLVideoElement) => {
    Object.defineProperties(video, { readyState: { configurable: true, value: 2 }, videoWidth: { configurable: true, value: 64 }, videoHeight: { configurable: true, value: 32 }, duration: { configurable: true, value: 1 } });
    CanvasRenderingContext2D.prototype.drawImage = function () {};
  });
  await preview.getByRole('button', { name: '导出当前帧' }).click();
  await expect(preview.getByTestId('video-frame-status')).toHaveText('已导出到画布');
  await expect.poll(() => state.getDocument().nodes.filter((node: any) => node.type === 'smart-image').length).toBe(2);
  expect(state.getDocument().nodes.find((node: any) => node.id !== 'smart-media')?.images?.[0]).toMatchObject({ kind: 'image', natural_h: 32, natural_w: 64 });
});
