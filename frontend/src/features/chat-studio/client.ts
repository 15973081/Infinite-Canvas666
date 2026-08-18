import { jsonRequest, requestJson } from '../../shared/http';
import { parseSseBuffer } from './domain';
import type { ChatAttachment, ChatConfig, ChatRequest, ChatStreamEvent, Conversation, ConversationSummary } from './types';

const userHeaders = (userId: string) => ({ 'X-User-ID': userId });

export const chatClient = {
  config: () => requestJson<ChatConfig>('/api/config'),
  list: (userId: string) => requestJson<{ conversations: ConversationSummary[] }>('/api/conversations', { headers: userHeaders(userId) }),
  create: (userId: string, title = '新对话') => requestJson<{ conversation: Conversation }>('/api/conversations', { ...jsonRequest('POST', { title }), headers: { ...jsonRequest('POST', {}).headers, ...userHeaders(userId) } }),
  get: (userId: string, id: string) => requestJson<{ conversation: Conversation }>(`/api/conversations/${encodeURIComponent(id)}`, { headers: userHeaders(userId) }),
  remove: (userId: string, id: string) => requestJson<{ ok: boolean }>(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: userHeaders(userId) }),
  upload: async (files: File[]) => { const body = new FormData(); files.slice(0, 4).forEach(file => body.append('files', file)); return requestJson<{ files: ChatAttachment[] }>('/api/ai/upload', { method: 'POST', body }); },
  stream: async (userId: string, payload: ChatRequest, signal: AbortSignal, onEvent: (event: ChatStreamEvent) => void) => {
    const response = await fetch('/api/chat/stream', { ...jsonRequest('POST', payload), headers: { ...jsonRequest('POST', {}).headers, ...userHeaders(userId) }, signal });
    if (!response.ok) { const body = await response.json().catch(() => ({})) as { detail?: string }; throw new Error(body.detail || `请求失败 (${response.status})`); }
    if (!response.body) throw new Error('浏览器不支持流式响应');
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parsed = parseSseBuffer(buffer); buffer = parsed.rest;
      for (const event of parsed.events) onEvent(event as ChatStreamEvent);
      if (done) break;
    }
    if (buffer.trim()) { const parsed = parseSseBuffer(`${buffer}\n\n`); for (const event of parsed.events) onEvent(event as ChatStreamEvent); }
  },
};

