import { expect, test } from '@playwright/test';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');

test('online image page preserves the legacy studio DOM while using the React async task contract', async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  await page.route('**/api/config', route => route.fulfill({ json: {
    image_models: ['fallback'], api_providers: [{ id: 'mock-provider', name: 'Mock Provider', protocol: 'api', has_key: true, image_models: ['mock-image'] }],
  } }));
  await page.route('**/api/history?type=online', route => route.fulfill({ json: [{ timestamp: 1, prompt: 'old', images: ['/output/old.png'], type: 'online' }] }));
  await page.route('**/api/canvas-image-tasks', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { task_id: 'online-react-task', status: 'queued' } });
  });
  await page.route('**/api/canvas-image-tasks/online-react-task', route => route.fulfill({ json: {
    id: 'online-react-task', status: 'succeeded', result: { timestamp: 2, prompt: 'react online', images: ['/output/online-react.png'] },
  } }));

  await page.goto('/static/online.html');
  await expect(page.getByRole('heading', { name: '在线生图' })).toBeVisible();
  expect(await page.evaluate(() => ({
    submitImage: typeof (window as typeof window & { submitImage?: unknown }).submitImage,
    pageScripts: [...document.scripts].filter(script => script.src.includes('/static/js/')).length,
  }))).toEqual({ submitImage: 'undefined', pageScripts: 0 });
  await expect(page.locator('.container-box')).toBeVisible();
  await expect(page.locator('.tool-panel')).toBeVisible();
  await expect(page.locator('.result-frame')).toBeVisible();
  await expect(page.locator('.upload-item')).toHaveCount(4);
  await expect(page.locator('.masonry-grid')).toBeVisible();
  await expect(page.getByLabel('平台')).toHaveValue('mock-provider');
  await expect(page.getByLabel('模型')).toHaveValue('mock-image');
  await page.getByLabel('提示词').fill('react online');
  await page.getByLabel('比例', { exact: true }).selectOption('wide');
  await page.getByLabel('数量').selectOption('2');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await expect(page.locator('img[alt="生成结果"]')).toHaveAttribute('src', '/output/online-react.png');
  await expect.poll(() => submitted).toMatchObject({ prompt: 'react online', provider_id: 'mock-provider', model: 'mock-image', size: '1280x720', n: 2 });
});

test('online image page keeps fixed reference slots and custom size controls', async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  let uploadCount = 0;
  await page.route('**/api/config', route => route.fulfill({ json: {
    image_models: ['mock-image'], api_providers: [{ id: 'mock-provider', name: 'Mock Provider', protocol: 'api', has_key: true, image_models: ['mock-image'] }],
  } }));
  await page.route('**/api/history?type=online', route => route.fulfill({ json: [] }));
  await page.route('**/api/ai/upload', route => {
    uploadCount += 1;
    return route.fulfill({ json: { files: [{ url: `/uploads/reference-${uploadCount}.png`, name: `reference-${uploadCount}.png` }] } });
  });
  await page.route('**/api/canvas-image-tasks', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { task_id: 'online-custom-size' } });
  });
  await page.route('**/api/canvas-image-tasks/online-custom-size', route => route.fulfill({ json: { status: 'succeeded', result: { timestamp: 3, prompt: 'custom', images: ['/output/custom.png'] } } }));

  await page.goto('/static/online.html');
  await page.locator('#file1').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#prev1')).toBeVisible();
  await page.locator('#drop-zone-2').dispatchEvent('dragover');
  await expect(page.locator('#drop-zone-2')).toHaveClass(/drag-over/);
  await page.locator('#drop-zone-2').dispatchEvent('dragleave');
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['pasted image'], 'pasted.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer }));
  });
  await expect(page.locator('#prev2')).toBeVisible();
  await page.getByLabel('分辨率').selectOption('custom');
  await page.getByLabel('自定义宽度').fill('640');
  await page.getByLabel('自定义高度').fill('960');
  await page.getByLabel('提示词').fill('custom');
  await page.getByRole('button', { name: '生成', exact: true }).click();

  await expect.poll(() => submitted).toMatchObject({
    size: '640x960',
    reference_images: [
      { url: '/uploads/reference-1.png', name: 'reference-1.png' },
      { url: '/uploads/reference-2.png', name: 'reference-2.png' },
    ],
  });
});

test('zimage page reuses the studio while keeping local and cloud adapters isolated', async ({ page }) => {
  let localPayload: Record<string, unknown> | null = null;
  await page.route('**/api/history?type=zimage', route => route.fulfill({ json: [] }));
  await page.route('**/api/generate', async route => {
    localPayload = route.request().postDataJSON();
    await route.fulfill({ json: { timestamp: 3, images: ['/output/zimage-react.png'], prompt: 'react local' } });
  });

  await page.goto('/static/zimage.html');
  await expect(page.getByRole('heading', { name: 'Z-Image 图像生成' })).toBeVisible();
  expect(await page.evaluate(() => typeof (window as typeof window & { handleRender?: unknown }).handleRender)).toBe('undefined');
  await page.getByLabel('提示词').fill('react local');
  await page.getByLabel('高度').fill('768');
  await page.getByRole('button', { name: '开始生成' }).click();
  await expect(page.locator('img[alt="生成结果"]')).toHaveAttribute('src', '/output/zimage-react.png');
  await expect.poll(() => localPayload).toMatchObject({ prompt: 'react local', width: 1024, height: 768, type: 'zimage' });
});
