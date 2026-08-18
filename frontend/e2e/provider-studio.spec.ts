import { expect, test } from '@playwright/test';

test('API settings runs as an isolated React ProviderStudio with real provider contracts', async ({ page }) => {
  let testPayload: Record<string, unknown> | null = null;
  let savedProviders: Array<Record<string, any>> | null = null;
  const initial = [
    { id: 'demo', name: 'Demo API', base_url: 'https://api.demo.test/v1', protocol: 'openai', image_request_mode: 'openai', proxy_url: '', enabled: true, primary: true, image_models: ['old-image'], chat_models: [], video_models: [], model_prices: [], model_protocols: {}, ms_loras: [], ms_defaults_version: 0, has_key: true, key_preview: 'sk-***demo' },
    { id: 'modelscope', name: 'ModelScope', base_url: 'https://api-inference.modelscope.cn/v1', protocol: 'openai', image_request_mode: 'openai', proxy_url: '', enabled: true, primary: false, image_models: ['ms-image'], chat_models: [], video_models: [], model_prices: [], model_protocols: {}, ms_loras: [], ms_defaults_version: 1, has_key: true, key_preview: 'ms-***key' },
  ];
  await page.route('**/api/providers', async route => {
    if (route.request().method() === 'PUT') {
      savedProviders = route.request().postDataJSON();
      await route.fulfill({ json: { providers: savedProviders } });
    } else await route.fulfill({ json: { providers: initial } });
  });
  await page.route('**/api/providers/test-connection', async route => {
    testPayload = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, status: 200, message: '连接成功', model_count: 3 } });
  });
  await page.route('**/api/providers/fetch-models', route => route.fulfill({ json: {
    total: 3, image_models: ['new-image'], chat_models: ['new-chat'], video_models: ['new-video'], all: ['new-image', 'new-chat', 'new-video'], image_request_mode: 'openai-json',
  } }));

  await page.goto('/static/api-settings.html');
  await expect(page.getByRole('heading', { name: 'API 设置' })).toBeVisible();
  expect(await page.evaluate(() => ({
    addProvider: typeof (window as typeof window & { addProvider?: unknown }).addProvider,
    legacy: [...document.scripts].some(script => /api-settings\.js/.test(script.src)),
  }))).toEqual({ addProvider: 'undefined', legacy: false });

  await page.getByLabel('API Key').fill('sk-new-secret');
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByRole('status')).toHaveText('连接成功');
  await expect.poll(() => testPayload).toMatchObject({ provider_id: 'demo', api_key: 'sk-new-secret', base_url: 'https://api.demo.test/v1' });

  await page.getByRole('button', { name: '拉取模型' }).click();
  await expect(page.getByLabel('image 模型 1')).toHaveValue('new-image');
  await page.getByLabel('new-image 单模型协议').selectOption('gemini');
  await page.getByLabel('new-image 单价').fill('0.25');

  await page.getByRole('button', { name: /ModelScope/ }).click();
  await page.getByRole('button', { name: '＋ LoRA' }).click();
  await page.getByLabel('LoRA ID 1').fill('org/enhance-lora');
  await page.getByLabel('LoRA 强度 1').fill('0.9');
  await page.getByRole('button', { name: '保存全部' }).click();
  await expect.poll(() => savedProviders).not.toBeNull();
  expect(savedProviders?.[0]).toMatchObject({ id: 'demo', image_request_mode: 'openai-json', image_models: ['new-image'], chat_models: ['new-chat'], video_models: ['new-video'], model_protocols: { 'new-image': 'gemini' }, api_key: 'sk-new-secret' });
  expect(savedProviders?.[0].model_prices).toContainEqual(expect.objectContaining({ kind: 'image', model: 'new-image', unit_price: '0.25', billing_type: 'per_image' }));
  expect(savedProviders?.[1].ms_loras).toContainEqual(expect.objectContaining({ id: 'org/enhance-lora', target_model: 'ms-image', strength: 0.9 }));
});
