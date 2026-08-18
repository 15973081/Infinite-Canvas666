import { expect, test } from '@playwright/test';

test('GPT Chat runs as isolated React ChatStudio with streaming vision input', async ({ page }) => {
  let streamPayload: Record<string, unknown> | null = null;
  let deletedId = '';
  const emptyConversation = { id: 'conv-1', title: 'React migration', created_at: 1, updated_at: 1, messages: [] };
  const summary = { id: 'conv-1', title: 'React migration', created_at: 1, updated_at: 1, last_message: '' };
  await page.route('**/api/config', route => route.fulfill({ json: { chat_model: 'fallback', api_providers: [{ id: 'demo', name: 'Demo API', enabled: true, has_key: true, chat_models: ['demo-chat'] }] } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [summary] } }));
  await page.route('**/api/conversations/conv-1', async route => {
    if (route.request().method() === 'DELETE') { deletedId = 'conv-1'; await route.fulfill({ json: { ok: true } }); }
    else await route.fulfill({ json: { conversation: emptyConversation } });
  });
  await page.route('**/api/ai/upload', route => route.fulfill({ json: { files: [{ url: '/output/reference.png', name: 'reference.png', kind: 'image', mime: 'image/png' }] } }));
  await page.route('**/api/chat/stream', async route => {
    streamPayload = route.request().postDataJSON();
    const user = { id: 'u1', role: 'user', content: 'describe this', attachments: [{ url: '/output/reference.png', name: 'reference.png', kind: 'image', mime: 'image/png' }] };
    const assistant = { id: 'a1', role: 'assistant', content: 'A cinematic portrait.', model: 'demo-chat' };
    const conversation = { ...emptyConversation, messages: [user, assistant] };
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: [
      `data: ${JSON.stringify({ type: 'meta', conversation: { ...emptyConversation, messages: [user] } })}\n\n`,
      `data: ${JSON.stringify({ type: 'delta', delta: 'A cinematic ' })}\n\n`,
      `data: ${JSON.stringify({ type: 'delta', delta: 'portrait.' })}\n\n`,
      `data: ${JSON.stringify({ type: 'done', conversation, message: assistant })}\n\n`,
    ].join('') });
  });

  await page.goto('/static/gpt-chat.html');
  await expect(page.getByText('ChatStudio', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ inlineScripts: [...document.scripts].filter(script => !script.type.includes('module')).length, legacySend: typeof (window as typeof window & { sendMessage?: unknown }).sendMessage }))).toEqual({ inlineScripts: 0, legacySend: 'undefined' });
  await expect(page.getByLabel('对话平台')).toHaveValue('demo');
  await expect(page.getByLabel('对话模型')).toHaveValue('demo-chat');

  await page.locator('input[type=file]').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from('image') });
  await expect(page.getByAltText('reference.png')).toBeVisible();
  await page.getByLabel('消息').fill('describe this');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('A cinematic portrait.', { exact: true })).toBeVisible();
  await expect.poll(() => streamPayload).toMatchObject({ conversation_id: 'conv-1', message: 'describe this', provider: 'demo', model: 'demo-chat', mode: 'chat', reference_images: [{ url: '/output/reference.png', kind: 'image' }] });

  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('删除 React migration').click();
  await expect.poll(() => deletedId).toBe('conv-1');
});

test('ChatStudio exposes a retry path after an SSE failure', async ({ page }) => {
  let attempts = 0;
  const base = { id: 'retry-conv', title: 'Retry', created_at: 1, updated_at: 1, messages: [] };
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [{ id: 'demo', name: 'Demo', has_key: true, chat_models: ['chat'] }] } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [{ ...base, last_message: '' }] } }));
  await page.route('**/api/conversations/retry-conv', route => route.fulfill({ json: { conversation: base } }));
  await page.route('**/api/chat/stream', async route => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"error","detail":"temporary upstream failure"}\n\n' });
    const assistant = { id: 'done', role: 'assistant', content: 'Recovered reply', model: 'chat' };
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ type: 'done', conversation: { ...base, messages: [assistant] }, message: assistant })}\n\n` });
  });

  await page.goto('/static/gpt-chat.html');
  await page.getByLabel('消息').fill('retry me');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('temporary upstream failure');
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByText('Recovered reply', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
