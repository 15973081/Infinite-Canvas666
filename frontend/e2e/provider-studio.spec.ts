import { expect, test } from '@playwright/test';

const provider = (overrides: Record<string, unknown> = {}) => ({
  id: 'demo', name: 'Demo API', base_url: 'https://api.demo.test/v1', protocol: 'openai', image_request_mode: 'openai', proxy_url: '',
  enabled: true, primary: false, image_models: ['old-image'], chat_models: [], video_models: [], model_prices: [], model_protocols: {},
  ms_loras: [], ms_defaults_version: 0, rh_apps: [], rh_workflows: [], has_key: true, key_preview: 'sk-***demo', key_env: 'DEMO_API_KEY',
  ...overrides,
});

test('API settings preserves the complete legacy DOM and provider contracts inside React', async ({ page }) => {
  let testPayload: Record<string, unknown> | null = null;
  let savedProviders: Array<Record<string, any>> | null = null;
  const initial = [
    provider(),
    provider({ id: 'modelscope', name: 'ModelScope', base_url: 'https://api-inference.modelscope.cn/v1', image_models: ['ms-image'], ms_defaults_version: 1 }),
  ];
  await page.route('**/api/providers', async route => {
    if (route.request().method() === 'PUT') {
      savedProviders = route.request().postDataJSON();
      await route.fulfill({ json: { providers: savedProviders } });
    } else await route.fulfill({ json: { providers: initial } });
  });
  await page.route('**/api/providers/test-connection', async route => {
    testPayload = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, status: 200, message: '连接成功', model_count: 3, all: ['new-image', 'new-chat', 'new-video'], image_models: ['new-image'], chat_models: ['new-chat'], video_models: ['new-video'] } });
  });
  await page.route('**/api/providers/fetch-models', route => route.fulfill({ json: {
    total: 3, image_models: ['new-image'], chat_models: ['new-chat'], video_models: ['new-video'], all: ['new-image', 'new-chat', 'new-video'], image_request_mode: 'openai-json',
  } }));

  await page.goto('/static/api-settings.html');
  await expect(page.locator('.page-head .title')).toHaveText('API 设置');
  await expect(page.locator('#providerList .provider-card')).toHaveCount(2);
  await expect(page.locator('#settingsContent')).toBeVisible();
  await expect(page.locator('#recommendContent')).toBeHidden();
  await expect(page.locator('#modelPickerOverlay')).toBeHidden();
  await expect(page.locator('#rhWorkflowEditorOverlay')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => ({
    legacyScript: [...document.scripts].some(script => /\/static\/js\/api-settings\.js/.test(script.src)),
    modernBundle: [...document.scripts].some(script => /api-settings-modern\.js/.test(script.src)),
    siteModernCss: [...document.styleSheets].some(sheet => /site-modern|studio-art-direction/.test(sheet.href || '')),
    addProvider: typeof (window as typeof window & { addProvider?: unknown }).addProvider,
    saveProviders: typeof (window as typeof window & { saveProviders?: unknown }).saveProviders,
    legacyIds: ['providerList', 'settingsContent', 'providerOnboardingCard', 'runninghubConfigBlock', 'modelsHead', 'imageModelList', 'chatModelList', 'videoModelList', 'msLoraBlock', 'recommendContent', 'recommendPanel', 'modelPickerOverlay', 'rhWorkflowEditorOverlay'].every(id => Boolean(document.getElementById(id))),
  }))).toEqual({ legacyScript: false, modernBundle: true, siteModernCss: false, addProvider: 'function', saveProviders: 'function', legacyIds: true });

  await page.locator('#providerList .provider-card-sortable').click();
  await page.locator('#keyInput').fill('sk-new-secret');
  await page.locator('#testUrlBtn').click();
  await expect(page.locator('#verifyResult')).toContainText('地址验证通过');
  await expect.poll(() => testPayload).toMatchObject({ provider_id: 'demo', api_key: 'sk-new-secret', base_url: 'https://api.demo.test/v1' });

  await page.locator('#fetchModelsBtn').click();
  await expect(page.locator('#modelPickerOverlay')).toBeVisible();
  await expect(page.locator('#pickerCount')).toContainText('4 个模型');
  await page.locator('#pickerList .picker-row', { hasText: 'new-image' }).click();
  await page.locator('#pickerList .picker-row', { hasText: 'new-chat' }).click();
  await page.locator('#pickerList .picker-row', { hasText: 'new-video' }).click();
  await page.locator('#modelPickerOverlay .save-btn').click();
  await expect(page.locator('#imageModelList input[value="new-image"]')).toHaveCount(1);
  await expect(page.locator('#chatModelList input[value="new-chat"]')).toHaveCount(1);
  await expect(page.locator('#videoModelList input[value="new-video"]')).toHaveCount(1);

  await page.locator('#imageModelList .model-protocol-select').last().selectOption('gemini');
  await page.locator('#imageModelList .model-price-input').last().fill('0.25');
  await page.locator('.api-page-save-btn').click();
  await expect.poll(() => savedProviders).not.toBeNull();
  expect(savedProviders?.find(item => item.id === 'demo')).toMatchObject({ api_key: 'sk-new-secret', image_request_mode: 'openai-json' });
});

test('API settings restores the legacy recommendation save flow', async ({ page }) => {
  let savedProviders: Array<Record<string, any>> | null = null;
  await page.route('**/api/providers', async route => {
    if (route.request().method() === 'PUT') {
      savedProviders = route.request().postDataJSON();
      await route.fulfill({ json: { providers: savedProviders } });
    } else await route.fulfill({ json: { providers: [provider()] } });
  });
  await page.goto('/static/api-settings.html');
  await page.locator('.api-link-btn').click();
  await expect(page.locator('#settingsContent')).toBeHidden();
  await expect(page.locator('#recommendContent')).toBeVisible();
  await expect(page.locator('#recommendPanel .recommend-platform-card')).toHaveCount(4);
  await page.locator('[data-recommend-key="0"]').fill('apimart-secret');
  await page.locator('#recommendPanel .recommend-guide-save-btn').first().click();
  await expect.poll(() => savedProviders).not.toBeNull();
  expect(savedProviders?.find(item => item.id === 'apimart')).toMatchObject({ name: 'APIMART', base_url: 'https://api.apimart.ai', protocol: 'apimart', api_key: 'apimart-secret' });
  await expect(page.locator('#settingsContent')).toBeVisible();
  await expect(page.locator('#editorTitle')).toHaveText('APIMART');
});

test('API settings restores RunningHub cards and the legacy editor overlay', async ({ page }) => {
  let savedProviders: Array<Record<string, any>> | null = null;
  const runningHub = provider({
    id: 'runninghub', name: 'RunningHub', base_url: 'https://www.runninghub.cn', protocol: 'runninghub', has_wallet_key: true, wallet_key_preview: 'rh-***wallet',
    rh_apps: [{ id: 'app-1', appId: 'app-1', title: '测试应用', note: '应用说明', enabled: true, fields: [{ key: 'prompt', name: '提示词', type: 'text', required: true, enabled: true }] }],
    rh_workflows: [{ id: 'workflow-1', workflowId: 'workflow-1', title: '测试工作流', note: '工作流说明', enabled: true, fields: [], workflowJson: {} }],
  });
  await page.route('**/api/providers', async route => {
    if (route.request().method() === 'PUT') {
      savedProviders = route.request().postDataJSON();
      await route.fulfill({ json: { providers: savedProviders } });
    } else await route.fulfill({ json: { providers: [runningHub] } });
  });

  await page.goto('/static/api-settings.html');
  await expect(page.locator('body')).toHaveClass(/show-runninghub/);
  await expect(page.locator('#runninghubConfigBlock')).toBeVisible();
  await expect(page.locator('#rhAppsCount')).toHaveText('1');
  await expect(page.locator('#rhWorkflowsCount')).toHaveText('1');
  await expect(page.locator('.rh-key-stack')).toBeVisible();
  await page.locator('#rhPasteInput').fill('/run/ai-app/20580001');
  await page.locator('#runninghubConfigBlock .rh-paste-row .action-btn').click();
  await expect(page.locator('#rhAppsCount')).toHaveText('2');

  await page.locator('#rhAppsList .rh-card-action').first().click();
  await expect(page.locator('#rhWorkflowEditorOverlay')).toHaveClass(/open/);
  await expect(page.locator('#rhWorkflowEditorTitle')).toContainText('AI 应用');
  await page.keyboard.press('Escape');
  await expect(page.locator('#rhWorkflowEditorOverlay')).not.toHaveClass(/open/);

  await page.locator('.api-page-save-btn').click();
  await expect.poll(() => savedProviders).not.toBeNull();
  expect(savedProviders?.[0]).toMatchObject({ id: 'runninghub', protocol: 'runninghub' });
  expect(savedProviders?.[0].rh_apps).toHaveLength(2);
  expect(savedProviders?.[0].rh_workflows).toHaveLength(1);
});
