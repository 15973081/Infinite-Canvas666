import { expect, test } from '@playwright/test';

test('projects a completed image task into a runtime-created Output node', async ({ page }) => {
  const saves: Array<Record<string, unknown>> = [];
  const taskRequests: string[] = [];
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.route('**/api/canvas-rollout/events', (route) => route.fulfill({ json: { accepted: true } }));
  await page.route('**/api/canvas-folders', (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/execution-e2e/lock', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/execution-e2e', async (route) => {
    const base = {
      id: 'execution-e2e', schemaVersion: 1, title: 'Execution E2E', updated_at: 1,
      connections: [{ from: 'prompt', to: 'generator' }],
      nodes: [
        { id: 'prompt', type: 'prompt', text: 'modern canvas', x: 30, y: 80 },
        { id: 'generator', type: 'generator', apiProvider: 'mock', model: 'mock-image', x: 380, y: 80 },
      ],
    };
    if (route.request().method() === 'PUT') {
      const payload = JSON.parse(route.request().postData() || '{}');
      saves.push(payload);
      await route.fulfill({ json: { canvas: { ...base, ...payload, updated_at: saves.length + 1 } } });
      return;
    }
    await route.fulfill({ json: { canvas: base } });
  });
  await page.route('**/api/canvases', (route) => route.fulfill({ json: { canvases: [{ id: 'execution-e2e', title: 'Execution E2E', kind: 'classic', updated_at: 1 }] } }));
  await page.route('**/api/canvas-image-tasks**', async (route) => {
    taskRequests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    if (route.request().method() === 'POST') await route.fulfill({ json: { task_id: 'execution-task', status: 'queued' } });
    else await route.fulfill({ json: { id: 'execution-task', status: 'succeeded', result: { images: ['/output/execution.png'] } } });
  });

  await page.goto('/static/canvas.html?canvas_v2_rollout=100');
  await page.locator('.canvas-item[data-canvas-id="execution-e2e"] .canvas-open').click();
  await page.locator('[data-node-id="generator"]').getByRole('button', { name: '运行', exact: true }).click();

  await expect(page.locator('[data-node-type="output"] img[src="/output/execution.png"]')).toHaveCount(1);
  await expect.poll(() => saves.some((payload) => (payload.nodes as Array<Record<string, unknown>> | undefined)?.some((node) => node.type === 'output'))).toBe(true);
  expect(taskRequests).toEqual(['POST /api/canvas-image-tasks', 'GET /api/canvas-image-tasks/execution-task']);
  expect(dialogs).toEqual([]);
});
