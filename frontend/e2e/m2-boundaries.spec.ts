import { expect, test } from '@playwright/test';

test('keeps stage 4 and 5 boundaries disabled by default', async ({ page }) => {
  await page.goto('/static/canvas.html');

  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-core', '27');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-board-v2', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-m2', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-execution-engine', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-task-client', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-repository', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-activity', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-execution', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-islands', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-status', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-toolbar', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-v2-rollout-policy', 'loaded');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-v2-rollout-blocked', 'rollout-disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-legacy-bridge', 'ready');
  await expect(page.locator('#canvasExecutionIsland')).toBeHidden();
  await expect(page.locator('#canvasStatusIsland')).toBeHidden();
  await expect(page.locator('#canvasToolbarIsland')).toBeHidden();
  await expect(page.locator('#canvasActivityIsland')).toBeHidden();
  await page.evaluate(() => (window as typeof window & { openCanvasLog(): void }).openCanvasLog());
  await expect(page.locator('#logModal > .log-panel')).toBeVisible();
  await expect(page.locator('#canvasActivityIsland')).toBeHidden();
});

test('keeps the server kill switch above every local rollout override', async ({ page }) => {
  await page.route('**/api/canvas-rollout', async (route) => route.fulfill({ json: {
    version: 1,
    configured_percentage: 100,
    effective_percentage: 0,
    enabled: true,
    kill_switch: true,
    blocked_reasons: ['kill-switch'],
  } }));

  await page.goto('/static/canvas.html?canvas_v2=1&canvas_v2_rollout=100');

  await expect(page.locator('html')).toHaveAttribute('data-canvas-v2-rollout', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-v2-rollout-blocked', 'kill-switch');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-board-v2', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-m2', 'disabled');
  const rollout = await page.evaluate(() => (
    window as typeof window & { CanvasModernCore: any }
  ).CanvasModernCore.getM2Report().rollout);
  expect(rollout).toMatchObject({ enabled: false, forced: false, killSwitch: true, source: 'server' });
});

test('activates the cohesive V2 stack through deterministic rollout controls', async ({ page }) => {
  await page.goto('/static/canvas.html?canvas_v2_rollout=100');

  await expect(page.locator('html')).toHaveAttribute('data-canvas-v2-rollout', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-v2-rollout-percentage', '100');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-board-v2', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-m2', 'enabled');
  const report = await page.evaluate(() => (window as typeof window & { CanvasModernCore: any }).CanvasModernCore.getM2Report());
  expect(report.rollout).toMatchObject({ enabled: true, forced: false, percentage: 100, source: 'query' });

  await page.goto('/static/canvas.html?canvas_v2=0&canvas_v2_rollout=100');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-v2-rollout', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-board-v2', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-m2', 'disabled');
});

test('rebases disjoint CanvasBoard V2 edits after a repository conflict', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/canvases/v2-conflict', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    saves.push(body);
    if (saves.length === 1) {
      await route.fulfill({ status: 409, json: { detail: {
        message: 'conflict', updated_at: 2,
        canvas: {
          id: 'v2-conflict', updated_at: 2, connections: [],
          nodes: [
            { id: 'prompt', type: 'prompt', text: 'base', x: 40, y: 120 },
            { id: 'generator', type: 'generator', model: 'remote-model', x: 420, y: 120 },
          ],
        },
      } } });
      return;
    }
    await route.fulfill({ json: { canvas: { ...body, id: 'v2-conflict', updated_at: 3 } } });
  });
  await page.goto('/static/canvas.html?canvas_board_v2=1&canvas_repository=1');
  await expect(page.getByTestId('canvas-board-v2')).toHaveCount(1);
  await page.evaluate(() => {
    document.getElementById('shell')?.classList.remove('no-canvas');
    window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
      id: 'v2-conflict', updated_at: 1, connections: [],
      nodes: [
        { id: 'prompt', type: 'prompt', text: 'base', x: 40, y: 120 },
        { id: 'generator', type: 'generator', model: 'base-model', x: 420, y: 120 },
      ],
    } }));
  });

  const editor = page.locator('[data-node-id="prompt"] textarea[data-field="text"]');
  await editor.fill('local edit');
  await editor.blur();

  await expect.poll(() => saves.length).toBe(2);
  expect(saves[1]).toMatchObject({ base_updated_at: 2 });
  expect(saves[1].nodes.find((node: any) => node.id === 'prompt')).toMatchObject({ text: 'local edit' });
  expect(saves[1].nodes.find((node: any) => node.id === 'generator')).toMatchObject({ model: 'remote-model' });
  await expect(page.locator('#canvasBoardV2')).toHaveAttribute('data-save-state', 'saved');
});

test('keeps interrupted persisted tasks actionable after a backend restart', async ({ page }) => {
  await page.route('**/api/canvases/recovery-e2e', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ json: { canvas: { ...body, id: 'recovery-e2e', updated_at: 2 } } });
  });
  await page.goto('/static/canvas.html?canvas_board_v2=1&canvas_repository=1');
  await expect(page.getByTestId('canvas-board-v2')).toHaveCount(1);
  await page.evaluate(() => {
    document.getElementById('shell')?.classList.remove('no-canvas');
    window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
      id: 'recovery-e2e', updated_at: 1, connections: [],
      nodes: [
        { id: 'generator', type: 'generator', x: 40, y: 120 },
        { id: 'output', type: 'output', x: 420, y: 120, _pending: [{
          id: 'pending-restart', canvasTaskId: 'canvas_img_old', failed: true,
          recoveryStatus: 'interrupted', run: { node: { id: 'generator', type: 'generator' } },
        }] },
      ],
    } }));
    const board = (window as typeof window & { CanvasBoardV2: any; __retriedNode?: string }).CanvasBoardV2;
    board.runNode = async (nodeId: string) => {
      (window as typeof window & { __retriedNode?: string }).__retriedNode = nodeId;
    };
  });

  const pending = page.locator('[data-pending-id="pending-restart"]');
  await expect(pending).toContainText('任务追踪已中断');
  await pending.getByRole('button', { name: '重新生成' }).click();
  await expect(pending).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __retriedNode?: string }).__retriedNode)).toBe('generator');
});

test('mounts CanvasBoard V2 exclusively behind its flag and restores Legacy on cleanup', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  let updatedAt = 1;
  await page.route('**/api/canvases/v2-e2e', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    saves.push(body);
    updatedAt += 1;
    await route.fulfill({ json: { canvas: { ...body, id: 'v2-e2e', updated_at: updatedAt } } });
  });
  await page.goto('/static/canvas.html?canvas_board_v2=1');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-board-v2', 'enabled');
  await expect(page.locator('#board')).toBeHidden();
  await expect(page.getByTestId('canvas-board-v2')).toHaveCount(1);
  await expect(page.locator('#gateStatus')).not.toContainText('正在加载画布列表');

  await page.evaluate(() => {
    document.getElementById('shell')?.classList.remove('no-canvas');
    window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
      id: 'v2-e2e',
      custom: 'preserved',
      nodes: [
        { id: 'prompt-1', type: 'prompt', title: 'Prompt', x: 80, y: 180 },
        { id: 'generator-1', type: 'generator', title: 'Generator', x: 420, y: 330 },
        { id: 'output-1', type: 'output', title: 'Output', x: 900, y: 330 },
      ],
      connections: [{ from: 'prompt-1', to: 'generator-1' }],
      updated_at: 1,
    } }));
  });

  const board = page.getByTestId('canvas-board-v2');
  const node = page.locator('[data-node-id="prompt-1"]');
  await expect(node).toBeVisible();
  await node.locator('.node-head').click();
  await expect(node).toHaveClass(/selected/);
  const originalPosition = await node.evaluate((element) => ({ left: (element as HTMLElement).style.left, top: (element as HTMLElement).style.top }));
  const box = await node.boundingBox();
  if (!box) throw new Error('V2 node is not visible');
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60);
  await page.mouse.up();
  await expect.poll(() => node.evaluate((element) => ({ left: (element as HTMLElement).style.left, top: (element as HTMLElement).style.top }))).not.toEqual(originalPosition);
  await expect.poll(() => saves.length).toBe(1);
  await expect(page.getByTestId('canvas-board-v2-save-status')).toHaveText('已保存');
  expect(saves[0]).toMatchObject({ base_updated_at: 1, custom: 'preserved' });
  expect(saves[0].nodes.find((item: any) => item.id === 'prompt-1')).toMatchObject({ x: 140, y: 220 });

  await page.getByRole('button', { name: '从 generator-1 连线' }).click();
  await page.getByRole('button', { name: '连接到 output-1' }).click();
  await expect(page.locator('[data-edge-index]')).toHaveCount(2);
  await expect.poll(() => saves.length).toBe(2);
  await page.locator('[data-edge-index="1"]').click({ force: true });
  await expect(page.locator('[data-edge-index="1"]')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-edge-index]')).toHaveCount(1);
  await expect.poll(() => saves.length).toBe(3);

  await page.getByRole('button', { name: '从 generator-1 连线' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '连接到 output-1' }).click();
  await expect(page.locator('[data-edge-index]')).toHaveCount(1);

  await page.locator('[data-node-id="output-1"]').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-node-id="output-1"]')).toHaveCount(0);
  await expect.poll(() => saves.length).toBe(4);

  const originalViewport = await board.getAttribute('data-viewport');
  await board.hover();
  await page.mouse.wheel(0, -100);
  await expect.poll(() => board.getAttribute('data-viewport')).not.toBe(originalViewport);
  const zoomedViewport = await board.getAttribute('data-viewport');
  const boardBox = await board.boundingBox();
  if (!boardBox) throw new Error('V2 board is not visible');
  await page.mouse.move(boardBox.x + boardBox.width - 80, boardBox.y + boardBox.height - 80);
  await page.mouse.down();
  await page.mouse.move(boardBox.x + boardBox.width - 40, boardBox.y + boardBox.height - 40);
  await page.mouse.up();
  await expect.poll(() => board.getAttribute('data-viewport')).not.toBe(zoomedViewport);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
    id: 'v2-e2e',
    nodes: [],
    connections: [],
  } })));
  await expect(node).toHaveCount(1);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
    id: 'v2-e2e-next',
    nodes: [{ id: 'prompt-1', type: 'prompt', x: 10, y: 200 }],
    connections: [],
  } })));
  await expect(node).toHaveCSS('left', '10px');

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.getByTestId('canvas-board-v2')).toHaveCount(0);
  await expect(page.locator('#canvasBoardV2')).toBeHidden();
  await expect(page.locator('#board')).not.toHaveAttribute('hidden', '');
});

test('edits and groups low-risk V2 nodes through the persisted document', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/canvases/v2-low-risk', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    saves.push(body);
    await route.fulfill({ json: { canvas: { ...body, id: 'v2-low-risk', updated_at: saves.length + 1 } } });
  });
  await page.goto('/static/canvas.html?canvas_board_v2=1');
  await expect(page.locator('#gateStatus')).not.toContainText('正在加载画布列表');
  await page.evaluate(() => {
    document.getElementById('shell')?.classList.remove('no-canvas');
    window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
      id: 'v2-low-risk', future: 'preserved', updated_at: 1,
      nodes: [
        { id: 'prompt-a', type: 'prompt', x: 80, y: 160, text: '', future: 'node-preserved' },
        { id: 'prompt-b', type: 'prompt', x: 80, y: 430, text: 'second' },
        { id: 'loop-a', type: 'loop', x: 480, y: 160, count: 3, mode: 'serial', showPrompt: false, imageInput: false },
      ],
      connections: [],
    } }));
  });

  const prompt = page.locator('[data-node-id="prompt-a"]');
  await prompt.locator('textarea').fill('cinematic prompt');
  await prompt.locator('textarea').blur();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'prompt-a')?.text).toBe('cinematic prompt');
  expect(saves.at(-1)).toMatchObject({ future: 'preserved' });
  expect(saves.at(-1)?.nodes.find((node: any) => node.id === 'prompt-a')).toMatchObject({ future: 'node-preserved' });
  await prompt.getByRole('button', { name: '模板' }).click();
  await expect(page.locator('#promptTemplateModal')).toHaveClass(/open/);
  await page.evaluate(() => (window as typeof window & { closePromptTemplateModal(): void }).closePromptTemplateModal());

  const loop = page.locator('[data-node-id="loop-a"]');
  await loop.getByLabel('循环次数').fill('5');
  await loop.getByLabel('循环次数').blur();
  await loop.getByRole('button', { name: '并行' }).click();
  await loop.getByRole('button', { name: '提示词输入' }).click();
  await loop.getByLabel('循环变量提示词').fill('shot');
  await loop.getByRole('button', { name: '计数' }).click();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'loop-a')).toMatchObject({
    count: 5, mode: 'parallel', showPrompt: true, variablePrompt: 'shot《计数》',
  });
  await expect(loop.getByRole('button', { name: '连接到 loop-a' })).toHaveCount(1);

  await page.locator('[data-node-id="prompt-a"] .node-head').click();
  await page.locator('[data-node-id="prompt-b"] .node-head').click({ modifiers: ['Control'] });
  await page.evaluate(() => (window as typeof window & { groupSelectedImages(): void }).groupSelectedImages());
  const group = page.locator('[data-node-type="promptGroup"]');
  await expect(group).toHaveCount(1);
  await expect(group.locator('[data-prompt-count="2"]')).toHaveCount(1);
  await group.focus();
  await page.keyboard.press('Control+C');
  await page.keyboard.press('Control+V');
  await expect(page.locator('[data-node-type="promptGroup"]')).toHaveCount(2);
  await expect(page.locator('[data-node-type="prompt"]')).toHaveCount(4);
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-node-type="promptGroup"]')).toHaveCount(1);
  await expect(page.locator('[data-node-type="prompt"]')).toHaveCount(2);
});

test('edits Generator, ModelScope and Output nodes in V2', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/canvases/v2-generation', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    saves.push(body);
    await route.fulfill({ json: { canvas: { ...body, id: 'v2-generation', updated_at: saves.length + 1 } } });
  });
  await page.goto('/static/canvas.html?canvas_board_v2=1');
  await expect(page.locator('#gateStatus')).not.toContainText('正在加载画布列表');
  await page.evaluate(() => {
    document.getElementById('shell')?.classList.remove('no-canvas');
    window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
      id: 'v2-generation', updated_at: 1, extension: 'kept',
      nodes: [
        { id: 'prompt-gen', type: 'prompt', x: 20, y: 20, text: 'city' },
        { id: 'generator-v2', type: 'generator', x: 380, y: 20, apiProvider: 'comfly', model: '', ratio: 'square', resolution: '1k', quality: 'auto', count: 1 },
        { id: 'msgen-v2', type: 'msgen', x: 380, y: 410, msgenModel: 'zimage', msRatio: 'square', msResolution: '1k', count: 1 },
        { id: 'output-v2', type: 'output', x: 820, y: 20, images: [{ url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', future: true, run: { nodeType: 'generator', node: { type: 'generator', quality: 'medium' }, prompt: 'rerun prompt', refs: [] } }], imageComparisons: { 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==': { url: '/static/images/logo.png' } }, _pending: [{ id: 'pending-v2', taskId: 'task-v2', status: '正在恢复' }] },
      ],
      connections: [{ from: 'prompt-gen', to: 'generator-v2' }, { from: 'generator-v2', to: 'output-v2' }],
    } }));
  });

  const generator = page.locator('[data-node-id="generator-v2"]');
  await generator.getByLabel('质量').selectOption('high');
  await generator.getByLabel('生成数量').fill('4');
  await generator.getByLabel('生成数量').blur();
  await generator.getByLabel('比例').selectOption('custom');
  await generator.getByLabel('比例宽').fill('4');
  await generator.getByLabel('比例高').fill('5');
  await generator.getByLabel('比例高').blur();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'generator-v2')).toMatchObject({ quality: 'high', count: 4, ratio: 'custom', customRatio: '4:5' });
  expect(saves.at(-1)).toMatchObject({ extension: 'kept' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('canvas-legacy-execution-document', { detail: {
    id: 'v2-generation', updated_at: 9, connections: [],
    nodes: [{ id: 'generator-v2', type: 'generator', quality: 'stale', runStatus: 'failed', runError: 'recoverable failure', _cascadeFailed: true }],
  } })));
  await expect(generator.getByLabel('质量')).toHaveValue('high');
  await expect(generator.getByRole('button', { name: '重试' })).toBeVisible();

  const msgen = page.locator('[data-node-id="msgen-v2"]');
  await msgen.getByRole('button', { name: 'Qwen Edit' }).click();
  await msgen.getByLabel('ModelScope 生成数量').fill('3');
  await msgen.getByLabel('ModelScope 生成数量').blur();
  await msgen.getByLabel('ModelScope 分辨率').selectOption('custom');
  await msgen.getByLabel('ModelScope 自定义宽度').fill('768');
  await msgen.getByLabel('ModelScope 自定义高度').fill('1024');
  await msgen.getByLabel('ModelScope 自定义高度').blur();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'msgen-v2')).toMatchObject({ msgenModel: 'qwen_edit', count: 3, msResolution: 'custom', msCustomSize: '768x1024' });

  const output = page.locator('[data-node-id="output-v2"]');
  await expect(output.locator('img')).toHaveCount(1);
  await expect(output.locator('[data-pending-id="pending-v2"]')).toContainText('正在恢复');
  await output.locator('img').click();
  await expect(page.locator('#outputLightbox')).toHaveClass(/open/);
  await page.locator('#outputRerunBtn').click();
  await expect(page.locator('[data-node-type="generator"]')).toHaveCount(2);
  await page.getByTestId('canvas-board-v2').evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-canvas-output-image', JSON.stringify({ kind: 'image', name: 'dragged.png', url: '/output/dragged.png' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, clientX: 120, clientY: 120, dataTransfer: transfer }));
  });
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(1);
  await output.getByRole('button', { name: '删除输出' }).click();
  await expect(output.locator('img')).toHaveCount(0);
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'output-v2')?.images).toEqual([]);

  await page.evaluate(() => {
    const target = window as typeof window & { addGeneratorNode(): void; addMsGenNode(): void; addOutputNode(): void };
    target.addGeneratorNode(); target.addMsGenNode(); target.addOutputNode();
  });
  await expect(page.locator('[data-node-type="generator"]')).toHaveCount(3);
  await expect(page.locator('[data-node-type="msgen"]')).toHaveCount(2);
  await expect(page.locator('[data-node-type="output"]')).toHaveCount(2);
});

test('edits Video, Comfy and LLM nodes in V2', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/canvases/v2-media', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    saves.push(body);
    await route.fulfill({ json: { canvas: { ...body, id: 'v2-media', updated_at: saves.length + 1 } } });
  });
  await page.goto('/static/canvas.html?canvas_board_v2=1');
  await expect(page.locator('#gateStatus')).not.toContainText('正在加载画布列表');
  await page.evaluate(() => {
    document.getElementById('shell')?.classList.remove('no-canvas');
    window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
      id: 'v2-media', updated_at: 1, extension: 'kept', connections: [],
      nodes: [
        { id: 'video-v2', type: 'video', x: 0, y: 120, apiProvider: 'comfly', model: '', duration: 5, aspectRatio: '16:9', resolution: '', taskMode: 'auto' },
        { id: 'comfy-v2', type: 'comfy', x: 420, y: 120, w: 420, h: 460, mode: 'text', width: 1024, height: 1024, comfyParams: {} },
        { id: 'llm-v2', type: 'llm', x: 850, y: 120, mode: 'node', llmProvider: 'comfly', model: '', systemPrompt: 'old', userInput: '', outputText: 'ready', messages: [{ role: 'assistant', content: 'hello' }] },
      ],
    } }));
  });

  const video = page.locator('[data-node-id="video-v2"]');
  await video.getByLabel('视频时长').fill('8');
  await video.getByLabel('视频时长').blur();
  await video.getByLabel('视频比例').selectOption('9:16');
  await video.getByRole('button', { name: '生成音频' }).click();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'video-v2')).toMatchObject({ duration: 8, aspectRatio: '9:16', generateAudio: true });

  const comfy = page.locator('[data-node-id="comfy-v2"]');
  await comfy.getByLabel('Comfy 宽度').fill('1536');
  await comfy.getByLabel('Comfy 宽度').blur();
  await comfy.getByRole('button', { name: '增强' }).click();
  await comfy.getByRole('button', { name: '超分辨率' }).click();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'comfy-v2')).toMatchObject({ mode: 'enhance', width: 1536, enhanceUpscale: true });

  const llm = page.locator('[data-node-id="llm-v2"]');
  await llm.getByRole('button', { name: 'System' }).click();
  await llm.getByLabel('系统提示词').fill('new system');
  await llm.getByLabel('系统提示词').blur();
  await llm.getByRole('button', { name: '聊天' }).click();
  await expect(llm).toContainText('hello');
  await llm.getByLabel('聊天输入').fill('next message');
  await llm.getByLabel('聊天输入').blur();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'llm-v2')).toMatchObject({ mode: 'chat', showSystem: true, systemPrompt: 'new system', chatInput: 'next message' });
  expect(saves.at(-1)).toMatchObject({ extension: 'kept' });

  await page.evaluate(() => {
    const target = window as typeof window & { addVideoNode(): void; addComfyNode(): void; addLLMNode(): void };
    target.addVideoNode(); target.addComfyNode(); target.addLLMNode();
  });
  await expect(page.locator('[data-node-type="video"]')).toHaveCount(2);
  await expect(page.locator('[data-node-type="comfy"]')).toHaveCount(2);
  await expect(page.locator('[data-node-type="llm"]')).toHaveCount(2);
});

test('persists production parity controls for Video and custom Comfy workflows', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/canvases/v2-parity', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    saves.push(body);
    await route.fulfill({ json: { canvas: { ...body, id: 'v2-parity', updated_at: saves.length + 1 } } });
  });
  await page.goto('/static/canvas.html?canvas_board_v2=1');
  await expect(page.locator('#gateStatus')).not.toContainText('正在加载画布列表');
  await page.evaluate(() => {
    const target = window as any;
    const legacy = target.CanvasLegacyBridge;
    target.CanvasLegacyBridge = {
      ...legacy,
      async getComfyFields() {
        return [
          { id: 'seed', input: 'seed', name: 'Seed', node: '1', type: 'number', default: 7, min: 1, max: 999999, random_enabled: true },
          { id: 'sampler', input: 'sampler', name: 'Sampler', node: '1', type: 'dropdown', default: 'euler', options: ['euler', 'dpm'] },
          { id: 'image', input: 'image', name: 'Image', node: '2', type: 'image' },
          { id: 'positive', input: 'positive', name: 'Positive Prompt', node: '3', type: 'textarea' },
        ];
      },
      getNodeOptions(type: string, field: string, node: Record<string, unknown>) {
        if (type === 'comfy' && field === 'workflow') return [{ value: 'fixture.json', label: 'Fixture Workflow' }];
        return legacy.getNodeOptions(type, field, node);
      },
    };
    document.getElementById('shell')?.classList.remove('no-canvas');
    window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
      id: 'v2-parity', updated_at: 1, connections: [{ from: 'generator-upstream', to: 'video-parity' }],
      nodes: [
        { id: 'generator-upstream', type: 'generator', x: 0, y: 0 },
        { id: 'video-parity', type: 'video', x: 380, y: 0, apiProvider: 'comfly', model: '', manualVideoUrls: [] },
        { id: 'comfy-parity', type: 'comfy', x: 820, y: 0, mode: 'custom', comfyWorkflow: 'fixture.json', comfyParams: {}, comfyRandomActive: {} },
      ],
    } }));
    target.CanvasBoardV2.prepareVideoMedia = async (nodeId: string, action: string, value?: string) => {
      if (action === 'manual') target.CanvasBoardV2.updateNode(nodeId, { manualVideoUrls: value ? [value] : [] });
    };
  });

  const video = page.locator('[data-node-id="video-parity"]');
  await expect(video.getByRole('button', { name: '一键运行' })).toBeVisible();
  await video.getByLabel('视频手动 URL').fill('https://cdn.example/reference.mp4');
  await video.getByRole('button', { name: '应用网址' }).click();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'video-parity')).toMatchObject({ manualVideoUrls: ['https://cdn.example/reference.mp4'] });

  const comfy = page.locator('[data-node-id="comfy-parity"]');
  await expect(comfy).toContainText('动态媒体字段 1');
  await comfy.getByLabel('Seed', { exact: true }).fill('42');
  await comfy.getByLabel('Seed', { exact: true }).blur();
  await comfy.getByRole('button', { name: 'Seed 随机' }).click();
  await comfy.getByLabel('Sampler').selectOption('dpm');
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'comfy-parity')).toMatchObject({ comfyParams: { seed: 42, sampler: 'dpm' }, comfyRandomActive: { seed: false } });
});

test('owns Image, Group and LTX Director media lifecycles in V2', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/ai/upload', async (route) => route.fulfill({ json: { files: [{ url: '/uploads/replaced.png', name: 'replaced.png', kind: 'image' }] } }));
  await page.route('**/api/canvases/v2-ltx-media', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    saves.push(body);
    await route.fulfill({ json: { canvas: { ...body, id: 'v2-ltx-media', updated_at: saves.length + 1 } } });
  });
  await page.goto('/static/canvas.html?canvas_board_v2=1');
  await expect(page.locator('#gateStatus')).not.toContainText('正在加载画布列表');
  await page.evaluate(() => {
    document.getElementById('shell')?.classList.remove('no-canvas');
    window.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: {
      id: 'v2-ltx-media', updated_at: 1, extension: 'kept', connections: [],
      nodes: [
        { id: 'ltx-v2', type: 'ltxDirector', x: 20, y: 110, w: 800, h: 600, durationFrames: 120, durationSeconds: 5, frameRate: 24, customWidth: 0, customHeight: 0, ltxTimelineData: JSON.stringify({ segments: [{ id: 'segment-1', type: 'text', prompt: 'opening', start: 0, length: 120 }], audioSegments: [] }) },
        { id: 'image-a', type: 'image', x: 850, y: 110, url: '', name: '空白图片', mediaKind: 'image' },
        { id: 'image-b', type: 'image', x: 850, y: 470, url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', name: 'second.gif', mediaKind: 'image' },
      ],
    } }));
  });

  const ltx = page.locator('[data-node-id="ltx-v2"]');
  await expect.poll(() => ltx.locator('.ltx-director-timeline-host').evaluate((element) => element.childElementCount)).toBeGreaterThan(0);
  await ltx.getByLabel('LTX FPS').fill('30');
  await ltx.getByLabel('LTX 全局提示词').fill('cinematic sequence');
  await ltx.getByLabel('LTX 全局提示词').blur();
  await ltx.getByRole('button', { name: '自定义音频' }).click();
  await ltx.getByLabel('LTX Noise Seed').fill('99');
  await ltx.getByLabel('LTX Noise Seed').blur();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'ltx-v2')).toMatchObject({ frameRate: 30, globalPrompt: 'cinematic sequence', useCustomAudio: true, noiseSeed: 99 });
  expect(saves.at(-1)?.nodes.find((node: any) => node.id === 'ltx-v2')?.ltxTimelineData).toContain('segment-1');

  const first = page.locator('[data-node-id="image-a"]');
  await first.locator('input[type="file"]').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from('png') });
  await expect(first.locator('img')).toHaveAttribute('src', '/uploads/replaced.png');
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'image-a')).toMatchObject({ url: '/uploads/replaced.png', mediaKind: 'image' });

  await first.locator('.node-head').click();
  await page.locator('[data-node-id="image-b"] .node-head').click({ modifiers: ['Control'] });
  await page.evaluate(() => (window as typeof window & { groupSelectedImages(): void }).groupSelectedImages());
  const group = page.locator('[data-node-type="group"]');
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('2 个媒体');
  await group.locator('.node-head').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(0);
  await expect(page.locator('[data-node-type="ltxDirector"]')).toHaveCount(1);
  expect(saves.at(-1)).toMatchObject({ extension: 'kept' });

  await page.evaluate(() => (window as typeof window & { addLTXDirectorNode(): void }).addLTXDirectorNode());
  await expect(page.locator('[data-node-type="ltxDirector"]')).toHaveCount(2);
});

test('runs fake execution and mocked task/repository contracts with all M2 switches enabled', async ({ page }) => {
  let taskPolls = 0;
  let taskPosts = 0;
  await page.route('**/api/canvas-image-tasks**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      taskPosts += 1;
      await route.fulfill({ json: { task_id: 'e2e-task', status: 'queued' } });
      return;
    }
    taskPolls += 1;
    await route.fulfill({
      json: taskPolls === 1
        ? { id: 'e2e-task', status: 'running' }
        : { id: 'e2e-task', status: 'succeeded', result: { images: ['/output/mock.png'] } },
    });
  });
  await page.route('**/api/canvases/e2e-canvas', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 409,
        json: {
          detail: {
            message: 'conflict',
            updated_at: 2,
            canvas: { id: 'e2e-canvas', nodes: [], connections: [], updated_at: 2 },
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: { canvas: { id: 'e2e-canvas', nodes: [], connections: [], custom: 'preserved' } },
    });
  });

  await page.goto('/static/canvas.html?canvas_m2=1&canvas_react_islands=1');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-m2', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-execution-engine', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-task-client', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-repository', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-activity', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-execution', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-islands', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-status', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-toolbar', 'enabled');
  await expect(page.getByTestId('execution-status-island')).toContainText('现代执行已就绪');
  await expect(page.locator('#canvasExecutionIsland')).not.toHaveAttribute('hidden', '');
  await page.locator('#shell').evaluate((element) => element.classList.remove('no-canvas'));
  await expect(page.getByTestId('execution-status-island')).toBeVisible();
  await expect(page.getByTestId('canvas-status-island')).toBeVisible();
  await page.evaluate(() => (window as typeof window & { setStatus(text: string): void }).setStatus('Saving...'));
  await expect(page.getByTestId('canvas-status-island')).toContainText('Saving...');
  await page.evaluate(() => (window as typeof window & { setStatus(text: string): void }).setStatus('Saved'));
  await expect(page.getByTestId('canvas-status-island')).toContainText('Saved');
  await expect(page.locator('#canvasCostToggle')).toBeHidden();
  await expect(page.locator('#canvasLogToggle')).toBeHidden();
  await expect(page.locator('#canvasBackupToggle')).toBeHidden();
  await expect(page.locator('#logModal > .log-panel')).toBeHidden();
  await page.getByRole('button', { name: '生成日志' }).click();
  await expect(page.locator('#logModal')).toHaveClass(/open/);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('canvas-legacy-activity', {
    detail: {
      costs: { calls: 1, estimated: 0, image: 1_250_000, total: 1_250_000, unknown: 0, video: 0 },
      logs: [{
        costMicros: 1_250_000,
        costSource: 'actual',
        createdAt: Date.now(),
        error: '',
        id: 'e2e-log',
        model: 'Mock Image',
        outputCount: 1,
        platform: 'Mock API',
        prompt: 'island projection',
        runMs: 1_500,
        status: 'success',
      }],
      mode: 'logs',
    },
  })));
  await expect(page.getByTestId('canvas-activity-island')).toContainText('island projection');
  await expect(page.getByTestId('canvas-activity-island')).toContainText('¥1.25');
  await page.evaluate(() => (window as typeof window & { closeCanvasLog(): void }).closeCanvasLog());
  await page.getByRole('button', { name: '费用' }).click();
  await expect(page.getByTestId('canvas-activity-island')).toContainText('费用仪表盘');
  await page.getByRole('button', { name: '关闭日志' }).click();

  const result = await page.evaluate(async () => {
    const core = (window as typeof window & { CanvasModernCore: any }).CanvasModernCore;
    const calls: string[] = [];
    let events = 0;
    window.addEventListener('canvas-modern-execution', () => { events += 1; });
    const execution = await core.runOrdered({
      targetId: 'retry-target',
      order: ['failed', 'child'],
      mode: 'retry',
      execute: async (nodeId: string) => { calls.push(nodeId); },
    });
    const submission = core.taskClient.submit('image', { prompt: 'mock only' }, { idempotencyKey: 'e2e:one' });
    const duplicateSubmission = core.taskClient.submit('image', { prompt: 'mock only' }, { idempotencyKey: 'e2e:one' });
    const sameSubmission = submission === duplicateSubmission;
    const submitted = await submission;
    const task = await core.taskClient.wait('image', submitted.task_id, { intervalMs: 0, timeoutMs: 1_000 });
    const document = await core.canvasRepository.get('e2e-canvas');
    let conflict: unknown = null;
    try {
      await core.canvasRepository.save('e2e-canvas', { nodes: [], connections: [], base_updated_at: 1 });
    } catch (error) {
      conflict = { code: error.code, updatedAt: error.updatedAt };
    }
    return {
      calls,
      conflict,
      documentCustom: document.custom,
      events,
      executionMode: execution.mode,
      executionStatus: execution.status,
      m2: core.getM2Report(),
      sameSubmission,
      taskStatus: task.status,
    };
  });

  expect(result).toEqual({
    calls: ['failed', 'child'],
    conflict: { code: 'conflict', updatedAt: 2 },
    documentCustom: 'preserved',
    events: 7,
    executionMode: 'retry',
    executionStatus: 'done',
    m2: {
      enabled: true,
      rollout: {
        blockedReasons: ['rollout-disabled'],
        bucket: expect.any(Number),
        enabled: false,
        forced: false,
        killSwitch: false,
        percentage: 0,
        policyLoaded: true,
        source: 'server',
      },
      execution: { active: 0, done: 1, failed: 0, stopped: 0, transitions: 7 },
      flags: { executionEngine: true, repository: true, taskClient: true },
      repository: {
        audits: 0,
        backupsCreated: 0,
        backupsListed: 0,
        backupsRestored: 0,
        conflicts: 1,
        errors: 0,
        loads: 1,
        saves: 0,
      },
      tasks: {
        activeSubmissions: 0,
        activeWatches: 0,
        cancelledWatches: 0,
        deduplicatedSubmissions: 1,
        deduplicatedWatches: 0,
        pollErrors: 0,
        polls: 2,
        recoveredTasks: 0,
        resumeRequests: 0,
        resumedTasks: 0,
        submissions: 1,
        submissionRetries: 0,
      },
    },
    sameSubmission: true,
    taskStatus: 'succeeded',
  });
  expect(taskPosts).toBe(1);
  expect(taskPolls).toBe(2);
  await expect(page.getByTestId('execution-status-island')).toContainText('已完成');
  await expect(page.getByTestId('execution-status-island')).toContainText('2/2 节点');

  await page.evaluate(() => {
    const target = window as typeof window & {
      __stageSixCommands: string[];
      requestCascadeStop(id: string): void;
      retryNodeAndDownstream(id: string): void;
    };
    target.__stageSixCommands = [];
    target.requestCascadeStop = (id) => { target.__stageSixCommands.push(`stop:${id}`); };
    target.retryNodeAndDownstream = (id) => { target.__stageSixCommands.push(`retry:${id}`); };
    window.dispatchEvent(new CustomEvent('canvas-modern-execution', { detail: { state: {
      completedNodeIds: ['failed-node'],
      completedRounds: 0,
      currentNodeId: '',
      error: 'mock failure',
      mode: 'retry',
      order: ['failed-node', 'child'],
      rounds: {},
      status: 'failed',
      targetId: 'failed-node',
    } } }));
  });
  await expect(page.getByTestId('execution-status-island')).toContainText('mock failure');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('canvas-modern-execution', { detail: { state: {
    completedNodeIds: [],
    completedRounds: 0,
    currentNodeId: 'running-node',
    error: '',
    mode: 'serial',
    order: ['running-node'],
    rounds: {},
    status: 'running',
    targetId: 'running-node',
  } } })));
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __stageSixCommands: string[] }).__stageSixCommands))
    .toEqual(['retry:failed-node', 'stop:running-node']);
});
