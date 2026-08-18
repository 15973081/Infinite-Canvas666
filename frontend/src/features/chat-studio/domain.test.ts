import { describe, expect, it } from 'vitest';
import { availableProviders, filterConversations, isImageAttachment, parseSseBuffer } from './domain';

describe('chat studio domain', () => {
  it('normalizes configured providers and falls back to config models', () => {
    expect(availableProviders({ chat_models: ['gpt-a', 'gpt-a'] })[0].chat_models).toEqual(['gpt-a']);
    expect(availableProviders({ api_providers: [{ id: 'off', name: 'Off', enabled: false, chat_models: ['x'] }], chat_model: 'fallback' })[0].chat_models).toEqual(['fallback']);
  });

  it('parses complete SSE frames and retains partial data', () => {
    const parsed = parseSseBuffer('data: {"type":"delta","delta":"Hi"}\n\ndata: {"type":"done"');
    expect(parsed.events).toEqual([{ type: 'delta', delta: 'Hi' }]);
    expect(parsed.rest).toContain('done');
  });

  it('recognizes visual inputs and filters conversation text', () => {
    expect(isImageAttachment({ url: '/a.webp', name: 'a', kind: 'file' })).toBe(true);
    expect(filterConversations([{ id: '1', title: 'Project', last_message: 'hello', created_at: 0, updated_at: 0 }], 'HELLO')).toHaveLength(1);
  });
});

