import { expect, test } from '@playwright/test';

test('homepage runs as React SiteShell with lazy routes, broadcasts and updater contracts', async ({ page }) => {
  let updatePayload: Record<string, unknown> | null = null;
  const childHtml = '<!doctype html><html><body><h1>Child</h1><script>window.messages=[];addEventListener("message",e=>window.messages.push(e.data))<\/script></body></html>';
  for (const name of ['online','gpt-chat','canvas','asset-manager','api-settings','comfyui-settings']) {
    await page.route(`**/static/${name}.html`, route => route.fulfill({ contentType: 'text/html', body: childHtml }));
  }
  await page.route('**/api/app-info', route => route.fulfill({ json: { version: '1.0.0', repo_url: 'https://example.test/repo' } }));
  await page.route('**/api/check-update', route => route.fulfill({ json: { current: '1.0.0', update_available: true, reachable: true, latest: { source: 'modelscope', version: '1.1.0' }, update_notes: { items: ['React shell'] } } }));
  await page.route('**/api/queue_status?**', route => route.fulfill({ json: { total: 2, position: 1 } }));
  await page.route('**/api/update-backups', route => route.fulfill({ json: { backups: [{ name: 'backup-1' }] } }));
  await page.route('**/api/update-connectivity', route => route.fulfill({ json: { ok: true, sources: { github: { ok: true }, modelscope: { ok: true } }, results: [{ name: 'GitHub 版本文件', ok: true, source: 'github', status: 200, elapsed_ms: 20 }] } }));
  await page.route('**/api/update-connectivity/probe?**', route => {
    const name = new URL(route.request().url()).searchParams.get('name') || '检测节点';
    const source = name.startsWith('ModelScope') ? 'modelscope' : name.startsWith('Google') ? 'reference' : 'github';
    route.fulfill({ json: { name, source, required: name.includes('更新列表') || name.includes('版本文件'), ok: true, status: 200, elapsed_ms: source === 'modelscope' ? 10 : 20 } });
  });
  await page.route('**/api/update-from-github', async route => { updatePayload = route.request().postDataJSON(); await route.fulfill({ json: { ok: true, source: 'modelscope', count: 12, version: '1.1.0', restart_required: true } }); });

  await page.goto('/static/index.html');
  await expect(page.getByRole('button', { name: '在线生图' })).toHaveClass(/active/);
  expect(await page.evaluate(() => typeof (window as typeof window & { switchUI?: unknown }).switchUI)).toBe('undefined');
  await expect(page.locator('.stage iframe')).toHaveCount(6);
  await expect(page.locator('.stage iframe.active')).toHaveAttribute('src', '/static/online.html');
  await expect(page.locator('iframe[title="文生图"],iframe[title="细节增强"],iframe[title="图片编辑"],iframe[title="角度控制"]')).toHaveCount(0);

  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveCSS('width', '80px');
  await sidebar.hover();
  await expect(sidebar).toHaveCSS('width', '220px');
  await expect(page.getByRole('button', { name: 'GPT 对话' }).locator('.nav-text')).toHaveCSS('opacity', '1');
  await expect(page.locator('.logo-ring')).toHaveCSS('border-radius', '50%');
  await page.getByTitle('固定导航栏').click();
  expect(await page.evaluate(() => localStorage.getItem('studio_sidebar_pinned'))).toBe('1');
  await page.locator('.stage').hover({ position: { x: 300, y: 100 } });
  await expect(sidebar).toHaveCSS('width', '220px');
  await page.getByRole('button', { name: '更多设置' }).click();
  await expect(page.getByRole('button', { name: '工作流设置' })).toBeVisible();

  await page.getByRole('button', { name: '无限画布' }).click();
  await expect(page).toHaveURL(/#\/canvas$/);
  await expect(page.locator('.stage iframe')).toHaveCount(6);
  expect(await page.evaluate(() => localStorage.getItem('studio_active_page'))).toBe('canvas');
  const canvasFrame = page.frameLocator('iframe[title="无限画布"]');
  await expect.poll(() => canvasFrame.locator('body').evaluate(() => (window as typeof window & { messages: Array<{ type?: string }> }).messages.some(message => message.type === 'canvas-focus'))).toBe(true);

  await page.getByRole('button', { name: '切换主题' }).click();
  await expect.poll(() => canvasFrame.locator('body').evaluate(() => (window as typeof window & { messages: Array<{ type?: string; theme?: string }> }).messages.some(message => message.type === 'studio-theme' && message.theme === 'dark'))).toBe(true);
  await page.evaluate(() => { const channel = new BroadcastChannel('studio-api'); channel.postMessage({ type: 'providers-changed' }); channel.close(); });
  await expect.poll(() => canvasFrame.locator('body').evaluate(() => (window as typeof window & { messages: Array<{ type?: string }> }).messages.some(message => message.type === 'providers-changed'))).toBe(true);

  await page.getByTitle('一键更新').click();
  await expect(page.getByRole('heading', { name: '更新到 v1.1.0' })).toBeVisible();
  await expect(page.getByText(/当前 v1\.0\.0，最新 v1\.1\.0/)).toBeVisible();
  await page.getByRole('button', { name: '测试连通性' }).click();
  await expect(page.getByText('可用', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '开始更新' }).click();
  await expect.poll(() => updatePayload).toMatchObject({ source: 'modelscope', fallback: true, auto_restart: true, restart_delay: 3 });
  await expect(page.getByText(/12 个文件/)).toBeVisible();
});
