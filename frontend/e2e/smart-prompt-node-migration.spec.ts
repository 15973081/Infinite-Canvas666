import { expect, test, type Page } from '@playwright/test';

async function mockSmartPromptNode(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-prompt-node', kind: 'smart', schemaVersion: 1, title: 'Smart prompt node', updated_at: 1,
    connections: [{ from: 'reference', to: 'prompt' }],
    nodes: [
      { id: 'reference', type: 'smart-image', x: 20, y: 320, images: [{ url: '/assets/reference.png' }, { url: '/assets/reference.mp4', kind: 'video' }] },
      { id: 'prompt', type: 'smart-prompt', x: 380, y: 30, text: 'original prompt', llmEnabled: false, llmProvider: 'provider-a', llmModel: 'chat-a', llmSystemEnabled: false, llmSystemPrompt: 'system prompt', llmInstruction: '' },
    ],
  };
  const saves: Array<Record<string, any>> = [];
  const requests: Array<Record<string, any>> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [
    { id: 'provider-a', name: 'Provider A', enabled: true, has_key: true, chat_models: ['chat-a', 'chat-b'] },
    { id: 'modelscope', name: 'ModelScope', enabled: true, has_key: true, chat_models: ['qwen-chat'] },
  ] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-prompt-node/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-prompt-node', async route => {
    if (route.request().method() !== 'GET') { document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves.length + 2 }; saves.push(structuredClone(document)); }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  await page.route('**/api/canvas-llm', async route => { requests.push(JSON.parse(route.request().postData() || '{}')); await route.fulfill({ json: { text: 'rewritten prompt' } }); });
  return { requests, saves };
}

test('renders the original smart-prompt DOM and edits text', async ({ page }) => {
  const state = await mockSmartPromptNode(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-prompt-node');
  const node = page.locator('[data-node-id="prompt"].image-node.prompt-smart-node[data-node-type="smart-prompt"]');
  await expect(node).toBeVisible();
  await expect(node.locator('.prompt-node-card .prompt-node-text')).toHaveValue('original prompt');
  await expect(node.locator('.prompt-node-tools .prompt-preset-edit')).toBeVisible();
  await expect(node.locator('.prompt-node-tools .prompt-llm-toggle')).toBeVisible();
  await node.locator('.prompt-node-text').fill('edited prompt');
  await node.locator('.prompt-node-text').press('Tab');
  await expect.poll(() => state.saves.at(-1)?.nodes.find((item: any) => item.id === 'prompt')?.text).toBe('edited prompt');
});

test('migrates LLM settings, connected media and run behavior', async ({ page }) => {
  const state = await mockSmartPromptNode(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-prompt-node');
  const node = page.locator('[data-node-id="prompt"]');
  await node.locator('.prompt-llm-toggle').click();
  await expect(node.locator('.prompt-node-llm')).toBeVisible();
  await expect(node.locator('.smart-node-input-thumb')).toHaveCount(2);
  await expect(node.locator('.prompt-node-text')).toHaveAttribute('readonly', '');
  await node.locator('.prompt-llm-provider').selectOption('modelscope');
  await expect(node.locator('.prompt-llm-model')).toHaveValue('qwen-chat');
  await node.locator('.prompt-llm-instruction').fill('rewrite this');
  await node.locator('.prompt-system-toggle').click();
  await expect(node.locator('.prompt-llm-system')).toBeVisible();
  await node.locator('.prompt-llm-system').fill('custom system');
  await node.locator('.prompt-node-run').click();
  await expect.poll(() => state.requests.at(-1)).toMatchObject({
    message: 'rewrite this', images: ['/assets/reference.png'], videos: ['/assets/reference.mp4'], model: 'qwen-chat', provider: 'modelscope', ms_model: 'qwen-chat', system_prompt: 'custom system',
  });
  await expect(node.locator('.prompt-node-text')).toHaveValue('rewritten prompt');
  await expect.poll(() => state.saves.at(-1)?.nodes.find((item: any) => item.id === 'prompt')).toMatchObject({ text: 'rewritten prompt', llmProvider: 'modelscope', llmModel: 'qwen-chat', running: false });
});
