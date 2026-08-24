import { expect, test, type Page, type Route } from '@playwright/test';

function promptState() {
  return {
    active_library_id: 'system',
    libraries: [{
      id: 'system', name: '系统提示词库', readonly: false,
      categories: [{ id: 'view', name: '视角' }, { id: 'storyboard', name: '分镜' }],
      items: [
        { id: 'tpl-view', name: '低机位镜头', category: 'view', scene: '建筑外景', positive: '电影感低机位', negative: '模糊', params: { ratio: '16:9' } },
        { id: 'tpl-story', name: '三镜头分镜', category: 'storyboard', scene: '叙事分镜', positive: '远景，中景，特写', negative: '' },
      ],
    }],
  };
}

async function mockSmartCanvasPromptTemplate(page: Page) {
  let document: Record<string, any> = { id: 'smart-template', kind: 'smart', schemaVersion: 1, title: 'Smart template', updated_at: 1, connections: [], nodes: [{ id: 'prompt-1', type: 'prompt', x: 120, y: 100, text: '当前节点提示词' }] };
  const library = promptState();
  const promptRequests: Array<{ method: string; path: string; body: any }> = [];
  const saves: Array<Record<string, any>> = [];
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [] } }));
  await page.route('**/api/workflows', route => route.fulfill({ json: { workflows: [] } }));
  await page.route('**/api/canvas-folders', route => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/canvases/trash', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/canvases/smart-template/lock', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/canvases/smart-template', async route => {
    if (route.request().method() !== 'GET') { document = { ...document, ...JSON.parse(route.request().postData() || '{}'), updated_at: saves.length + 2 }; saves.push(structuredClone(document)); }
    await route.fulfill({ json: { canvas: document } });
  });
  await page.route('**/api/canvases', route => route.fulfill({ json: { canvases: [] } }));
  await page.route('**/api/prompt-libraries**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postDataJSON?.() || {};
    promptRequests.push({ method, path: url.pathname, body });
    const active = library.libraries[0];
    let item;
    let category;
    if (method === 'PATCH' && url.pathname.includes('/items/')) {
      item = active.items.find(entry => entry.id === url.pathname.split('/').pop());
      Object.assign(item!, body);
    } else if (method === 'POST' && url.pathname.endsWith('/items')) {
      item = { id: `tpl-${active.items.length + 1}`, ...body };
      active.items.push(item as any);
    } else if (method === 'POST' && url.pathname.endsWith('/items/delete')) {
      active.items = active.items.filter(entry => !body.ids.includes(entry.id));
    } else if (method === 'POST' && url.pathname.endsWith('/categories')) {
      category = { id: `cat-${active.categories.length + 1}`, name: body.name };
      active.categories.push(category);
    } else if (method === 'PATCH' && url.pathname.includes('/categories/')) {
      category = active.categories.find(entry => entry.id === url.pathname.split('/').pop());
      Object.assign(category!, { name: body.name });
    } else if (method === 'DELETE' && url.pathname.includes('/categories/')) {
      const id = url.pathname.split('/').pop();
      active.categories = active.categories.filter(entry => entry.id !== id);
    }
    await route.fulfill({ json: { category, item, library } });
  });
  return { promptRequests, saves };
}

async function openTemplatePanel(page: Page) {
  await page.goto('/static/smart-canvas.html?smart_canvas_react=1&id=smart-template');
  const prompt = page.locator('[data-node-id="prompt-1"]');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: '模板' }).click();
  const panel = page.locator('#promptTemplatePanel.prompt-template-panel.open');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-target', 'node');
  return panel;
}

test('mounts the original template library DOM and filters by group and search', async ({ page }) => {
  await mockSmartCanvasPromptTemplate(page);
  const panel = await openTemplatePanel(page);
  await expect(panel.locator('#promptTemplateLibrarySelect.prompt-template-library-select')).toHaveValue('system');
  await expect(panel.locator('#promptTemplateCats .prompt-template-tabs')).toBeVisible();
  await expect(panel.locator('#promptTemplateBody .prompt-template-list')).toBeVisible();
  await expect(panel.locator('.prompt-template-card')).toHaveCount(2);
  await panel.locator('#promptTemplateSearch').fill('分镜');
  await expect(panel.locator('.prompt-template-card')).toHaveCount(1);
  await expect(panel.locator('.prompt-template-card')).toContainText('三镜头分镜');
  await panel.locator('#promptTemplateSearch').fill('');
  await panel.locator('.prompt-template-tabs button').filter({ hasText: '视角' }).click();
  await expect(panel.locator('.prompt-template-card')).toHaveCount(1);
  await expect(panel.locator('.prompt-template-card')).toContainText('低机位镜头');
});

test('edits a template and manages groups through prompt-library APIs', async ({ page }) => {
  const state = await mockSmartCanvasPromptTemplate(page);
  const panel = await openTemplatePanel(page);
  await panel.getByTitle('编辑模板').click();
  await panel.locator('[data-template-edit-name]').fill('更新后的镜头');
  await panel.locator('[data-template-edit-category]').selectOption('storyboard');
  await panel.locator('[data-template-edit-text]').fill('更新后的提示词');
  await panel.locator('.prompt-template-actions .primary').click();
  await expect(panel.locator('.prompt-template-detail-head')).toContainText('更新后的镜头');
  await expect.poll(() => state.promptRequests.some(request => request.method === 'PATCH' && request.path.endsWith('/items/tpl-view') && request.body.positive === '更新后的提示词')).toBe(true);

  await panel.locator('.prompt-template-manage-groups').click();
  page.once('dialog', dialog => dialog.accept('动作设计'));
  await panel.locator('.prompt-template-group-tools button').filter({ hasText: '新增' }).click();
  await expect(panel.locator('.prompt-template-group-list')).toContainText('动作设计');
  await expect.poll(() => state.promptRequests.some(request => request.method === 'POST' && request.path.endsWith('/categories') && request.body.name === '动作设计')).toBe(true);
});

test('applies full builtin text to the target prompt node', async ({ page }) => {
  const state = await mockSmartCanvasPromptTemplate(page);
  const panel = await openTemplatePanel(page);
  await panel.getByRole('button', { name: '完整应用' }).click();
  await expect(panel).toBeHidden();
  await expect.poll(() => state.saves.at(-1)?.nodes[0]?.text).toBe('电影感低机位\n\nNegative prompt:\n模糊\n\nParams:\nratio: 16:9');
  await expect.poll(() => state.saves.at(-1)?.nodes[0]?.promptPresetId).toBe('');
});
