import { expect, test, type Locator, type Page } from '@playwright/test';

async function openRenderer(page: Page, renderer: 'native' | 'xyflow') {
  await page.goto(`/static/canvas-board-spike.html?renderer=${renderer}`);
  const root = page.locator('#canvasBoardSpike');
  await expect(root).toHaveAttribute('data-ready', 'true');
  await expect(root).toHaveAttribute('data-nodes', '200');
  await expect(root).toHaveAttribute('data-edges', '300');
  return root;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function hitPoint(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    for (let y = Math.ceil(box.top); y < Math.floor(box.bottom); y += 1) {
      for (let x = Math.ceil(box.left); x < Math.floor(box.right); x += 1) {
        if (document.elementFromPoint(x, y) === element) return { x, y };
      }
    }
    throw new Error('Element has no clickable point');
  });
}

for (const renderer of ['native', 'xyflow'] as const) {
  test(`${renderer} renderer handles the 200-node/300-edge spike`, async ({ page }) => {
    const root = await openRenderer(page, renderer);
    const nodes = page.locator(renderer === 'native' ? '[data-spike-node]' : '.react-flow__node');
    const visibleNodes = await nodes.evaluateAll((items) => items.map((item, index) => {
      const box = item.getBoundingClientRect();
      return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
        ? { id: item.getAttribute('data-id') ?? '', index }
        : null;
    }).filter((item): item is { id: string; index: number } => item !== null));
    expect(visibleNodes.length).toBeGreaterThan(2);
    const sourceInfo = visibleNodes[0];
    const existingTargetId = `node-${(Number(sourceInfo.id.slice(5)) * 7 + 1) % 200}`;
    const targetInfo = visibleNodes.find((item) => item.id !== sourceInfo.id && item.id !== existingTargetId);
    if (!targetInfo) throw new Error('No unused visible connection target');
    const node = nodes.nth(sourceInfo.index);
    const targetNode = nodes.nth(targetInfo.index);
    await node.click();
    await expect(node).toHaveClass(/selected/);
    const before = await node.boundingBox();
    if (!before) throw new Error('Spike node is not visible');
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 50, before.y + before.height / 2 + 50, { steps: 4 });
    await page.mouse.up();
    const after = await node.boundingBox();
    expect(after?.x).not.toBe(before.x);

    const edges = page.locator(renderer === 'native' ? '[data-spike-edge]' : '.react-flow__edge');
    const edgeCount = await edges.count();
    const sourceHandle = node.locator(renderer === 'native' ? '[data-port="out"]' : '.react-flow__handle.source');
    const targetHandle = targetNode.locator(renderer === 'native' ? '[data-port="in"]' : '.react-flow__handle.target');
    expect(await sourceHandle.count()).toBe(1);
    expect(await targetHandle.count()).toBe(1);
    const sourcePoint = await hitPoint(sourceHandle);
    if (renderer === 'native') {
      await hitPoint(targetHandle);
      await sourceHandle.dispatchEvent('mousedown', { bubbles: true, button: 0, buttons: 1 });
      await targetHandle.dispatchEvent('mouseup', { bubbles: true, button: 0, buttons: 0 });
      await expect.poll(() => edges.count()).toBe(edgeCount + 1);

      const board = page.getByTestId('native-board');
      await board.dispatchEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: 5, clientY: 5, pointerId: 2, shiftKey: true });
      await board.dispatchEvent('pointermove', { bubbles: true, buttons: 1, clientX: 500, clientY: 200, pointerId: 2, shiftKey: true });
      await expect(page.locator('[data-spike-selection-box]')).toHaveCount(1);
      await board.dispatchEvent('pointerup', { bubbles: true, button: 0, buttons: 0, clientX: 500, clientY: 200, pointerId: 2, shiftKey: true });
      await expect.poll(() => page.locator('[data-spike-node].selected').count()).toBeGreaterThan(1);
    } else {
      const targetHitTestable = await targetHandle.evaluate((element) => {
        const box = element.getBoundingClientRect();
        for (let y = Math.ceil(box.top); y < Math.floor(box.bottom); y += 1) {
          for (let x = Math.ceil(box.left); x < Math.floor(box.right); x += 1) {
            if (document.elementFromPoint(x, y) === element) return true;
          }
        }
        return false;
      });
      expect(targetHitTestable).toBe(false);
      console.log('[renderer-spike] xyflow blocker: target Handle is not hit-testable in the fitted mixed-node board');
    }

    await page.locator('.spike-board').hover();
    await page.mouse.wheel(0, -100);
    await expect(root).toHaveAttribute('data-renderer', renderer);
    await expect(page.locator('.spike-title[data-kind="group"]')).toHaveCount(20);
    await expect(page.locator('.spike-title[data-kind="output"]')).toHaveCount(20);
    const mediaPreserved = await page.evaluate(() => {
      const media = document.querySelector('[data-spike-media]');
      (window as typeof window & { CanvasRendererSpike: { sample(count: number): number[] } }).CanvasRendererSpike.sample(1);
      return media !== null && media === document.querySelector('[data-spike-media]');
    });
    expect(mediaPreserved).toBe(true);
    const samples = await page.evaluate(() => (window as typeof window & {
      CanvasRendererSpike: { sample(): number[] };
    }).CanvasRendererSpike.sample());
    console.log(`[renderer-spike] ${renderer} median render: ${median(samples).toFixed(2)} ms`);
    await page.evaluate(() => (window as typeof window & {
      CanvasRendererSpike: { destroy(): void };
    }).CanvasRendererSpike.destroy());
    await expect(root.locator('.spike-board')).toHaveCount(0);
  });
}

test('legacy renderer establishes the 200-node/300-edge baseline', async ({ page }) => {
  const kinds = ['prompt', 'promptGroup', 'loop', 'generator', 'output', 'video', 'comfy', 'llm', 'group', 'ltxDirector'];
  const nodes = Array.from({ length: 200 }, (_, index) => ({
    id: `node-${index}`,
    type: kinds[index % kinds.length],
    title: kinds[index % kinds.length],
    x: (index % 20) * 320,
    y: Math.floor(index / 20) * 220,
    items: [],
    images: [],
    text: `Node ${index}`,
  }));
  const sources = nodes.filter((node) => ['prompt', 'promptGroup', 'loop', 'llm', 'group'].includes(node.type));
  const targets = nodes.filter((node) => node.type === 'generator');
  const connections = Array.from({ length: 300 }, (_, index) => ({
    id: `edge-${index}`,
    from: sources[index % sources.length].id,
    to: targets[(index * 7 + Math.floor(index / sources.length)) % targets.length].id,
  }));
  const canvas = { id: 'renderer-benchmark', kind: 'classic', title: 'Renderer benchmark', nodes, connections, updated_at: 1 };

  await page.route('**/api/canvas-folders**', (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/trash')) return route.fulfill({ json: { canvases: [] } });
    if (path.endsWith('/touch') || path.endsWith('/meta')) return route.fulfill({ json: { canvas } });
    if (path.endsWith('/lock')) return route.fulfill({ json: { locked: false } });
    if (path === '/api/canvases') return route.fulfill({ json: { canvases: [canvas] } });
    return route.fulfill({ json: { canvas } });
  });
  await page.goto('/static/canvas.html?canvas_v2=0');
  await page.getByRole('button', { name: /^Renderer benchmark / }).click();
  await expect(page.locator('#nodes .node')).toHaveCount(200);
  await expect(page.locator('#links .link')).toHaveCount(300);
  const samples = await page.evaluate(() => Array.from({ length: 7 }, () => {
    const start = performance.now();
    (window as typeof window & { render(): void }).render();
    return performance.now() - start;
  }));
  console.log(`[renderer-spike] legacy median render: ${median(samples).toFixed(2)} ms`);
});
