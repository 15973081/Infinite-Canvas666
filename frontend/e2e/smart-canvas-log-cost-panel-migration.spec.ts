import { expect, test, type Page } from '@playwright/test';

async function mockLogCostPanel(page: Page) {
  const document = {
    id: 'smart-log-cost', kind: 'smart', schemaVersion: 1, title: 'Smart logs', updated_at: 1, connections: [],
    nodes: [{ id: 'image-node', type: 'smart-image', x: 200, y: 140, images: [{ url: '/image.png' }] }],
    logs: [
      { id: 'image-log', status: 'success', createdAt: 1_760_000_000_000, nodeId: 'image-node', platform: 'OpenAI', model: 'image-1', prompt: 'draw a cat', runMs: 1250, request: { provider_id: 'openai', task_id: 'task-image' }, outputs: ['/image.png'], cost: { status: 'priced', kind: 'image', source: 'actual', amount_micros: 1_250_000 } },
      { id: 'video-log', status: 'success', createdAt: 1_760_000_001_000, platform: 'Volcengine', model: 'video-1', prompt: 'move slowly', runMs: 65_000, outputs: [{ kind: 'video', url: '/video.mp4' }], cost: { status: 'priced', kind: 'video', source: 'estimated', amount_micros: 2_500_000 } },
      { id: 'unknown-log', status: 'success', createdAt: 1_760_000_002_000, platform: 'Custom', model: 'new-model', prompt: 'unknown price', runMs: 500, outputs: ['/unknown.png'] },
      { id: 'failed-log', status: 'failed', createdAt: 1_760_000_003_000, platform: 'ComfyUI', model: 'workflow', prompt: 'failed prompt', runMs: 300, outputs: [], error: 'Upstream rejected request: invalid mask dimensions' },
    ],
  };
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-log-cost/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-log-cost', route => route.fulfill({ json: { canvas: document } }));
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mP8z8AARMAgYKSBEwAA//8DAJ0CAQn7fksAAAAASUVORK5CYII=', 'base64');
  await page.route(/\/(image|unknown)\.png(?:\?.*)?$/, route => route.fulfill({ body: png, contentType: 'image/png' }));
}

test('migrates the cost dashboard totals, estimates and unknown-price state', async ({ page }) => {
  await mockLogCostPanel(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-log-cost');
  await expect(page.locator('#smartCostToggleLabel')).toHaveText('费用 ¥3.75');
  await expect(page.locator('#smartCostToggle')).toHaveAttribute('title', '费用仪表盘 · 1 笔待定价');
  await page.locator('#smartCostToggle').click();
  const panel = page.locator('#smartLogModal.open #smartLogPanel.cost-mode');
  await expect(panel).toBeVisible();
  await expect(panel.locator('#smartLogTitle')).toHaveText('费用仪表盘');
  await expect(panel.locator('#smartCostSummary')).toHaveText('总计 ¥3.75 · 已计费 2 次 · 待定价 1 笔');
  await expect(panel.locator('#smartCostTotal')).toHaveText('¥3.75');
  await expect(panel.locator('#smartCostImage')).toHaveText('¥1.25');
  await expect(panel.locator('#smartCostVideo')).toHaveText('¥2.50');
  await expect(panel.locator('#smartCostCalls')).toHaveText('2');
  await expect(panel.locator('#smartCostMeta')).toHaveText('含历史预估 ¥2.50');
  await expect(panel.locator('#smartCostUnknown')).toHaveText('待定价 1 笔');
});

test('renders legacy log cards, unknown cost chip and full failed error detail', async ({ page }) => {
  await mockLogCostPanel(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-log-cost');
  await page.locator('#smartLogToggle').click();
  const panel = page.locator('#smartLogModal.open #smartLogPanel:not(.cost-mode)');
  await expect(panel.locator('#smartLogList .log-item')).toHaveCount(4);
  await expect(panel.locator('[data-log-id="image-log"] .log-meta')).toContainText('¥1.25');
  await expect(panel.locator('[data-log-id="image-log"] .log-subline')).toContainText('ID task-image');
  await expect(panel.locator('[data-log-id="video-log"] .cost-estimated')).toHaveText('¥2.50 预估');
  await expect(panel.locator('[data-log-id="video-log"] .log-thumbs video')).toHaveAttribute('src', '/video.mp4');
  await expect(panel.locator('[data-log-id="unknown-log"] .cost-unknown')).toHaveText('待定价');
  const failed = panel.locator('[data-log-id="failed-log"].failed');
  await expect(failed.locator('.status-failed')).toHaveText('失败');
  await expect(failed.locator('.log-error')).toHaveText('Upstream rejected request: invalid mask dimensions');
  await expect(failed.locator('.log-error')).toHaveAttribute('title', 'Upstream rejected request: invalid mask dimensions');
});
