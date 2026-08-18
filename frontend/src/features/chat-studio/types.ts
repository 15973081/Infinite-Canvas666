export interface ChatAttachment { url: string; name: string; role?: string; kind: 'image' | 'video' | 'audio' | 'file' | string; mime?: string }
export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; created_at?: number; attachments?: ChatAttachment[]; model?: string; raw_usage?: unknown }
export interface Conversation { id: string; title: string; created_at: number; updated_at: number; messages: ChatMessage[] }
export interface ConversationSummary { id: string; title: string; created_at: number; updated_at: number; last_message: string }
export interface ChatProvider { id: string; name: string; enabled?: boolean; has_key?: boolean; chat_models: string[] }
export interface ChatConfig { chat_model?: string; chat_models?: string[]; ms_chat_models?: string[]; api_providers?: ChatProvider[] }
export interface ChatRequest { conversation_id: string; message: string; model: string; ms_model: string; provider: string; mode: 'chat'; reference_images: ChatAttachment[] }
export type ChatStreamEvent = { type: 'meta'; conversation: Conversation } | { type: 'delta'; delta: string } | { type: 'error'; detail: string } | { type: 'done'; conversation: Conversation; message: ChatMessage };

