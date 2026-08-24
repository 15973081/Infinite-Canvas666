import { expect, test, type Page } from '@playwright/test';

async function mockSmartExecution(page: Page, recover = false) {
  let document: Record<string, any> = {
    id: 'smart-execution', kind: 'smart', schemaVersion: 1, title: 'Smart execution', updated_at: 1,
    connections: [],
    nodes: recover
      ? [{ id: 'target', type: 'smart-image', x: 420, y: 120, images: [], pending: 1, pendingTasks: [{ taskId: 'recovery-task', kind: 'image' }] }]
      : [
        { id: 'target', type: 'smart-image', x: 420, y: 120, images: [], runPrompt: 'draw a cat', runSettings: { engine: 'api', apiKind: 'image', apiProvider: 'provider-a', model: 'image-a', ratio: 'wide', resolution: '2k', quality: 'hd', count: 1 } },
        { id: 'prompt', type: 'smart-prompt', x: 40, y: 440, text: 'old prompt', llmEnabled: true, llmInstruction: 'rewrite this', llmProvider: 'provider-a', llmModel: 'chat-a', llmSystemEnabled: true, llmSystemPrompt: 'system' },
      ],
  };
  const saves: Array<Record<string, any>> = [];
  const imagePayloads: Array<Record<string, unknown>> = [];
  const llmPayloads: Array<Record<string, unknown>> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [{ id: 'provider-a', name: 'Provider A', enabled: true, image_models: ['image-a'], chat_models: ['chat-a'] }] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-execution/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-execution', async route => {
    if (route.request().method() !== 'GET') {
      document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves.length + 2 };
      saves.push(structuredClone(document));
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  await page.route('**/api/canvas-image-tasks**', async route => {
    if (route.request().method() === 'POST') {
      imagePayloads.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({ json: { status: 'queued', task_id: 'image-task' } });
    } else {
      const task = route.request().url().includes('recovery-task') ? 'recovered' : 'generated';
      await route.fulfill({ json: { status: 'succeeded', result: { images: [`/${task}.png`] } } });
    }
  });
  await page.route('**/api/canvas-llm', async route => {
    llmPayloads.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ json: { text: 'rewritten prompt' } });
  });
  return { imagePayloads, llmPayloads, saves };
}

test('runs API image generation into the original smart-image data structure', async ({ page }) => {
  const state = await mockSmartExecution(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-execution');
  await expect.poll(() => page.evaluate(() => Boolean(window.CanvasBoardV2))).toBe(true);
  await page.evaluate(() => window.CanvasBoardV2?.runNode('target'));
  await expect.poll(() => state.imagePayloads).toEqual([{ prompt: 'draw a cat', provider_id: 'provider-a', model: 'image-a', size: '2048x1152', quality: 'hd', n: 1, reference_images: [] }]);
  await expect(page.locator('[data-node-id="target"][data-node-type="smart-image"] img[data-original-src="/generated.png"]')).toHaveCount(1);
  await expect.poll(() => state.saves.at(-1)?.nodes.find((node: any) => node.id === 'target')).toMatchObject({ type: 'smart-image', pending: 0, runStatus: 'done', images: [{ url: '/generated.png' }] });
  expect(state.saves.at(-1)?.nodes.some((node: any) => node.type === 'output')).toBe(false);
});

test('routes smart-prompt LLM execution through SmartCanvasExecution', async ({ page }) => {
  const state = await mockSmartExecution(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-execution');
  await page.locator('[data-node-id="prompt"] .prompt-node-run').click();
  await expect.poll(() => state.llmPayloads).toEqual([{ message: 'rewrite this', messages: [], images: [], videos: [], model: 'chat-a', provider: 'provider-a', ms_model: '', system_prompt: 'system' }]);
  await expect(page.locator('[data-node-id="prompt"] .prompt-node-text')).toHaveValue('rewritten prompt');
});

test('recovers persisted smart-image tasks when the canvas is loaded', async ({ page }) => {
  const state = await mockSmartExecution(page, true);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-execution');
  await expect(page.locator('[data-node-id="target"] img[data-original-src="/recovered.png"]')).toHaveCount(1);
  await expect.poll(() => state.saves.at(-1)?.nodes.find((node: any) => node.id === 'target')).toMatchObject({ pending: 0, images: [{ url: '/recovered.png' }] });
});
