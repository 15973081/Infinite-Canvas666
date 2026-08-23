import { expect, test } from '@playwright/test';

test('online image page preserves the legacy studio DOM while using the React async task contract', async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  await page.route('**/api/config', route => route.fulfill({ json: {
    image_models: ['fallback'], api_providers: [{ id: 'mock-provider', name: 'Mock Provider', protocol: 'api', image_models: ['mock-image'] }],
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
  await page.getByLabel('比例').selectOption('wide');
  await page.getByLabel('数量').selectOption('2');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await expect(page.locator('img[alt="生成结果"]')).toHaveAttribute('src', '/output/online-react.png');
  await expect.poll(() => submitted).toMatchObject({ prompt: 'react online', provider_id: 'mock-provider', model: 'mock-image', size: '1280x720', n: 2 });
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
