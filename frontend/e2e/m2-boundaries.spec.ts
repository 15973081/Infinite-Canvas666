import { expect, test, type Page } from '@playwright/test';

type CanvasFixture = Record<string, any> & { id: string; nodes: Array<Record<string, any>>; connections: Array<Record<string, any>> };
type CanvasSaveResult = { canvas?: CanvasFixture; detail?: unknown; status?: number };

async function openModernCanvasFixture(
  page: Page,
  initial: CanvasFixture,
  options: {
    beforeOpen?: () => Promise<void>;
    config?: Record<string, unknown>;
    onSave?: (body: Record<string, any>, current: CanvasFixture) => CanvasSaveResult | Promise<CanvasSaveResult>;
  } = {},
) {
  let current = structuredClone(initial);
  await page.route('**/api/config', async (route) => route.fulfill({ json: options.config ?? { api_providers: [] } }));
  await page.route('**/api/canvas-folders', async (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', async (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route(`**/api/canvases/${initial.id}/lock`, async (route) => route.fulfill({ json: { ok: true } }));
  await page.route(`**/api/canvases/${initial.id}/meta`, async (route) => route.fulfill({ json: { updated_at: current.updated_at || 1 } }));
  await page.route(`**/api/canvases/${initial.id}`, async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fulfill({ json: { canvas: current } });
      return;
    }
    const body = JSON.parse(route.request().postData() || '{}');
    const result = options.onSave
      ? await options.onSave(body, structuredClone(current))
      : { canvas: { ...current, ...body, id: initial.id, updated_at: Number(current.updated_at || 1) + 1 } };
    if (result.status && result.status >= 400) {
      await route.fulfill({ status: result.status, json: { detail: result.detail } });
      return;
    }
    current = structuredClone(result.canvas ?? { ...current, ...body, id: initial.id, updated_at: Number(current.updated_at || 1) + 1 });
    await route.fulfill({ json: { canvas: current } });
  });
  await page.route('**/api/canvases', async (route) => route.fulfill({ json: { canvases: [{ id: initial.id, title: initial.title || initial.id, updated_at: initial.updated_at || 1 }] } }));
  await page.goto('/static/canvas.html');
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { CanvasModernCore?: unknown }).CanvasModernCore)).toBe('object');
  await options.beforeOpen?.();
  await page.getByRole('button', { name: new RegExp(String(initial.title || initial.id)) }).click();
  await expect(page.getByTestId('canvas-board-v2')).toHaveCount(1);
  return { current: () => structuredClone(current) };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/canvas-rollout/events', async (route) => route.fulfill({ json: { accepted: true } }));
});

test('keeps the Legacy Canvas available only through an explicit rollback', async ({ page }) => {
  await page.goto('/static/canvas.html?canvas_v2=0');

  await expect(page).toHaveURL(/\/static\/canvas-legacy\.html$/);
  await expect(page.locator('#shell')).toBeVisible();
  await expect(page.locator('#canvasModernApp')).toHaveCount(0);
  expect(await page.evaluate(() => 'CanvasLegacyBridge' in window)).toBe(false);
  await expect(page.locator('#canvasExecutionIsland,#canvasStatusIsland,#canvasToolbarIsland,#canvasActivityIsland,#canvasBoardV2')).toHaveCount(0);
  await page.evaluate(() => (window as typeof window & { openCanvasLog(): void }).openCanvasLog());
  await expect(page.locator('#logModal > .log-panel')).toBeVisible();
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

  await expect(page).toHaveURL(/\/static\/canvas-legacy\.html$/);
  await expect(page.locator('#shell')).toBeVisible();
  expect(await page.evaluate(() => 'CanvasModernCore' in window)).toBe(false);
});

test('activates the cohesive V2 stack through deterministic rollout controls', async ({ page }) => {
  await page.goto('/static/canvas.html');

  await expect(page.locator('html')).toHaveAttribute('data-canvas-v2-rollout', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-v2-rollout-percentage', '100');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-m2', 'enabled');
  await expect(page.locator('.canvas-modern-manager')).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择画布' })).toBeVisible();
  await expect(page.locator('.gate-folder-pane')).toBeVisible();
  await expect(page.locator('.gate-list')).toHaveCSS('display', 'grid');
  await expect(page.getByRole('link', { name: '新建智能画布' })).toBeVisible();
  await expect(page.locator('.canvas-modern-gate select')).toHaveCount(0);
  await expect(page.locator('#shell')).toHaveCount(0);
  const report = await page.evaluate(() => (window as typeof window & { CanvasModernCore: any }).CanvasModernCore.getM2Report());
  expect(report.rollout).toMatchObject({ enabled: true, forced: false, percentage: 100, source: 'server' });

  await page.goto('/static/canvas.html?canvas_v2=0&canvas_v2_rollout=100');
  await expect(page).toHaveURL(/\/static\/canvas-legacy\.html$/);
  await expect(page.locator('#shell')).toBeVisible();
});

test('runs the standalone React Canvas without loading the legacy Canvas runtime', async ({ page }) => {
  let saves = 0;
  await page.route('**/api/config', async (route) => route.fulfill({ json: {
    api_providers: [{ enabled: true, id: 'mock', image_models: ['mock-image'], name: 'Mock' }],
  } }));
  await page.route('**/api/canvases/trash', async (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/standalone-e2e/lock', async (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/standalone-e2e', async (route) => {
    const document = {
      id: 'standalone-e2e', schemaVersion: 1, title: 'Standalone E2E', updated_at: 1,
      connections: [{ from: 'prompt-1', to: 'generator-1' }],
      nodes: [
        { id: 'prompt-1', type: 'prompt', text: 'modern canvas', x: 30, y: 80 },
        { id: 'generator-1', type: 'generator', apiProvider: 'mock', model: 'mock-image', x: 380, y: 80 },
      ],
    };
    if (route.request().method() === 'PUT') {
      saves += 1;
      await route.fulfill({ json: { canvas: { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves + 1 } } });
      return;
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', async (route) => route.fulfill({ json: { canvases: [{ id: 'standalone-e2e', title: 'Standalone E2E', updated_at: 1 }] } }));
  await page.route('**/api/canvas-image-tasks**', async (route) => {
    if (route.request().method() === 'POST') await route.fulfill({ json: { task_id: 'standalone-task', status: 'queued' } });
    else await route.fulfill({ json: { id: 'standalone-task', status: 'succeeded', result: { images: ['/output/standalone.png'] } } });
  });

  await page.goto('/static/canvas.html');
  await page.getByRole('button', { name: /Standalone E2E/ }).click();
  await expect(page.locator('.canvas-modern-editor')).toBeVisible();
  await expect(page.locator('[data-node-type="generator"]')).toHaveCount(1);
  const isolation = await page.evaluate(() => ({
    api: typeof (window as typeof window & { CanvasApi?: unknown }).CanvasApi,
    bridge: typeof (window as typeof window & { CanvasLegacyBridge?: unknown }).CanvasLegacyBridge,
    legacyScripts: [...document.scripts].filter((script) => /\/(static\/js\/(canvas|canvas-core|canvas-api|theme)|static\/vendor\/js\/(tailwindcss-cdn|lucide))\.js/.test(script.src)).length,
  }));
  expect(isolation).toEqual({ api: 'undefined', bridge: 'undefined', legacyScripts: 0 });

  await page.locator('[data-node-type="generator"]').getByRole('button', { name: '运行', exact: true }).click();
  await expect.poll(() => saves).toBeGreaterThan(0);
  await expect(page.locator('[data-node-type="output"] img[src="/output/standalone.png"]')).toHaveCount(1);
});

test('rebases disjoint CanvasBoard V2 edits after a repository conflict', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  const telemetry: string[] = [];
  const initial = {
    id: 'v2-conflict', title: 'V2 Conflict', updated_at: 1, connections: [],
    nodes: [
      { id: 'prompt', type: 'prompt', text: 'base', x: 40, y: 120 },
      { id: 'generator', type: 'generator', model: 'base-model', x: 420, y: 120 },
    ],
  };
  await page.route('**/api/canvas-rollout/events', async (route) => {
    telemetry.push(JSON.parse(route.request().postData() || '{}').event);
    await route.fulfill({ json: { accepted: true } });
  });
  await openModernCanvasFixture(page, initial, { onSave: (body) => {
    saves.push(body);
    if (saves.length === 1) return { status: 409, detail: {
        message: 'conflict', updated_at: 2,
        canvas: {
          id: 'v2-conflict', updated_at: 2, connections: [],
          nodes: [
            { id: 'prompt', type: 'prompt', text: 'base', x: 40, y: 120 },
            { id: 'generator', type: 'generator', model: 'remote-model', x: 420, y: 120 },
          ],
        },
      } };
    return { canvas: { ...body, id: 'v2-conflict', updated_at: 3 } as CanvasFixture };
  } });

  const editor = page.locator('[data-node-id="prompt"] textarea[data-field="text"]');
  await editor.fill('local edit');
  await editor.blur();

  await expect.poll(() => saves.length).toBe(2);
  await expect.poll(() => telemetry.filter((event) => event.startsWith('save-'))).toEqual([
    'save-conflict',
    'save-rebased',
    'save-succeeded',
  ]);
  expect(saves[1]).toMatchObject({ base_updated_at: 2 });
  expect(saves[1].nodes.find((node: any) => node.id === 'prompt')).toMatchObject({ text: 'local edit' });
  expect(saves[1].nodes.find((node: any) => node.id === 'generator')).toMatchObject({ model: 'remote-model' });
  await expect(page.getByTestId('canvas-board-v2').locator('..')).toHaveAttribute('data-save-state', 'saved');
});

test('keeps interrupted persisted tasks actionable after a backend restart', async ({ page }) => {
  let retrySubmissions = 0;
  await page.route('**/api/canvas-image-tasks**', async (route) => {
    if (route.request().method() === 'POST') {
      retrySubmissions += 1;
      await route.fulfill({ json: { task_id: 'retry-task', status: 'queued' } });
      return;
    }
    await route.fulfill({ json: { task_id: 'retry-task', status: 'succeeded', result: { images: [] } } });
  });
  await openModernCanvasFixture(page, {
    id: 'recovery-e2e', title: 'Recovery E2E', updated_at: 1, connections: [],
    nodes: [
      { id: 'generator', type: 'generator', x: 40, y: 120, apiProvider: 'mock', model: 'mock-image', userInput: 'retry prompt' },
      { id: 'output', type: 'output', x: 420, y: 120, _pending: [{
        id: 'pending-restart', canvasTaskId: 'canvas_img_old', failed: true,
        recoveryStatus: 'interrupted', run: { node: { id: 'generator', type: 'generator' } },
      }] },
    ],
  }, { config: {
    api_providers: [{ enabled: true, id: 'mock', image_models: ['mock-image'], name: 'Mock' }],
  } });

  const pending = page.locator('[data-pending-id="pending-restart"]');
  await expect(pending).toContainText('任务追踪已中断');
  await pending.getByRole('button', { name: '重新生成' }).click();
  await expect(pending).toHaveCount(0);
  await expect.poll(() => retrySubmissions).toBe(1);
});

test('mounts CanvasBoard V2 exclusively inside the production React Canvas', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  let updatedAt = 1;
  const initial = {
    id: 'v2-e2e', title: 'V2 E2E', custom: 'preserved', updated_at: 1,
    nodes: [
      { id: 'prompt-1', type: 'prompt', title: 'Prompt', x: 80, y: 180 },
      { id: 'generator-1', type: 'generator', title: 'Generator', x: 420, y: 330 },
      { id: 'output-1', type: 'output', title: 'Output', x: 900, y: 330 },
    ],
    connections: [{ from: 'prompt-1', to: 'generator-1' }],
  };
  await openModernCanvasFixture(page, initial, { onSave: (body) => {
    saves.push(body);
    updatedAt += 1;
    return { canvas: { ...body, id: 'v2-e2e', updated_at: updatedAt } as CanvasFixture };
  } });
  await expect(page.getByTestId('canvas-board-v2')).toHaveCount(1);

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

  expect(await page.evaluate(() => 'CanvasLegacyBridge' in window)).toBe(false);
});

test('edits and groups low-risk V2 nodes through the persisted document', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  await openModernCanvasFixture(page, {
    id: 'v2-low-risk', title: 'V2 Low Risk', future: 'preserved', updated_at: 1,
    nodes: [
      { id: 'prompt-a', type: 'prompt', x: 80, y: 160, text: '', future: 'node-preserved' },
      { id: 'prompt-b', type: 'prompt', x: 80, y: 430, text: 'second' },
      { id: 'loop-a', type: 'loop', x: 480, y: 160, count: 3, mode: 'serial', showPrompt: false, imageInput: false },
    ],
    connections: [],
  }, { onSave: (body) => {
    saves.push(body);
    return { canvas: { ...body, id: 'v2-low-risk', updated_at: saves.length + 1 } as CanvasFixture };
  } });

  const prompt = page.locator('[data-node-id="prompt-a"]');
  await prompt.locator('textarea').fill('cinematic prompt');
  await prompt.locator('textarea').blur();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'prompt-a')?.text).toBe('cinematic prompt');
  expect(saves.at(-1)).toMatchObject({ future: 'preserved' });
  expect(saves.at(-1)?.nodes.find((node: any) => node.id === 'prompt-a')).toMatchObject({ future: 'node-preserved' });
  await prompt.getByRole('button', { name: '模板' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: '提示词库' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();

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
  await page.getByRole('button', { name: '分组' }).click();
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
  await openModernCanvasFixture(page, {
    id: 'v2-generation', title: 'V2 Generation', updated_at: 1, extension: 'kept',
    nodes: [
      { id: 'prompt-gen', type: 'prompt', x: 20, y: 20, text: 'city' },
      { id: 'generator-v2', type: 'generator', x: 380, y: 20, apiProvider: 'comfly', model: '', ratio: 'square', resolution: '1k', quality: 'auto', count: 1, runStatus: 'failed', runError: 'recoverable failure', _cascadeFailed: true },
      { id: 'msgen-v2', type: 'msgen', x: 380, y: 410, msgenModel: 'zimage', msRatio: 'square', msResolution: '1k', count: 1 },
      { id: 'output-v2', type: 'output', x: 820, y: 20, images: [{ url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', future: true, run: { nodeType: 'generator', node: { type: 'generator', quality: 'medium' }, prompt: 'rerun prompt', refs: [] } }], imageComparisons: { 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==': { url: '/static/images/logo.png' } }, _pending: [{ id: 'pending-v2', taskId: 'task-v2', status: '正在恢复' }] },
    ],
    connections: [{ from: 'prompt-gen', to: 'generator-v2' }, { from: 'generator-v2', to: 'output-v2' }],
  }, { onSave: (body) => {
    saves.push(body);
    return { canvas: { ...body, id: 'v2-generation', updated_at: saves.length + 1 } as CanvasFixture };
  } });

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
  await expect(page.locator('.canvas-v2-lightbox')).toBeVisible();
  const rerun = page.getByRole('button', { name: '再次运行' });
  await expect(rerun).toHaveAttribute('data-rerun-type', 'generator');
  await rerun.click();
  await expect.poll(() => saves.at(-1)?.nodes.filter((node: any) => node.type === 'generator').length).toBe(2);
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

  await page.getByRole('button', { name: 'API生成' }).click();
  await page.getByRole('button', { name: 'ModelScope', exact: true }).click();
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.locator('[data-node-type="generator"]')).toHaveCount(3);
  await expect(page.locator('[data-node-type="msgen"]')).toHaveCount(2);
  await expect(page.locator('[data-node-type="output"]')).toHaveCount(2);
});

test('edits Video, Comfy and LLM nodes in V2', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  await openModernCanvasFixture(page, {
    id: 'v2-media', title: 'V2 Media', updated_at: 1, extension: 'kept', connections: [],
    nodes: [
      { id: 'video-v2', type: 'video', x: 0, y: 120, apiProvider: 'comfly', model: '', duration: 5, aspectRatio: '16:9', resolution: '', taskMode: 'auto' },
      { id: 'comfy-v2', type: 'comfy', x: 420, y: 120, w: 420, h: 460, mode: 'text', width: 1024, height: 1024, comfyParams: {} },
      { id: 'llm-v2', type: 'llm', x: 850, y: 120, mode: 'node', llmProvider: 'comfly', model: '', systemPrompt: 'old', userInput: '', outputText: 'ready', messages: [{ role: 'assistant', content: 'hello' }] },
    ],
  }, { onSave: (body) => {
    saves.push(body);
    return { canvas: { ...body, id: 'v2-media', updated_at: saves.length + 1 } as CanvasFixture };
  } });

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

  await page.getByRole('button', { name: '视频' }).click();
  await page.getByRole('button', { name: 'ComfyUI' }).click();
  await page.getByRole('button', { name: 'LLM', exact: true }).click();
  await expect(page.locator('[data-node-type="video"]')).toHaveCount(2);
  await expect(page.locator('[data-node-type="comfy"]')).toHaveCount(2);
  await expect(page.locator('[data-node-type="llm"]')).toHaveCount(2);
});

test('persists production parity controls for Video and custom Comfy workflows', async ({ page }) => {
  const saves: Array<Record<string, any>> = [];
  await openModernCanvasFixture(page, {
    id: 'v2-parity', title: 'V2 Parity', updated_at: 1, connections: [{ from: 'generator-upstream', to: 'video-parity' }],
    nodes: [
      { id: 'generator-upstream', type: 'generator', x: 0, y: 0 },
      { id: 'video-parity', type: 'video', x: 380, y: 0, apiProvider: 'comfly', model: '', manualVideoUrl: '' },
      { id: 'comfy-parity', type: 'comfy', x: 820, y: 0, mode: 'custom', comfyWorkflow: 'fixture.json', comfyParams: {}, comfyRandomActive: {} },
    ],
  }, { onSave: (body) => {
    saves.push(body);
    return { canvas: { ...body, id: 'v2-parity', updated_at: saves.length + 1 } as CanvasFixture };
  }, beforeOpen: async () => page.evaluate(() => {
    const target = window as any;
    const runtime = target.CanvasModernCore.canvasRuntime;
    const originalOptions = runtime.getNodeOptions.bind(runtime);
    runtime.getComfyFields = async () => {
        return [
          { id: 'seed', input: 'seed', name: 'Seed', node: '1', type: 'number', default: 7, min: 1, max: 999999, random_enabled: true },
          { id: 'sampler', input: 'sampler', name: 'Sampler', node: '1', type: 'dropdown', default: 'euler', options: ['euler', 'dpm'] },
          { id: 'image', input: 'image', name: 'Image', node: '2', type: 'image' },
          { id: 'positive', input: 'positive', name: 'Positive Prompt', node: '3', type: 'textarea' },
        ];
    };
    runtime.getNodeOptions = (type: string, field: string, node: Record<string, unknown>) => {
      if (type === 'comfy' && field === 'workflow') return [{ value: 'fixture.json', label: 'Fixture Workflow' }];
      return originalOptions(type, field, node);
    };
  }) });
  const video = page.locator('[data-node-id="video-parity"]');
  await expect(video.getByRole('button', { name: '一键运行' })).toBeVisible();
  await video.getByLabel('视频手动 URL').fill('https://cdn.example/reference.mp4');
  await video.getByRole('button', { name: '应用网址' }).click();
  await expect.poll(() => saves.at(-1)?.nodes.find((node: any) => node.id === 'video-parity')).toMatchObject({ manualVideoUrl: 'https://cdn.example/reference.mp4' });

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
  await openModernCanvasFixture(page, {
    id: 'v2-ltx-media', title: 'V2 LTX Media', updated_at: 1, extension: 'kept', connections: [],
    nodes: [
      { id: 'ltx-v2', type: 'ltxDirector', x: 20, y: 110, w: 800, h: 600, durationFrames: 120, durationSeconds: 5, frameRate: 24, customWidth: 0, customHeight: 0, ltxTimelineData: JSON.stringify({ segments: [{ id: 'segment-1', type: 'text', prompt: 'opening', start: 0, length: 120 }], audioSegments: [] }) },
      { id: 'image-a', type: 'image', x: 850, y: 110, url: '', name: '空白图片', mediaKind: 'image' },
      { id: 'image-b', type: 'image', x: 850, y: 470, url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', name: 'second.gif', mediaKind: 'image' },
    ],
  }, { onSave: (body) => {
    saves.push(body);
    return { canvas: { ...body, id: 'v2-ltx-media', updated_at: saves.length + 1 } as CanvasFixture };
  } });

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
  await page.getByRole('button', { name: '分组' }).click();
  const group = page.locator('[data-node-type="group"]');
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('2 个媒体');
  await group.locator('.node-head').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-node-type="image"]')).toHaveCount(0);
  await expect(page.locator('[data-node-type="ltxDirector"]')).toHaveCount(1);
  expect(saves.at(-1)).toMatchObject({ extension: 'kept' });

  await page.getByRole('button', { name: 'LTX Director' }).click();
  await expect(page.locator('[data-node-type="ltxDirector"]')).toHaveCount(2);
});

test('runs modern execution and mocked task/repository contracts without the retired Legacy bridge', async ({ page }) => {
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

  await page.goto('/static/canvas.html');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-m2', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-execution-engine', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-task-client', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-repository', 'enabled');
  expect(await page.evaluate(() => 'CanvasLegacyBridge' in window)).toBe(false);

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
        blockedReasons: [],
        bucket: expect.any(Number),
        enabled: true,
        forced: false,
        killSwitch: false,
        percentage: 100,
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
});
