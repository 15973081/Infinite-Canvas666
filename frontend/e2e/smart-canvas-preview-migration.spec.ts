import { expect, test, type Page } from '@playwright/test';

async function mockPreview(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-preview', kind: 'smart', schemaVersion: 1, title: 'Smart preview', updated_at: 1, connections: [],
    nodes: [{
      id: 'preview-node', type: 'smart-image', title: 'Preview Group', x: 220, y: 120, runPrompt: 'panorama landscape',
      runInputRefs: [{ name: 'source.png', url: '/source.png' }],
      images: [
        { grid: { row: 0, col: 0 }, name: 'first.png', natural_h: 1024, natural_w: 2048, url: '/first.png' },
        { grid: { row: 0, col: 1 }, name: 'second.png', natural_h: 1024, natural_w: 1024, url: '/second.png' },
        { kind: 'video', name: 'movie.mp4', url: '/movie.mp4' },
      ],
    }],
  };
  const downloads: Array<Record<string, unknown>> = [];
  const singleDownloads: string[] = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-preview/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-preview', async route => {
    if (route.request().method() !== 'GET') document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: Number(document.updated_at) + 1 };
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  await page.route('**/api/canvas-assets/download', async route => {
    downloads.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ body: 'zip', contentType: 'application/zip', headers: { 'Content-Disposition': 'attachment; filename="Preview-Group.zip"' } });
  });
  await page.route('**/api/download-output**', async route => {
    singleDownloads.push(route.request().url());
    await route.fulfill({ body: 'image', contentType: 'application/octet-stream', headers: { 'Content-Disposition': 'attachment; filename="preview.png"' } });
  });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mP8z8AARMAgYKSBEwAA//8DAJ0CAQn7fksAAAAASUVORK5CYII=', 'base64');
  await page.route(/\/(first|second|source)\.png(?:\?.*)?$/, route => route.fulfill({ body: png, contentType: 'image/png' }));
  return { downloads, singleDownloads };
}

async function openPreview(page: Page, index = 0) {
  const node = page.locator('[data-node-id="preview-node"]');
  const thumb = node.locator(`.thumb-item[data-image-index="${index}"]`);
  await thumb.dispatchEvent('click');
  await expect(thumb).toHaveClass(/image-selected/);
  await node.locator('.smart-node-floating-menu button[title="预览"]').dispatchEvent('click');
  return page.locator('[data-testid="canvas-board-v2"] [data-testid="smart-canvas-preview"]');
}

test('migrates the original preview DOM, navigation, compare and zoom behavior', async ({ page }) => {
  await mockPreview(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-preview');
  const preview = await openPreview(page);
  await expect(preview).toHaveClass(/image-edit-modal/);
  await expect(preview.locator('#previewStage')).toBeVisible();
  await expect(preview.locator('#previewCurrentImage')).toHaveAttribute('src', '/first.png');
  await preview.locator('#previewNextBtn').click();
  await expect(preview.locator('#previewCurrentImage')).toHaveAttribute('src', '/second.png');
  await page.keyboard.press('ArrowLeft');
  await expect(preview.locator('#previewCurrentImage')).toHaveAttribute('src', '/first.png');

  await preview.locator('#compareToggleBtn').click();
  await expect(preview.locator('#previewStage')).toHaveClass(/compare-on/);
  await expect(preview.locator('#previewCompareImage')).toHaveAttribute('src', '/source.png');
  const handle = preview.locator('#previewCompareHandle');
  const box = await handle.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2), await page.mouse.down(), await page.mouse.move(box.x + 8, box.y + box.height / 2), await page.mouse.up();

  await expect(preview.locator('#imageEditZoomLabel')).toHaveText('100%');
  await preview.locator('#imageEditStage').hover();
  await page.mouse.wheel(0, -120);
  await expect(preview.locator('#imageEditZoomLabel')).not.toHaveText('100%');
  await preview.locator('#imageEditZoomLabel').dblclick();
  await expect(preview.locator('#imageEditZoomLabel')).toHaveText('100%');
});

test('keeps single and grouped download endpoints and payloads equivalent', async ({ page }) => {
  const state = await mockPreview(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-preview');
  const preview = await openPreview(page);
  const singleDownload = page.waitForEvent('download');
  await preview.locator('#previewDownloadBtn').click();
  await expect(await singleDownload).toBeTruthy();
  const groupDownload = page.waitForEvent('download');
  await preview.locator('#previewDownloadAllBtn').click();
  await expect(await groupDownload).toBeTruthy();
  await expect.poll(() => state.downloads).toHaveLength(1);
  expect(state.downloads[0]).toMatchObject({ filename: 'Preview Group.zip', urls: ['/first.png', '/second.png', '/movie.mp4'] });
});

test('switches between video and panorama preview without changing node media', async ({ page }) => {
  await mockPreview(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-preview');
  let preview = await openPreview(page, 2);
  await expect(preview.locator('.image-edit-panel')).toHaveClass(/video-preview-mode/);
  await expect(preview.locator('#previewCurrentVideo')).toHaveAttribute('src', '/movie.mp4');
  await expect(preview.locator('#compareToggleBtn')).toHaveCount(0);
  await preview.locator('[aria-label="关闭预览"]').click();

  preview = await openPreview(page);
  await preview.locator('#panoramaToggleBtn').click();
  await expect(preview.locator('#previewStage')).toHaveClass(/panorama-on/);
  await expect(preview.locator('#panoramaStage')).toBeVisible();
  await expect(preview.locator('#panoramaControls')).toBeVisible();
  await preview.locator('[data-panorama-ratio="square"]').click();
  await expect(preview.locator('[data-panorama-ratio="square"]')).toHaveClass(/active/);
});
