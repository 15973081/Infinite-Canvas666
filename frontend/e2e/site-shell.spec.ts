import { expect, test } from '@playwright/test';

test('homepage runs as React SiteShell with lazy routes, broadcasts and updater contracts', async ({ page }) => {
  let updatePayload: Record<string, unknown> | null = null;
  const childHtml = '<!doctype html><html><body><h1>Child</h1><script>window.messages=[];addEventListener("message",e=>window.messages.push(e.data))<\/script></body></html>';
  for (const name of ['zimage','enhance','klein','angle','online','gpt-chat','canvas','asset-manager','api-settings','comfyui-settings']) {
    await page.route(`**/static/${name}.html`, route => route.fulfill({ contentType: 'text/html', body: childHtml }));
  }
  await page.route('**/api/app-info', route => route.fulfill({ json: { version: '1.0.0', repo_url: 'https://example.test/repo' } }));
  await page.route('**/api/check-update', route => route.fulfill({ json: { current: '1.0.0', update_available: true, reachable: true, latest: { source: 'modelscope', version: '1.1.0' }, update_notes: { items: ['React shell'] } } }));
  await page.route('**/api/queue_status?**', route => route.fulfill({ json: { total: 2, position: 1 } }));
  await page.route('**/api/update-backups', route => route.fulfill({ json: { backups: [{ name: 'backup-1' }] } }));
  await page.route('**/api/update-connectivity', route => route.fulfill({ json: { ok: true, sources: { github: { ok: true }, modelscope: { ok: true } }, results: [{ name: 'GitHub 版本文件', ok: true, source: 'github', status: 200, elapsed_ms: 20 }] } }));
  await page.route('**/api/update-from-github', async route => { updatePayload = route.request().postDataJSON(); await route.fulfill({ json: { ok: true, source: 'modelscope', count: 12, version: '1.1.0', restart_required: true } }); });

  await page.goto('/static/index.html');
  await expect(page.getByRole('button', { name: '在线生图' })).toHaveClass(/active/);
  await expect(page.locator('link[href*="/static/dist/site-shared-style.css"]')).toHaveCount(1);
  await expect(page.locator('link[href*="/static/css/"]')).toHaveCount(0);
  expect(await page.evaluate(() => ({ legacy: typeof (window as typeof window & { switchUI?: unknown }).switchUI, inline: [...document.scripts].filter(script => !script.type.includes('module')).length }))).toEqual({ legacy: 'undefined', inline: 0 });
  await expect(page.locator('.shell-content iframe')).toHaveCount(1);
  await expect(page.locator('.shell-content iframe')).toHaveAttribute('src', '/static/online.html');

  const sidebar = page.locator('.shell-sidebar');
  await expect(sidebar).toHaveCSS('width', '80px');
  await sidebar.hover();
  await expect(sidebar).toHaveCSS('width', '220px');
  await expect(page.getByRole('button', { name: 'GPT 对话' }).locator('.nav-text')).toHaveCSS('opacity', '1');
  await expect(page.locator('.shell-logo')).toHaveCSS('border-radius', '50%');
  await page.getByTitle('固定导航栏').click();
  expect(await page.evaluate(() => localStorage.getItem('studio_sidebar_pinned'))).toBe('1');
  await page.locator('.shell-content').hover({ position: { x: 300, y: 100 } });
  await expect(sidebar).toHaveCSS('width', '220px');
  await page.getByRole('button', { name: '更多设置' }).click();
  await expect(page.getByRole('button', { name: '工作流设置' })).toBeVisible();

  await page.getByRole('button', { name: '无限画布' }).click();
  await expect(page).toHaveURL(/#\/canvas$/);
  await expect(page.locator('.shell-content iframe')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('studio_active_page'))).toBe('canvas');
  const canvasFrame = page.frameLocator('iframe[title="无限画布"]');
  await expect.poll(() => canvasFrame.locator('body').evaluate(() => (window as typeof window & { messages: Array<{ type?: string }> }).messages.some(message => message.type === 'canvas-focus'))).toBe(true);

  await page.getByRole('button', { name: '切换主题' }).click();
  await expect.poll(() => canvasFrame.locator('body').evaluate(() => (window as typeof window & { messages: Array<{ type?: string; theme?: string }> }).messages.some(message => message.type === 'studio-theme' && message.theme === 'dark'))).toBe(true);
  await page.evaluate(() => { const channel = new BroadcastChannel('studio-api'); channel.postMessage({ type: 'providers-changed' }); channel.close(); });
  await expect.poll(() => canvasFrame.locator('body').evaluate(() => (window as typeof window & { messages: Array<{ type?: string }> }).messages.some(message => message.type === 'providers-changed'))).toBe(true);

  await page.getByTitle('更新中心').click();
  await expect(page.getByText('1.0.0 → 1.1.0')).toBeVisible();
  await page.getByRole('button', { name: '检测网络' }).click();
  await expect(page.getByText('连接正常')).toHaveCount(2);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '立即更新' }).click();
  await expect.poll(() => updatePayload).toMatchObject({ source: 'modelscope', fallback: true, auto_restart: false });
  await expect(page.getByText(/12 个文件/)).toBeVisible();
});
