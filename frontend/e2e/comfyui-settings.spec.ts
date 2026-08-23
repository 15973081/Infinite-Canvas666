import { expect, test } from '@playwright/test';

test('ComfyUI settings preserves the complete legacy DOM, graph editor, test canvas, and API contracts inside React', async ({ page }) => {
  let savedInstances: unknown = null;
  let savedConfig: unknown = null;
  let runPayload: unknown = null;

  await page.route('**/api/comfyui/instances', async route => {
    if (route.request().method() === 'PUT') {
      savedInstances = route.request().postDataJSON();
      await route.fulfill({ json: { instances: ['192.168.1.10:8188'] } });
    } else await route.fulfill({ json: { instances: ['127.0.0.1:8188'] } });
  });
  await page.route('**/api/workflows', async route => route.fulfill({ json: { workflows: [{ name: 'mock.json', title: 'Mock workflow', field_count: 0 }] } }));
  await page.route('**/api/workflows/mock.json/config', async route => {
    savedConfig = route.request().postDataJSON();
    await route.fulfill({ json: { config: savedConfig } });
  });
  await page.route('**/api/workflows/mock.json/run', async route => {
    runPayload = route.request().postDataJSON();
    await route.fulfill({ json: { images: ['/output/legacy-comfy.png'] } });
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
  await expect(page.locator('.page-head .title')).toHaveText('工作流设置');
  await expect(page.locator('#status, #comfyInstancesList, #workflowList, #previewContent, #graphCard, #workflowTitleInput, #graphSvg, #nodePopup, #miniCanvasHost, #nodesToggle, #nodeList, #imageLightbox')).toHaveCount(12);
  const isolation = await page.evaluate(() => ({
    addInstance: typeof (window as typeof window & { addComfyInstance?: unknown }).addComfyInstance,
    graphFit: typeof (window as typeof window & { graphFit?: unknown }).graphFit,
    legacyScript: [...document.scripts].some(script => /\/static\/js\/comfyui-settings\.js/.test(script.src)),
  }));
  expect(isolation).toEqual({ addInstance: 'function', graphFit: 'function', legacyScript: false });

  await page.locator('#comfyInstancesList input').fill('192.168.1.10:8188');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => savedInstances).toEqual({ instances: ['192.168.1.10:8188'] });

  await expect(page.locator('#graphSvg .gnode')).toHaveCount(2);
  await expect(page.locator('#graphSvg .gedge')).toHaveCount(1);
  await page.locator('#graphSvg .gnode[data-node-id="2"]').click();
  await expect(page.locator('#nodePopup')).toBeVisible();
  const seedRow = page.locator('#nodePopup .input-row').filter({ hasText: '随机种子' });
  await seedRow.locator('.check-toggle').click();
  await expect(seedRow.locator('.random-toggle')).toBeVisible();
  await expect(page.locator('#previewContent .pfield-label')).toHaveText('随机种子');

  await page.getByRole('button', { name: '保存配置' }).click();
  await expect.poll(() => savedConfig).toMatchObject({ title: 'Mock workflow', fields: [{ node: '2', input: 'seed', name: '随机种子', type: 'number' }] });

  await page.locator('#nodesToggle').click();
  await expect(page.locator('#nodeList')).not.toHaveClass(/hidden/);
  await expect(page.locator('#nodeList .node-card')).toHaveCount(2);

  await page.locator('#workspaceCanvasTab').click();
  await expect(page.locator('#miniCanvasHost .mini-canvas')).toBeVisible();
  await expect(page.locator('#miniCanvasHost .mini-card')).toHaveCount(4);
  await expect(page.locator('#miniCanvasHost .mini-line')).toHaveCount(3);
  await page.locator('#miniCanvasHost #runBtn').click();
  await expect.poll(() => runPayload).toMatchObject({ config: { title: 'Mock workflow' }, client_id: 'workflow-test' });
  await expect(page.locator('#miniCanvasHost .mini-result img')).toHaveAttribute('src', '/output/legacy-comfy.png');

  await page.locator('#miniCanvasHost .mini-result img').click();
  await expect(page.locator('#imageLightbox')).toHaveClass(/open/);
  await page.locator('#imageLightbox').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#imageLightbox')).not.toHaveClass(/open/);
});
