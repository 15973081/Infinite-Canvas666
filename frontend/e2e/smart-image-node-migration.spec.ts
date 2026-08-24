import { expect, test, type Page } from '@playwright/test';

async function mockSmartImageNodes(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-image-nodes', kind: 'smart', schemaVersion: 1, title: 'Smart image nodes', updated_at: 1, connections: [],
    nodes: [
      { id: 'empty', type: 'smart-image', x: 20, y: 20, images: [], scale: 2 },
      { id: 'single', type: 'smart-image', x: 360, y: 20, images: [{ url: '/assets/single.png', name: 'single.png', natural_w: 640, natural_h: 480 }], scale: 1 },
      { id: 'group', type: 'smart-image', x: 20, y: 250, images: [{ url: '/assets/a.png' }, { url: '/assets/b.png' }, { url: '/assets/c.png' }], scale: 0.8 },
      { id: 'history', type: 'smart-image', x: 430, y: 250, historyFor: 'single', isHistoryGroup: true, images: [{ url: '/assets/old-a.png' }, { url: '/assets/old-b.png' }], scale: 0.8 },
      { id: 'video', type: 'smart-image', x: 760, y: 20, images: [{ url: '/assets/demo.mp4', kind: 'video', name: 'demo.mp4' }], scale: 0.6 },
      { id: 'audio', type: 'smart-image', x: 1080, y: 20, images: [{ url: '/assets/demo.mp3', kind: 'audio', name: 'demo.mp3' }], scale: 0.6 },
      { id: 'pending-one', type: 'smart-image', x: 760, y: 250, images: [], pending: 1, scale: 0.6 },
      { id: 'pending-many', type: 'smart-image', x: 1080, y: 250, images: [], pending: 4, scale: 0.5 },
      { id: 'queued', type: 'smart-image', x: 760, y: 500, images: [], queued: true, scale: 0.6 },
      { id: 'recover', type: 'smart-image', x: 360, y: 500, images: [], pending: 1, pendingTasks: [{ taskId: 'local-recover', failed: true, recoverTaskId: 'upstream-42', providerId: 'provider' }], scale: 0.5 },
      { id: 'auto', type: 'smart-image', x: 20, y: 500, images: [], pending: 1, pendingTasks: [{ taskId: 'task-auto', kind: 'image' }], runStartedAt: Date.now() - 1000, scale: 0.5 },
    ],
  };
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-image-nodes/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-image-nodes', async route => {
    if (route.request().method() !== 'GET') { document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves.length + 2 }; saves.push(structuredClone(document)); }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  await page.route('**/api/canvas-image-tasks/task-auto', route => route.fulfill({ json: { status: 'succeeded', result: { images: [{ url: '/assets/recovered.png', name: 'recovered.png' }] } } }));
  await page.route('**/api/image-task-query', route => route.fulfill({ json: { status: 'succeeded', images: [{ url: '/assets/manual-recovered.png', name: 'manual-recovered.png' }] } }));
  return { saves };
}

test('renders empty, single, multi-image and history groups with the original DOM classes', async ({ page }) => {
  await mockSmartImageNodes(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-image-nodes');
  await expect(page.locator('[data-node-id="empty"].image-node.empty-node .node-drop')).toBeVisible();
  await expect(page.locator('[data-node-id="single"].image-node .image-wrap img.node-img')).toHaveCount(1);
  await expect(page.locator('[data-node-id="group"].image-node.group-node .thumb-grid .thumb-item')).toHaveCount(3);
  await expect(page.locator('[data-node-id="history"].image-node.group-node.history-group-node .thumb-item')).toHaveCount(2);
  await expect(page.locator('[data-node-type="smart-image"]')).toHaveCount(11);
  await expect(page.locator('[data-node-type="output"]')).toHaveCount(0);
  await expect(page.locator('[data-node-type="generator"]')).toHaveCount(0);
});

test('renders video, audio, queued and loading states', async ({ page }) => {
  await mockSmartImageNodes(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-image-nodes');
  const video = page.locator('[data-node-id="video"]');
  await expect(video.locator('.media-video-card .smart-video-play')).toBeVisible();
  await video.locator('.smart-video-play').click();
  await expect(video.locator('.media-video-card video[controls]')).toHaveCount(1);
  await expect(page.locator('[data-node-id="audio"] .media-audio-card audio[controls]')).toHaveCount(1);
  await expect(page.locator('[data-node-id="pending-one"] .loading-cell.single')).toHaveCount(1);
  await expect(page.locator('[data-node-id="pending-many"] .loading-skeleton .loading-cell')).toHaveCount(4);
  await expect(page.locator('[data-node-id="queued"] .loading-cell.single.queued')).toHaveCount(1);
});

test('restores automatic and manually recoverable tasks on the same smart-image nodes', async ({ page }) => {
  const state = await mockSmartImageNodes(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-image-nodes');
  await expect.poll(() => state.saves.some(save => save.nodes.find((node: any) => node.id === 'auto')?.images?.[0]?.url === '/assets/recovered.png')).toBe(true);
  await expect(page.locator('[data-node-id="auto"] .image-wrap img')).toHaveCount(1);
  const recover = page.locator('[data-node-id="recover"]');
  await expect(recover.locator('.image-task-pending-cell')).toContainText('任务未丢失');
  await expect(recover.locator('.image-task-pending-sub')).toContainText('upstream-42');
  await recover.locator('.image-task-pending-query').dispatchEvent('click');
  await expect.poll(() => state.saves.some(save => save.nodes.find((node: any) => node.id === 'recover')?.images?.[0]?.url === '/assets/manual-recovered.png')).toBe(true);
  await expect(recover.locator('.image-wrap img')).toHaveCount(1);
});
