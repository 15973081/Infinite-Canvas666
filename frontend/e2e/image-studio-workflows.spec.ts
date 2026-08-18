import { expect, test, type Page } from '@playwright/test';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');

async function uploadImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: png });
}

test('enhance React adapter executes the reusable two-stage upscale chain', async ({ page }) => {
  const generated: Array<Record<string, any>> = [];
  let uploads = 0;
  await page.route('**/api/history?type=enhance', route => route.fulfill({ json: [] }));
  await page.route('**/api/upload', async route => { uploads += 1; await route.fulfill({ json: { files: [{ comfy_name: uploads === 1 ? 'reference.png' : 'enhanced.png' }] } }); });
  await page.route('**/api/generate', async route => {
    generated.push(route.request().postDataJSON());
    await route.fulfill({ json: { timestamp: generated.length, images: [generated.length === 1 ? '/output/enhanced.png' : '/output/upscaled.png'] } });
  });
  await page.route('**/output/enhanced.png', route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));

  await page.goto('/static/enhance.html');
  await expect(page.getByRole('heading', { name: 'AI 图片增强' })).toBeVisible();
  expect(await page.evaluate(() => typeof (window as typeof window & { handleGenerate?: unknown }).handleGenerate)).toBe('undefined');
  await uploadImage(page);
  await page.getByLabel('提示词').fill('增强细节');
  await page.getByLabel('增强后继续放大').check();
  await page.getByLabel('放大目标').selectOption('4096');
  await page.getByRole('button', { name: '开始生成' }).click();
  await expect(page.locator('img[alt="生成结果"]')).toHaveAttribute('src', '/output/upscaled.png');
  expect(generated).toHaveLength(2);
  expect(generated[0]).toMatchObject({ workflow_json: 'Z-Image-Enhance.json', type: 'enhance', params: { '15': { image: 'reference.png' } } });
  expect(generated[1]).toMatchObject({ workflow_json: 'upscale.json', params: { '15': { image: 'enhanced.png' }, '172': { resolution: 4096 } } });
});

test('klein React adapter maps cloud references and LoRA without legacy globals', async ({ page }) => {
  let cloudPayload: Record<string, any> | null = null;
  await page.route('**/api/history?type=klein', route => route.fulfill({ json: [] }));
  await page.route('**/api/upload', route => route.fulfill({ json: { files: [{ comfy_name: 'klein.png' }] } }));
  await page.route('**/api/config/token', route => route.fulfill({ json: { token: 'mock-token' } }));
  await page.route('**/api/ms/generate', async route => { cloudPayload = route.request().postDataJSON(); await route.fulfill({ json: { url: '/output/klein-cloud.png' } }); });

  await page.goto('/static/klein.html');
  await uploadImage(page);
  await page.getByRole('button', { name: 'ModelScope 云端' }).click();
  await page.getByLabel('提示词').fill('保持人物特征');
  await page.getByLabel('启用增强 LoRA').check();
  await page.getByLabel('LoRA 强度').fill('0.9');
  await page.getByRole('button', { name: '云端生成' }).click();
  await expect(page.locator('img[alt="生成结果"]')).toHaveAttribute('src', '/output/klein-cloud.png');
  await expect.poll(() => cloudPayload).toMatchObject({ model: 'black-forest-labs/FLUX.2-klein-9B', loras: { 'Daniel8152/Klein-enhance': 0.9 } });
  expect((cloudPayload as any).image_urls[0]).toMatch(/^data:image\/png;base64,/);
});

test('angle React adapter composes camera controls into the local workflow prompt', async ({ page }) => {
  let payload: Record<string, any> | null = null;
  await page.route('**/api/history?type=angle', route => route.fulfill({ json: [] }));
  await page.route('**/api/upload', route => route.fulfill({ json: { files: [{ comfy_name: 'angle.png' }] } }));
  await page.route('**/api/generate', async route => { payload = route.request().postDataJSON(); await route.fulfill({ json: { images: ['/output/angle-react.png'], timestamp: 4 } }); });

  await page.goto('/static/angle.html');
  await uploadImage(page);
  await page.getByLabel('提示词').fill('保留主体');
  await page.getByLabel('水平旋转').fill('35');
  await page.getByLabel('垂直角度').fill('-10');
  await page.getByLabel('镜头距离').fill('2');
  await page.getByRole('button', { name: '开始生成' }).click();
  await expect(page.locator('img[alt="生成结果"]')).toHaveAttribute('src', '/output/angle-react.png');
  await expect.poll(() => payload).not.toBeNull();
  expect((payload as any).params['11'].prompt).toContain('将相机向右旋转35度，仰视10度，使用特写镜头并靠近主体');
  expect((payload as any).params['31'].image).toBe('angle.png');
});
