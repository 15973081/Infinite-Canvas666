import { useEffect, useMemo, useRef, useState } from 'react';
import { publishStudioEvent, subscribeStudioEvents } from '../../shared/studio-events';
import { chatClient } from './client';
import { availableProviders, CHAT_LAST_CONVERSATION_KEY, CHAT_SETTINGS_KEY, CHAT_USER_KEY, filterConversations, isImageAttachment } from './domain';
import type { ChatAttachment, ChatConfig, ChatMessage, ChatStreamEvent, Conversation, ConversationSummary } from './types';

const id = () => crypto.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const readStored = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

function AttachmentView({ attachment, onOpen }: { attachment: ChatAttachment; onOpen?: (url: string) => void }) {
  if (isImageAttachment(attachment)) return <button className="chat-attachment-image" type="button" onClick={() => onOpen?.(attachment.url)}><img src={attachment.url} alt={attachment.name} /></button>;
  return <a className="chat-attachment-file" href={attachment.url} target="_blank" rel="noreferrer"><strong>{attachment.kind.toUpperCase()}</strong><span>{attachment.name}</span></a>;
}

function MessageBubble({ message, streaming, onOpen, onCopy }: { message: ChatMessage; streaming?: boolean; onOpen: (url: string) => void; onCopy: (text: string) => void }) {
  return <article className={`chat-message ${message.role} ${streaming ? 'streaming' : ''}`}><div className="chat-message-role">{message.role === 'user' ? '你' : 'AI'}</div><div className="chat-bubble"><div className="chat-message-text">{message.content || (streaming ? '正在思考…' : '')}</div>{message.attachments?.length ? <div className="chat-attachments">{message.attachments.map((attachment, index) => <AttachmentView attachment={attachment} onOpen={onOpen} key={`${attachment.url}-${index}`} />)}</div> : null}<footer><span>{message.model?.split('/').pop()?.split(':')[0] || ''}</span>{message.content && <button type="button" onClick={() => onCopy(message.content)}>复制</button>}</footer></div></article>;
}

export function ChatStudioApp() {
  const [config, setConfig] = useState<ChatConfig>({}); const [summaries, setSummaries] = useState<ConversationSummary[]>([]); const [conversation, setConversation] = useState<Conversation>();
  const [query, setQuery] = useState(''); const [draft, setDraft] = useState(''); const [attachments, setAttachments] = useState<ChatAttachment[]>([]); const [status, setStatus] = useState('正在加载对话…');
  const settings = readStored(CHAT_SETTINGS_KEY, { provider: '', model: '' }); const [providerId, setProviderId] = useState(settings.provider); const [model, setModel] = useState(settings.model);
  const [busy, setBusy] = useState(false); const [streamingText, setStreamingText] = useState(''); const [failedDraft, setFailedDraft] = useState<{ text: string; attachments: ChatAttachment[] }>(); const [preview, setPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null); const messageRef = useRef<HTMLTextAreaElement>(null); const messagesRef = useRef<HTMLDivElement>(null); const abortRef = useRef<AbortController | undefined>(undefined);
  const userId = useMemo(() => { const saved = localStorage.getItem(CHAT_USER_KEY); const next = saved || id(); localStorage.setItem(CHAT_USER_KEY, next); return next; }, []);
  const providers = useMemo(() => availableProviders(config), [config]); const provider = providers.find(item => item.id === providerId) ?? providers[0]; const models = provider?.chat_models ?? [];
  const visibleSummaries = useMemo(() => filterConversations(summaries, query), [summaries, query]);

  const refreshList = async () => { const value = await chatClient.list(userId); setSummaries(value.conversations); return value.conversations; };
  const openConversation = async (conversationId: string) => { const value = await chatClient.get(userId, conversationId); setConversation(value.conversation); localStorage.setItem(CHAT_LAST_CONVERSATION_KEY, conversationId); setStatus('已就绪'); };
  const refreshConfig = async () => {
    const next = await chatClient.config(); setConfig(next); const nextProviders = availableProviders(next);
    setProviderId(current => nextProviders.some(item => item.id === current) ? current : nextProviders[0]?.id || '');
    setModel(current => nextProviders.some(item => item.chat_models.includes(current)) ? current : nextProviders[0]?.chat_models[0] || '');
  };
  useEffect(() => { Promise.all([refreshConfig(), refreshList()]).then(([, items]) => { const remembered = localStorage.getItem(CHAT_LAST_CONVERSATION_KEY); const target = items.find(item => item.id === remembered) ?? items[0]; if (target) return openConversation(target.id); setStatus('新建对话后即可开始'); }).catch(error => setStatus(errorMessage(error))); return subscribeStudioEvents(event => { if (event === 'providers-changed') void refreshConfig(); }); }, []);
  useEffect(() => { if (!provider) return; const nextModel = provider.chat_models.includes(model) ? model : provider.chat_models[0] || ''; if (nextModel !== model) setModel(nextModel); localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify({ provider: provider.id, model: nextModel })); }, [provider?.id, model, providers]);
  useEffect(() => { requestAnimationFrame(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }); }, [conversation?.messages, streamingText]);

  const createConversation = async () => { try { const value = await chatClient.create(userId); setConversation(value.conversation); localStorage.setItem(CHAT_LAST_CONVERSATION_KEY, value.conversation.id); await refreshList(); setStatus('新对话已创建'); messageRef.current?.focus(); } catch (error) { setStatus(errorMessage(error)); } };
  const removeConversation = async (item: ConversationSummary) => { if (!confirm(`删除对话“${item.title}”？`)) return; try { await chatClient.remove(userId, item.id); const items = await refreshList(); if (conversation?.id === item.id) { const next = items[0]; if (next) await openConversation(next.id); else { setConversation(undefined); localStorage.removeItem(CHAT_LAST_CONVERSATION_KEY); } } setStatus('对话已删除'); } catch (error) { setStatus(errorMessage(error)); } };
  const upload = async (files: File[]) => { const available = Math.max(0, 4 - attachments.length); if (!available) { setStatus('每条消息最多添加 4 个附件'); return; } setStatus('正在上传附件…'); try { const value = await chatClient.upload(files.slice(0, available)); setAttachments(current => [...current, ...value.files].slice(0, 4)); setStatus(`已添加 ${value.files.length} 个附件`); } catch (error) { setStatus(errorMessage(error)); } };
  const stop = () => { abortRef.current?.abort(); setStatus('已停止接收；服务端已接收的消息仍会保留'); };
  const send = async (retry?: { text: string; attachments: ChatAttachment[] }) => {
    const text = (retry?.text ?? draft).trim(); const refs = retry?.attachments ?? attachments; if (!text || busy || !provider || !model) return;
    const controller = new AbortController(); abortRef.current = controller; setBusy(true); setStreamingText(''); setFailedDraft(undefined); setDraft(''); setAttachments([]); setStatus('正在生成回复…');
    const optimistic: ChatMessage = { id: id(), role: 'user', content: text, attachments: refs, created_at: Date.now() };
    const current = conversation ?? { id: '', title: '新对话', created_at: Date.now(), updated_at: Date.now(), messages: [] };
    setConversation({ ...current, messages: [...current.messages, optimistic] });
    try {
      await chatClient.stream(userId, { conversation_id: current.id, message: text, mode: 'chat', provider: provider.id, model, ms_model: provider.id === 'modelscope' ? model : '', reference_images: refs }, controller.signal, (event: ChatStreamEvent) => {
        if (event.type === 'meta') { setConversation(event.conversation); localStorage.setItem(CHAT_LAST_CONVERSATION_KEY, event.conversation.id); }
        if (event.type === 'delta') setStreamingText(value => value + event.delta);
        if (event.type === 'error') throw new Error(event.detail);
        if (event.type === 'done') { setConversation(event.conversation); setStreamingText(''); localStorage.setItem(CHAT_LAST_CONVERSATION_KEY, event.conversation.id); }
      });
      await refreshList(); setStatus('回复完成'); publishStudioEvent('chat-changed');
    } catch (error) {
      const failureStatus = controller.signal.aborted ? '已停止接收回复' : errorMessage(error);
      if (!controller.signal.aborted) setFailedDraft({ text, attachments: refs });
      if (current.id) await openConversation(current.id).catch(() => undefined); else { const items = await refreshList().catch(() => []); if (items[0]) await openConversation(items[0].id).catch(() => undefined); }
      setStatus(failureStatus);
    } finally { setBusy(false); setStreamingText(''); abortRef.current = undefined; }
  };
  const copy = async (text: string) => { await navigator.clipboard.writeText(text); setStatus('已复制消息'); };
  const messages = conversation?.messages ?? [];

  return <div className="chat-page"><aside className="chat-sidebar"><div className="chat-brand"><img src="/static/images/logo.png" alt="Logo" /><div><strong>ChatStudio</strong><span>React · TypeScript</span></div></div><button className="studio-button primary chat-new" type="button" onClick={() => void createConversation()}>＋ 新对话</button><input className="studio-input" aria-label="搜索对话" placeholder="搜索历史对话…" value={query} onChange={event => setQuery(event.target.value)} /><nav className="chat-thread-list">{visibleSummaries.map(item => <div className={`chat-thread ${conversation?.id === item.id ? 'active' : ''}`} key={item.id}><button type="button" onClick={() => void openConversation(item.id)}><strong>{item.title}</strong><span>{item.last_message || '暂无消息'}</span></button><button type="button" aria-label={`删除 ${item.title}`} onClick={() => void removeConversation(item)}>×</button></div>)}</nav></aside>
    <main className="chat-main"><header className="chat-header"><div><h1>{conversation?.title || '新对话'}</h1><span role="status">{status}</span></div><div className="chat-model-controls"><select className="studio-input" aria-label="对话平台" value={provider?.id || ''} onChange={event => setProviderId(event.target.value)}>{providers.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select className="studio-input" aria-label="对话模型" value={model} onChange={event => setModel(event.target.value)}>{models.map(item => <option key={item}>{item}</option>)}</select></div></header>
      <div className="chat-messages" ref={messagesRef}>{messages.length ? messages.map(message => <MessageBubble message={message} onOpen={setPreview} onCopy={text => void copy(text)} key={message.id} />) : <div className="chat-empty"><strong>开始一个新对话</strong><p>支持流式回复以及图片、文档、音频和视频附件。</p></div>}{busy && <MessageBubble message={{ id: 'stream', role: 'assistant', content: streamingText }} streaming onOpen={setPreview} onCopy={text => void copy(text)} />}</div>
      <section className={`studio-card chat-composer ${busy ? 'busy' : ''}`} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); void upload([...event.dataTransfer.files]); } }}>
        {attachments.length > 0 && <div className="chat-composer-attachments">{attachments.map((attachment, index) => <div key={`${attachment.url}-${index}`}><AttachmentView attachment={attachment} onOpen={setPreview} /><button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments(items => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>}
        {failedDraft && !busy && <div className="chat-retry"><span>上次请求失败，可以重新提交。</span><button className="studio-button" type="button" onClick={() => void send(failedDraft)}>重试</button></div>}
        <textarea ref={messageRef} aria-label="消息" value={draft} placeholder="输入消息，Enter 发送，Shift + Enter 换行…" onPaste={event => { const files = [...event.clipboardData.files]; if (files.length) void upload(files); }} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} />
        <footer><div><button className="chat-icon-button" type="button" title="添加附件" onClick={() => fileRef.current?.click()}>＋</button><span>{attachments.length}/4</span></div>{busy ? <button className="studio-button danger" type="button" onClick={stop}>停止</button> : <button className="studio-button primary" type="button" disabled={!draft.trim() || !model} onClick={() => void send()}>发送</button>}<input hidden multiple ref={fileRef} type="file" onChange={event => { if (event.target.files) void upload([...event.target.files]); event.target.value = ''; }} /></footer>
      </section>
    </main>{preview && <div className="chat-preview" onMouseDown={() => setPreview('')}><img src={preview} alt="附件预览" onMouseDown={event => event.stopPropagation()} /><button type="button" onClick={() => setPreview('')}>×</button></div>}</div>;
}
