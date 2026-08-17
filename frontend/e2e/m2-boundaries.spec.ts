import { expect, test } from '@playwright/test';

test('keeps stage 4 and 5 boundaries disabled by default', async ({ page }) => {
  await page.goto('/static/canvas.html');

  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-core', '14');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-m2', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-execution-engine', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-task-client', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-repository', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-execution', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-status', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-toolbar', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-legacy-bridge', 'ready');
  await expect(page.locator('#canvasExecutionIsland')).toBeHidden();
  await expect(page.locator('#canvasStatusIsland')).toBeHidden();
  await expect(page.locator('#canvasToolbarIsland')).toBeHidden();
});

test('runs fake execution and mocked task/repository contracts with all M2 switches enabled', async ({ page }) => {
  let taskPolls = 0;
  await page.route('**/api/canvas-image-tasks**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
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

  await page.goto('/static/canvas.html?canvas_m2=1&canvas_react_execution=1&canvas_react_status=1&canvas_react_toolbar=1');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-m2', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-execution-engine', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-task-client', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-repository', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-react-execution', 'enabled');
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
  await page.getByRole('button', { name: '生成日志' }).click();
  await expect(page.locator('#logModal')).toHaveClass(/open/);
  await page.evaluate(() => (window as typeof window & { closeCanvasLog(): void }).closeCanvasLog());
  await page.getByRole('button', { name: '费用' }).click();
  await expect(page.locator('#canvasLogTitle')).toHaveText('费用仪表盘');

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
    const submitted = await core.taskClient.submit('image', { prompt: 'mock only' });
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
      execution: { active: 0, done: 1, failed: 0, stopped: 0, transitions: 7 },
      flags: { executionEngine: true, repository: true, taskClient: true },
      repository: {
        backupsCreated: 0,
        backupsListed: 0,
        backupsRestored: 0,
        conflicts: 1,
        errors: 0,
        loads: 1,
        saves: 0,
      },
      tasks: {
        activeWatches: 0,
        cancelledWatches: 0,
        deduplicatedWatches: 0,
        pollErrors: 0,
        polls: 2,
        submissions: 1,
      },
    },
    taskStatus: 'succeeded',
  });
  expect(taskPolls).toBe(2);
  await expect(page.getByTestId('execution-status-island')).toContainText('已完成');
  await expect(page.getByTestId('execution-status-island')).toContainText('2/2 节点');
});
