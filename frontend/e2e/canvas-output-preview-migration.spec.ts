import { expect, test, type Page } from '@playwright/test';

type CanvasDocument = {
  connections: Array<Record<string, unknown>>;
  id: string;
  nodes: Array<Record<string, any>>;
  schemaVersion: number;
  title: string;
  updated_at: number;
};

async function prepare(page: Page) {
  let updatedAt = 1;
  let document: CanvasDocument = {
    id: 'output-preview-e2e', schemaVersion: 1, title: '输出预览迁移', updated_at: updatedAt,
    connections: [],
    nodes: [{
      id: 'output-1', type: 'output', x: 120, y: 120,
      imageComparisons: {
        '/static/images/logo.png?result=1': { name: 'input.png', url: '/static/images/logo.png?input=1' },
      },
      images: [
        {
          kind: 'image', name: 'result-1.png', runMs: 65_000, url: '/static/images/logo.png?result=1', viewed: false,
          run: {
            nodeType: 'generator', prompt: 'legacy output prompt', refs: [{ kind: 'image', name: 'input.png', url: '/static/images/logo.png?input=1' }],
            node: { apiProvider: 'mock', model: 'mock-model', type: 'generator' },
          },
        },
        { kind: 'image', name: 'result-2.png', url: '/static/images/logo.png?result=2', viewed: false },
      ],
    }],
  };
  const saves: CanvasDocument[] = [];
  await page.route('**/api/canvas-rollout/events', (route) => route.fulfill({ json: { accepted: true } }));
  await page.route('**/api/canvas-rollout', (route) => route.fulfill({ json: { version: 1, configured_percentage: 100, effective_percentage: 100, enabled: true, kill_switch: false, blocked_reasons: [] } }));
  await page.route('**/api/config', (route) => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', (route) => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', (route) => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/output-preview-e2e/lock', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/output-preview-e2e', async (route) => {
    if (route.request().method() === 'PUT') {
      updatedAt += 1;
      document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: updatedAt };
      saves.push(structuredClone(document));
    }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', (route) => route.fulfill({ json: { canvases: [{ id: document.id, title: document.title, kind: 'classic', updated_at: 1 }] } }));

  await page.goto('/static/canvas.html?canvas_v2_rollout=100');
  await page.locator('.canvas-item[data-canvas-id="output-preview-e2e"] .canvas-open').click();
  await expect(page.locator('[data-node-id="output-1"] .output-img-wrap')).toHaveCount(2);
  return { getDocument: () => document, saves };
}

async function openPreview(page: Page, index = 0) {
  const outputs = page.locator('[data-node-id="output-1"] .output-img-wrap img');
  await expect(outputs).toHaveCount(2);
  await outputs.nth(index).click();
  const lightbox = page.locator('.output-lightbox.open.canvas-v2-lightbox');
  await expect(lightbox).toBeVisible();
  return lightbox;
}

test('restores legacy output lightbox DOM, compare, prompt and zoom behavior', async ({ page }) => {
  const state = await prepare(page);
  const lightbox = await openPreview(page);
  const preview = lightbox.locator('.output-preview');
  await expect(page.locator('.shell > .output-lightbox.open.canvas-v2-lightbox')).toBeVisible();
  await expect(lightbox).toHaveCSS('z-index', '1100');
  await expect(lightbox.locator('.output-lightbox-shell')).toBeVisible();
  await expect(preview.locator('.output-single-img')).toBeVisible();
  await expect(lightbox.locator('.output-resolution')).toContainText('1m 05s');
  await expect(lightbox.locator('.output-prompt-panel.open')).toContainText('legacy output prompt');
  await expect(lightbox.getByRole('button', { name: '复制提示词' })).toBeVisible();
  await expect(lightbox.getByRole('button', { name: '再次运行' })).toBeVisible();

  await preview.dblclick();
  await expect(preview).toHaveClass(/\bcompare-mode\b/);
  await expect(preview.locator('.output-compare')).toBeVisible();
  const compare = preview.locator('.output-compare');
  const compareBox = await compare.boundingBox();
  if (!compareBox) throw new Error('compare preview is unavailable');
  await page.mouse.click(compareBox.x + compareBox.width * 0.7, compareBox.y + compareBox.height / 2);
  await expect(preview.locator('.output-compare-slider')).toHaveAttribute('style', /left: 70/);

  await preview.dblclick();
  await preview.hover();
  await page.mouse.wheel(0, -100);
  await expect(preview).toHaveAttribute('data-preview-zoom', '1.100');
  await expect.poll(() => state.getDocument().nodes.find((node) => node.id === 'output-1')?.images[0].viewed).toBe(true);

  await page.keyboard.press('ArrowRight');
  await expect(preview).toHaveAttribute('data-preview-url', '/static/images/logo.png?result=2');
  await expect.poll(() => state.getDocument().nodes.find((node) => node.id === 'output-1')?.images[1].viewed).toBe(true);
  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
  expect(state.saves.length).toBeGreaterThan(1);
});

test('recreates the legacy rerun nodes from output metadata', async ({ page }) => {
  const state = await prepare(page);
  const lightbox = await openPreview(page);
  await lightbox.getByRole('button', { name: '再次运行' }).click();
  await expect(lightbox).toBeHidden();
  await expect.poll(() => state.getDocument().nodes.filter((node) => node.type === 'generator').length).toBe(1);
  expect(state.getDocument().nodes.some((node) => node.type === 'prompt' && node.text === 'legacy output prompt')).toBe(true);
  expect(state.getDocument().nodes.some((node) => node.type === 'image' && node.url === '/static/images/logo.png?input=1')).toBe(true);
  expect(state.getDocument().connections.length).toBe(2);
});
