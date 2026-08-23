import type { ChatAttachment, ChatConfig, ChatProvider, ConversationSummary } from './types';

export const CHAT_SETTINGS_KEY = 'gpt_chat_settings_v1';
export const CHAT_SETTINGS_V2_KEY = 'gpt_chat_settings_v2';
export const CHAT_LAST_CONVERSATION_KEY = 'gpt_chat_last_conversation_v1';
export const CHAT_USER_KEY = 'gpt_chat_browser_user';

export function uniqueModels(items: unknown[] = []) {
  return [...new Set(items.map(item => String(item || '').trim()).filter(Boolean))];
}

export function availableProviders(config: ChatConfig): ChatProvider[] {
  const configured = (config.api_providers ?? []).filter(provider => provider.enabled !== false && provider.has_key !== false && provider.chat_models?.length);
  return configured.length ? configured.map(provider => ({ ...provider, chat_models: uniqueModels(provider.chat_models) })) : [{ id: 'comfly', name: 'API', chat_models: uniqueModels(config.chat_models?.length ? config.chat_models : [config.chat_model || 'gpt-4o-mini']) }];
}

export function isImageAttachment(attachment: ChatAttachment) {
  return attachment.kind === 'image' || attachment.mime?.startsWith('image/') === true || /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(attachment.url);
}

export function filterConversations(items: ConversationSummary[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return !needle ? items : items.filter(item => `${item.title} ${item.last_message}`.toLocaleLowerCase().includes(needle));
}

export function parseSseBuffer(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const chunks = normalized.split('\n\n');
  const rest = chunks.pop() || '';
  const events = chunks.flatMap(chunk => {
    const data = chunk.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    if (!data) return [];
    try { return [JSON.parse(data)]; } catch { return []; }
  });
  return { events, rest };
}
