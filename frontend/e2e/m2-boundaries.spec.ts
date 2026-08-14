import { expect, test } from '@playwright/test';

test('keeps stage 4 and 5 boundaries disabled by default', async ({ page }) => {
  await page.goto('/static/canvas.html');

  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-core', '9');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-execution-engine', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-task-client', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-repository', 'disabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-legacy-bridge', 'ready');
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

  await page.goto('/static/canvas.html?canvas_execution_engine=1&canvas_task_client=1&canvas_repository=1');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-execution-engine', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-task-client', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-canvas-modern-repository', 'enabled');

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
    taskStatus: 'succeeded',
  });
  expect(taskPolls).toBe(2);
});
