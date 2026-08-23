import { expect, test } from '@playwright/test';

test('GPT Chat preserves the legacy DOM while streaming vision input through React', async ({ page }) => {
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
  await expect(page.locator('#chatStudioApp > .chat-shell')).toBeVisible();
  await expect(page.locator('.topbar > .topbar-inner .top-actions')).toBeVisible();
  await expect(page.locator('#messages.messages')).toBeVisible();
  await expect(page.locator('.composer-wrap > .composer > #composerBody.composer-body')).toBeVisible();
  expect(await page.evaluate(() => ({
    inlinePageScripts: [...document.scripts].filter(script => !script.src && !script.type.includes('module')).length,
    legacySend: typeof (window as typeof window & { sendMessage?: unknown }).sendMessage,
  }))).toEqual({ inlinePageScripts: 0, legacySend: 'undefined' });

  await page.locator('input[type=file]').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from('image') });
  await expect(page.locator('#refStrip .ref-chip img')).toBeVisible();
  await page.locator('#messageInput').fill('describe this');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('A cinematic portrait.', { exact: true })).toBeVisible();
  await expect.poll(() => streamPayload).toMatchObject({ conversation_id: 'conv-1', message: 'describe this', provider: 'demo', model: 'demo-chat', mode: 'chat', reference_images: [{ url: '/output/reference.png', kind: 'image' }] });

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '历史' }).click();
  await expect(page.locator('#historyPopover')).toHaveClass(/open/);
  await page.getByLabel('删除 React migration').click();
  await expect.poll(() => deletedId).toBe('conv-1');
});

test('GPT Chat restores legacy model picker, settings, paste, keyboard, and preview behavior', async ({ page }) => {
  let uploads = 0;
  let streamAttempts = 0;
  const imageAttachment = { url: '/output/history.png', name: 'history.png', kind: 'image', mime: 'image/png' };
  const conversation = { id: 'legacy-conv', title: 'Legacy chat', created_at: 1, updated_at: 1, messages: [{ id: 'a0', role: 'assistant', content: 'Existing image', attachments: [imageAttachment], model: 'second-chat' }] };
  await page.addInitScript(() => localStorage.setItem('gpt_chat_settings_v1', JSON.stringify({ provider: 'second', activeChatModel: 'second-chat', chatProviderModels: { second: 'second-chat' } })));
  await page.route('**/api/config', route => route.fulfill({ json: { api_providers: [
    { id: 'first', name: 'First API', has_key: true, chat_models: ['first-chat'] },
    { id: 'second', name: 'Second API', has_key: true, chat_models: ['second-chat'] },
  ] } }));
  await page.route('**/api/conversations', route => route.fulfill({ json: { conversations: [{ ...conversation, last_message: 'Existing image' }] } }));
  await page.route('**/api/conversations/legacy-conv', route => route.fulfill({ json: { conversation } }));
  await page.route('**/api/ai/upload', route => { uploads += 1; return route.fulfill({ json: { files: [{ url: `/output/paste-${uploads}.png`, name: `paste-${uploads}.png`, kind: 'image', mime: 'image/png' }] } }); });
  await page.route('**/api/chat/stream', route => {
    streamAttempts += 1;
    const assistant = { id: 'a1', role: 'assistant', content: 'Keyboard reply', model: 'second-chat' };
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ type: 'done', conversation: { ...conversation, messages: [...conversation.messages, assistant] }, message: assistant })}\n\n` });
  });

  await page.goto('/static/gpt-chat.html');
  await expect(page.locator('#modelPickerBtn')).toContainText('Second API');
  await expect(page.locator('#modelPickerBtn')).toContainText('second-chat');
  await page.locator('#modelPickerBtn').click();
  await expect(page.locator('body > #modelPickerPopover')).toHaveClass(/open/);
  expect(await page.evaluate(() => {
    const popover = document.querySelector('#modelPickerPopover');
    const button = document.querySelector('#modelPickerBtn');
    return Boolean(popover && button && popover.getBoundingClientRect().bottom <= button.getBoundingClientRect().top + 1);
  })).toBe(true);

  await page.locator('.thumb').click();
  await expect(page.locator('#imagePreviewModal')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#imagePreviewModal')).not.toHaveClass(/open/);

  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['paste'], 'paste.png', { type: 'image/png' }));
    const event = new Event('paste') as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    window.dispatchEvent(event);
  });
  await expect.poll(() => uploads).toBe(1);
  await expect(page.locator('#refStrip .ref-chip')).toHaveCount(1);

  await page.locator('#messageInput').fill('line 1\nline 2\nline 3\nline 4\nline 5\nline 6');
  expect(await page.locator('#messageInput').evaluate(element => Number.parseFloat((element as HTMLTextAreaElement).style.height))).toBeGreaterThan(96);
  await page.locator('#messageInput').press('Shift+Enter');
  expect(streamAttempts).toBe(0);
  await page.locator('#messageInput').press('Enter');
  await expect.poll(() => streamAttempts).toBe(1);
  await expect(page.getByText('Keyboard reply', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gpt_chat_settings_v1') || '{}'))).toMatchObject({ provider: 'second', activeChatModel: 'second-chat', modelPickerScope: 'chat' });
  await expect(page.locator('#imageControls')).toHaveClass(/hidden/);
  await expect(page.locator('[id^="chat-ratio-"]')).toHaveCount(7);
});
