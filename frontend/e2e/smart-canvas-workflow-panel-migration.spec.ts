import { expect, test, type Page } from '@playwright/test';

async function mockWorkflowPanel(page: Page) {
  let document: Record<string, any> = {
    id: 'smart-workflow-panel', kind: 'smart', schemaVersion: 1, title: 'Workflow Canvas', updated_at: 1, connections: [],
    nodes: [{ id: 'result', type: 'smart-image', title: 'Result Group', x: 220, y: 160, images: [{ name: 'result.png', url: '/result.png', kind: 'image' }] }],
  };
  const exports: Array<Record<string, any>> = [];
  const groupExports: Array<Record<string, any>> = [];
  const imports: Array<{ contentType: string; data: string }> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-workflow-panel/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-workflow-panel', async route => {
    if (route.request().method() !== 'GET') document = { ...document, ...(route.request().postDataJSON() as Record<string, unknown>), updated_at: Number(document.updated_at) + 1 };
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  await page.route('**/api/asset-library', route => route.fulfill({ json: { library: { active_library_id: '', libraries: [] } } }));
  await page.route('**/api/canvas-workflows/export', async route => {
    exports.push(route.request().postDataJSON());
    await route.fulfill({ body: 'zip', contentType: 'application/zip', headers: { 'Content-Disposition': 'attachment; filename="workflow.zip"' } });
  });
  await page.route('**/api/canvas-workflows/import', async route => {
    imports.push({ contentType: route.request().headers()['content-type'] || '', data: route.request().postDataBuffer()?.toString() || '' });
    await route.fulfill({ json: { format: 'infinite-smart-canvas-workflow', nodes: [{ id: 'imported', type: 'prompt', text: 'imported prompt', x: 20, y: 20 }], connections: [] } });
  });
  await page.route('**/api/smart-canvas/group-export', async route => {
    groupExports.push(route.request().postDataJSON());
    await route.fulfill({ json: { count: 1, folder: 'D:/exports' } });
  });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mP8z8AARMAgYKSBEwAA//8DAJ0CAQn7fksAAAAASUVORK5CYII=', 'base64');
  await page.route('**/result.png', route => route.fulfill({ body: png, contentType: 'image/png' }));
  return { document: () => document, exports, groupExports, imports };
}

async function selectAndOpen(page: Page) {
  const node = page.locator('[data-node-type="smart-image"][data-node-id="result"]');
  await expect.poll(async () => {
    const value = await node.getAttribute('class');
    if (!value?.includes('selected')) await node.dispatchEvent('click');
    return await node.getAttribute('class');
  }).toContain('selected');
  await page.locator('#smartWorkflowToggle').click();
  const panel = page.locator('#smartWorkflowTransferModal.workflow-transfer-panel.open');
  await expect(panel).toBeVisible();
  await expect(panel.locator('#smartWorkflowExportMeta')).toContainText('已选择 1 个节点，0 条连线');
  return panel;
}

test('migrates the original workflow panel DOM and preserves JSON/ZIP and batch export payloads', async ({ page }) => {
  const state = await mockWorkflowPanel(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-workflow-panel');
  const panel = await selectAndOpen(page);
  await expect(panel.locator('#smartWorkflowTransferSub')).toContainText('导出当前选中内容');
  await expect(panel.locator('#smartWorkflowImportDropZone.workflow-import-drop')).toBeVisible();

  const jsonDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出 JSON' }).click();
  await expect((await jsonDownload).suggestedFilename()).toMatch(/^Workflow-Canvas-workflow-\d{14}\.json$/);

  const zipDownload = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出并包含资源' }).click();
  await expect(await zipDownload).toBeTruthy();
  await expect.poll(() => state.exports).toHaveLength(1);
  expect(state.exports[0]).toMatchObject({
    format: 'infinite-smart-canvas-workflow', version: 1, canvas_type: 'smart', include_resources: true,
    nodes: [{ id: 'result', type: 'smart-image', running: false, pending: 0, queued: false, title: 'Result Group', x: 220, y: 160, images: [{ name: 'result.png', url: '/result.png', kind: 'image' }] }],
    connections: [],
  });
  expect(state.exports[0].nodes[0].pendingTasks).toBeUndefined();
  await expect(panel.locator('#smartWorkflowExportMeta')).toHaveClass(/success/);

  page.once('dialog', dialog => void dialog.accept('D:/exports'));
  await panel.getByRole('button', { name: '批量导出选区结果' }).click();
  await expect.poll(() => state.groupExports).toHaveLength(1);
  expect(state.groupExports[0]).toEqual({ folder: 'D:/exports', group_name: 'Workflow Canvas', items: [{ kind: 'image', name: 'result.png', url: '/result.png' }] });
});

test('imports JSON/ZIP through the workflow API and appends normalized nodes', async ({ page }) => {
  const state = await mockWorkflowPanel(page);
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-workflow-panel');
  const panel = await selectAndOpen(page);
  await panel.locator('#smartWorkflowImportInput').setInputFiles({ name: 'workflow.json', mimeType: 'application/json', buffer: Buffer.from('{"nodes":[]}') });
  await expect.poll(() => state.imports).toHaveLength(1);
  expect(state.imports[0].contentType).toContain('multipart/form-data');
  expect(state.imports[0].data).toContain('workflow.json');
  await expect(panel).toHaveCount(0);
  await expect.poll(() => state.document().nodes.length).toBe(2);
  expect(state.document().nodes.some((node: Record<string, unknown>) => node.type === 'prompt' && node.text === 'imported prompt')).toBe(true);
});
