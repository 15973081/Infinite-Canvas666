import { expect, test } from '@playwright/test';

test('runs the standalone React ComfyUI settings workflow without legacy globals', async ({ page }) => {
  let savedInstances: unknown = null;
  let savedConfig: unknown = null;
  let runPayload: unknown = null;

  await page.route('**/api/comfyui/instances', async route => {
    if (route.request().method() === 'PUT') {
      savedInstances = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: { instances: ['127.0.0.1:8188'] } });
  });
  await page.route('**/api/workflows', async route => route.fulfill({ json: { workflows: [{ name: 'mock.json', title: 'Mock workflow', field_count: 0 }] } }));
  await page.route('**/api/workflows/mock.json/config', async route => {
    savedConfig = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/workflows/mock.json/run', async route => {
    runPayload = route.request().postDataJSON();
    await route.fulfill({ json: { result: { images: ['/output/react-comfy.png'] } } });
  });
  await page.route('**/api/workflows/mock.json', async route => route.fulfill({ json: {
    name: 'mock.json', builtin: false,
    workflow: {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
      '2': { class_type: 'KSampler', inputs: { model: ['1', 0], seed: 42, cfg: 7.5 } },
    },
    config: { title: 'Mock workflow', fields: [], mini_cards: {} },
  } }));

  await page.goto('/static/comfyui-settings.html');
  await expect(page.getByRole('heading', { name: 'ComfyUI 工作流设置' })).toBeVisible();
  const isolation = await page.evaluate(() => ({
    addInstance: typeof (window as typeof window & { addComfyInstance?: unknown }).addComfyInstance,
    legacyScript: [...document.scripts].some(script => /\/static\/js\/comfyui-settings\.js/.test(script.src)),
  }));
  expect(isolation).toEqual({ addInstance: 'undefined', legacyScript: false });

  await page.getByLabel('后端地址 1').fill('192.168.1.10:8188');
  await page.getByRole('button', { name: '保存后端' }).click();
  await expect.poll(() => savedInstances).toEqual({ instances: ['192.168.1.10:8188'] });

  await page.getByRole('button', { name: /Mock workflow/ }).click();
  await expect(page.getByTestId('workflow-graph')).toBeVisible();
  await page.getByRole('button', { name: /KSampler/ }).click();
  await page.getByText('seed', { exact: true }).click();
  await expect(page.getByText('运行时允许随机')).toBeVisible();
  await page.getByRole('button', { name: '保存配置' }).click();
  await expect.poll(() => savedConfig).not.toBeNull();

  await page.getByRole('button', { name: '测试画布' }).click();
  await page.getByRole('button', { name: '运行测试' }).click();
  await expect.poll(() => runPayload).not.toBeNull();
  await expect(page.locator('img[alt="工作流输出"]')).toHaveAttribute('src', '/output/react-comfy.png');
});
