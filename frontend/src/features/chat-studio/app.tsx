import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { publishStudioEvent, subscribeStudioEvents } from '../../shared/studio-events';
import { chatClient } from './client';
import { availableProviders, CHAT_LAST_CONVERSATION_KEY, CHAT_SETTINGS_KEY, CHAT_SETTINGS_V2_KEY, CHAT_USER_KEY, isImageAttachment } from './domain';
import type { ChatAttachment, ChatConfig, ChatMessage, ChatStreamEvent, Conversation, ConversationSummary } from './types';

const id = () => crypto.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const readStored = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

type IconName = 'boxes' | 'check' | 'chevron-up' | 'file' | 'history' | 'messages' | 'paperclip' | 'plus' | 'send' | 'x';

function Icon({ name }: { name: IconName }) {
  const common = { 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2, viewBox: '0 0 24 24' };
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === 'history') return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>;
  if (name === 'paperclip') return <svg {...common}><path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>;
  if (name === 'boxes') return <svg {...common}><path d="m12 2 4 2.3v4.6L12 11 8 8.9V4.3zM5 13l4 2.3v4.6L5 22l-4-2.1v-4.6zM19 13l4 2.3v4.6L19 22l-4-2.1v-4.6z" /></svg>;
  if (name === 'chevron-up') return <svg {...common}><path d="m18 15-6-6-6 6" /></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === 'file') return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
  if (name === 'messages') return <svg {...common}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>;
  if (name === 'send') return <svg {...common}><path d="m22 2-7 20-4-9-9-4zM22 2 11 13" /></svg>;
  return <svg {...common}><path d="M18 6 6 18M6 6l12 12" /></svg>;
}

function attachmentName(attachment: ChatAttachment) {
  return attachment.name || attachment.url.split('/').pop() || '附件';
}

function AttachmentThumb({ attachment, onOpen }: { attachment: ChatAttachment; onOpen: (url: string) => void }) {
  if (isImageAttachment(attachment)) return <img className="thumb" src={attachment.url} title={attachmentName(attachment)} onClick={() => onOpen(attachment.url)} />;
  return <div className="thumb file-thumb" title={attachmentName(attachment)}><Icon name="file" /><span className="thumb-name">{attachmentName(attachment)}</span></div>;
}

function MessageBubble({ message, streaming, onOpen }: { message: ChatMessage; streaming?: boolean; onOpen: (url: string) => void }) {
  const imageUrls = message.image_urls?.length ? message.image_urls : message.image_url ? [message.image_url] : [];
  const content = message.type === 'image' ? message.agent_reply || '生成完成' : message.content;
  return <div className={`bubble-row ${message.role === 'user' ? 'user' : 'assistant'}`}>
    <div className={`bubble ${message.role === 'user' ? 'user' : 'assistant'} ${imageUrls.length ? 'image-bubble' : ''} ${streaming ? 'streaming' : ''}`}>
      <div className="bubble-text">{content || ''}</div>
      {message.attachments?.length ? <div className="thumbs">{message.attachments.map((attachment, index) => <AttachmentThumb attachment={attachment} onOpen={onOpen} key={`${attachment.url}-${index}`} />)}</div> : null}
      {imageUrls.length ? <div className={`generated-grid count-${Math.min(imageUrls.length, 4)}`}>{imageUrls.map(url => <img className="generated" src={url} alt="生成结果" onClick={() => onOpen(url)} key={url} />)}</div> : null}
      {message.role === 'assistant' && message.model ? <div className="chat-model-badge">{message.model.split('/').pop()?.split(':')[0]}</div> : null}
    </div>
  </div>;
}

export function ChatStudioApp() {
  const [config, setConfig] = useState<ChatConfig>({});
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [conversation, setConversation] = useState<Conversation>();
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [status, setStatus] = useState('正在加载对话…');
  const legacySettings = readStored<Record<string, unknown>>(CHAT_SETTINGS_KEY, {});
  const modernSettings = readStored(CHAT_SETTINGS_V2_KEY, { provider: '', model: '' });
  const initialProvider = String(legacySettings.provider || modernSettings.provider || '');
  const initialModelsByProvider = typeof legacySettings.chatProviderModels === 'object' && legacySettings.chatProviderModels ? legacySettings.chatProviderModels as Record<string, string> : {};
  const initialModel = String(legacySettings.activeChatModel || legacySettings.msModel || modernSettings.model || '');
  const [providerId, setProviderId] = useState(initialProvider);
  const [model, setModel] = useState(initialModel);
  const [modelsByProvider, setModelsByProvider] = useState(initialModelsByProvider);
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [preview, setPreview] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const modelPopoverRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLElement>(null);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const userId = useMemo(() => { const saved = localStorage.getItem(CHAT_USER_KEY); const next = saved || id(); localStorage.setItem(CHAT_USER_KEY, next); return next; }, []);
  const providers = useMemo(() => availableProviders(config), [config]);
  const provider = providers.find(item => item.id === providerId) ?? providers[0];
  const models = provider?.chat_models ?? [];

  const refreshList = async () => { const value = await chatClient.list(userId); setSummaries(value.conversations); return value.conversations; };
  const openConversation = async (conversationId: string) => { const value = await chatClient.get(userId, conversationId); setConversation(value.conversation); localStorage.setItem(CHAT_LAST_CONVERSATION_KEY, conversationId); setStatus('已就绪'); setHistoryOpen(false); };
  const refreshConfig = async () => {
    const next = await chatClient.config(); setConfig(next); const nextProviders = availableProviders(next);
    setProviderId(current => nextProviders.some(item => item.id === current) ? current : nextProviders[0]?.id || '');
    setModel(current => nextProviders.some(item => item.chat_models.includes(current)) ? current : nextProviders[0]?.chat_models[0] || '');
  };
  useEffect(() => { Promise.all([refreshConfig(), refreshList()]).then(([, items]) => { const remembered = localStorage.getItem(CHAT_LAST_CONVERSATION_KEY); const target = items.find(item => item.id === remembered) ?? items[0]; if (target) return openConversation(target.id); setStatus('新建对话后即可开始'); }).catch(error => setStatus(errorMessage(error))); return subscribeStudioEvents(event => { if (event === 'providers-changed') void refreshConfig(); }); }, []);
  useEffect(() => {
    if (!provider) return;
    const remembered = modelsByProvider[provider.id];
    const nextModel = provider.chat_models.includes(model) ? model : provider.chat_models.includes(remembered) ? remembered : provider.chat_models[0] || '';
    if (nextModel !== model) setModel(nextModel);
    const nextModels = { ...modelsByProvider, [provider.id]: nextModel };
    if (modelsByProvider[provider.id] !== nextModel) setModelsByProvider(nextModels);
    const previous = readStored<Record<string, unknown>>(CHAT_SETTINGS_KEY, {});
    localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify({ ...previous, mode: 'chat', provider: provider.id, msModel: provider.id === 'modelscope' ? nextModel : String(previous.msModel || ''), activeChatModel: nextModel, chatProviderModels: nextModels, modelPickerScope: 'chat' }));
    localStorage.setItem(CHAT_SETTINGS_V2_KEY, JSON.stringify({ provider: provider.id, model: nextModel }));
  }, [provider?.id, model, providers]);
  useEffect(() => { requestAnimationFrame(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }); }, [conversation?.messages, streamingText]);
  useEffect(() => {
    const input = messageRef.current; const composer = composerRef.current; if (!input || !composer) return;
    input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    requestAnimationFrame(() => composer.classList.toggle('has-overflow', composer.scrollHeight > composer.clientHeight + 2));
  }, [draft, attachments]);
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => { const files = [...(event.clipboardData?.items || [])].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => Boolean(file)); if (files.length) void upload(files); };
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPreview(''); setModelPickerOpen(false); } };
    window.addEventListener('paste', handlePaste); window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('paste', handlePaste); window.removeEventListener('keydown', handleKey); };
  }, [attachments.length]);
  useEffect(() => {
    if (!modelPickerOpen) return;
    const position = () => {
      const button = modelButtonRef.current; const popover = modelPopoverRef.current; if (!button || !popover) return;
      const rect = button.getBoundingClientRect(); const viewportWidth = window.visualViewport?.width || window.innerWidth; const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const width = Math.min(380, Math.max(300, viewportWidth - 32)); const availableAbove = Math.max(180, rect.top - 14); const maxHeight = Math.min(390, availableAbove, viewportHeight - 32);
      const left = Math.min(Math.max(16, rect.left), Math.max(16, viewportWidth - width - 16)); const top = Math.max(12, rect.top - maxHeight - 10);
      popover.style.setProperty('--model-picker-left', `${Math.round(left)}px`); popover.style.setProperty('--model-picker-top', `${Math.round(top)}px`); popover.style.setProperty('--model-picker-width', `${Math.round(width)}px`); popover.style.setProperty('--model-picker-max-height', `${Math.round(maxHeight)}px`);
    };
    const close = (event: MouseEvent) => { const target = event.target as Node; if (!modelButtonRef.current?.contains(target) && !modelPopoverRef.current?.contains(target)) setModelPickerOpen(false); };
    position(); window.addEventListener('resize', position); document.addEventListener('click', close);
    return () => { window.removeEventListener('resize', position); document.removeEventListener('click', close); };
  }, [modelPickerOpen]);
  useEffect(() => {
    if (!historyOpen) return;
    const close = (event: MouseEvent) => { if (window.innerWidth <= 900 && !(event.target as Element).closest?.('.top-actions')) setHistoryOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [historyOpen]);

  const createConversation = async () => { try { const value = await chatClient.create(userId); setConversation(value.conversation); localStorage.setItem(CHAT_LAST_CONVERSATION_KEY, value.conversation.id); await refreshList(); setStatus('新对话已创建'); setHistoryOpen(false); messageRef.current?.focus(); } catch (error) { setStatus(errorMessage(error)); } };
  const removeConversation = async (item: ConversationSummary) => { if (!confirm('删除这条历史对话？')) return; try { await chatClient.remove(userId, item.id); const items = await refreshList(); if (conversation?.id === item.id) { const next = items[0]; if (next) await openConversation(next.id); else { setConversation(undefined); localStorage.removeItem(CHAT_LAST_CONVERSATION_KEY); } } setStatus('对话已删除'); } catch (error) { setStatus(errorMessage(error)); } };
  const upload = async (files: File[]) => { const available = Math.max(0, 4 - attachments.length); if (!available) return; try { const value = await chatClient.upload(files.slice(0, available)); setAttachments(current => [...current, ...value.files].slice(0, 4)); } catch (error) { setStatus(errorMessage(error)); } };
  const send = async () => {
    const text = draft.trim(); const refs = attachments; if (!text || busy || !provider || !model) return;
    const controller = new AbortController(); abortRef.current = controller; setBusy(true); setStreamingText(''); setDraft(''); setAttachments([]); setStatus('正在生成回复…');
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
      const detail = errorMessage(error);
      setStatus(detail);
      setConversation(value => value ? { ...value, messages: [...value.messages, { id: id(), role: 'assistant', content: detail, created_at: Date.now() }] } : value);
    } finally { setBusy(false); setStreamingText(''); abortRef.current = undefined; }
  };
  const modelPickerPopover = <div ref={modelPopoverRef} id="modelPickerPopover" className={`model-picker-popover ${modelPickerOpen ? 'open' : ''}`} onClick={event => event.stopPropagation()}>
    <div className="model-picker-head"><div id="modelPickerTitle" className="model-picker-title">对话模型</div><div id="modelPickerScope" className="model-picker-scope" style={{ display: 'none' }} /></div>
    <div className="model-picker-body">
      <div id="modelProviderList" className="model-picker-list">{providers.map(item => <button className={`model-picker-option ${item.id === provider?.id ? 'active' : ''}`} type="button" key={item.id} onClick={() => { setProviderId(item.id); setModel(modelsByProvider[item.id] || item.chat_models[0] || ''); }}><span>{item.name}</span>{item.id === provider?.id ? <Icon name="check" /> : null}</button>)}</div>
      <div id="modelList" className="model-picker-list">{models.length ? models.map(item => <button className={`model-picker-option ${item === model ? 'active' : ''}`} type="button" key={item} onClick={() => { setModel(item); setModelPickerOpen(false); }}><span>{item.split('/').pop()?.split(':')[0]}</span>{item === model ? <Icon name="check" /> : null}</button>) : <div className="model-picker-empty">暂无模型</div>}</div>
    </div>
  </div>;
  const messages = conversation?.messages ?? [];

  return <div className="chat-shell">
    <main className="chat-main">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="title-block"><h1 id="chatTitle">{conversation?.title || '新对话'}</h1><span className="sr-only" role="status">{status}</span></div>
          <div className="top-actions">
            <button className="action-btn" title="新对话" type="button" onClick={() => void createConversation()}><Icon name="plus" /><span>新建</span></button>
            <button className="action-btn history-toggle" title="历史" type="button" onClick={event => { event.stopPropagation(); setHistoryOpen(value => !value); }}><Icon name="history" /><span>历史</span></button>
            <aside id="historyPopover" className={`chat-rail ${historyOpen ? 'open' : ''}`}>
              <div className="rail-head"><div><div className="rail-kicker">对话列表</div><div className="rail-title">历史</div></div><button className="rail-close" title="关闭" aria-label="关闭" type="button" onClick={() => setHistoryOpen(false)}><Icon name="x" /></button></div>
              <button className="rail-new" title="新对话" type="button" onClick={() => void createConversation()}><Icon name="plus" /><span>新建</span></button>
              <div id="threadList" className="thread-list">{summaries.length ? summaries.map(item => <div className="thread-row" key={item.id}><button className={`thread-item ${conversation?.id === item.id ? 'active' : ''}`} type="button" onClick={() => void openConversation(item.id)}><div className="text-sm font-bold truncate">{item.title || '新对话'}</div><div className="text-[11px] opacity-50 truncate mt-1">{item.last_message || ''}</div></button><button className="thread-delete" title="删除对话" aria-label={`删除 ${item.title}`} type="button" onClick={event => { event.stopPropagation(); void removeConversation(item); }}><Icon name="x" /></button></div>) : <div className="px-3 py-8 text-center text-[11px] font-bold text-gray-300 uppercase tracking-widest">暂无历史</div>}</div>
            </aside>
          </div>
        </div>
      </header>

      <section id="messages" className="messages" ref={messagesRef}>{messages.length ? messages.map(message => <MessageBubble message={message} onOpen={setPreview} key={message.id} />) : <div className="empty-state"><Icon name="messages" /><div className="empty-state-text">就绪</div></div>}{busy ? <MessageBubble message={{ id: 'stream', role: 'assistant', content: streamingText }} streaming onOpen={setPreview} /> : null}</section>

      <div className="composer-wrap">
        <div className="composer">
          <div id="composerBody" ref={composerRef} className={`composer-body ${dragOver ? 'drag-over' : ''}`} onDragOver={event => { if ([...event.dataTransfer.items].some(item => item.kind === 'file')) { event.preventDefault(); setDragOver(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false); }} onDrop={event => { const files = [...event.dataTransfer.files]; if (files.length) { event.preventDefault(); setDragOver(false); void upload(files); } }}>
            <textarea id="messageInput" ref={messageRef} rows={4} placeholder="输入消息，Enter 发送..." value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} />
            <div id="refStrip" className="ref-strip">{attachments.map((attachment, index) => isImageAttachment(attachment) ? <div className="ref-chip" key={`${attachment.url}-${index}`}><img src={attachment.url} title={attachmentName(attachment)} /><button type="button" onClick={() => setAttachments(items => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></div> : <div className="ref-chip file" key={`${attachment.url}-${index}`}><Icon name="file" /><span className="ref-file-name" title={attachmentName(attachment)}>{attachmentName(attachment)}</span><button type="button" onClick={() => setAttachments(items => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>
            <div className="composer-inside-foot">
              <div className="left-tools"><div className="inline-controls">
                <input id="attachmentInput" className="file-input" ref={fileRef} type="file" multiple onChange={event => { if (event.target.files) void upload([...event.target.files]); event.target.value = ''; }} />
                <button type="button" className="upload-btn" title="上传附件" aria-label="上传附件" onClick={() => fileRef.current?.click()}><Icon name="paperclip" /></button>
                <div id="modelPicker" className={`model-picker ${modelPickerOpen ? 'open' : ''}`}>
                  <button ref={modelButtonRef} id="modelPickerBtn" className="model-picker-button" title="选择平台和模型" type="button" onClick={event => { event.stopPropagation(); setModelPickerOpen(value => !value); }}><Icon name="boxes" /><span className="model-picker-labels"><span id="modelPickerProvider" className="model-picker-provider">{provider?.name || 'API'}</span><span className="model-picker-dot" /><span id="modelPickerModel" className="model-picker-model">{model.split('/').pop()?.split(':')[0] || 'Model'}</span></span><Icon name="chevron-up" /></button>
                  {createPortal(modelPickerPopover, document.body)}
                </div>
                <div id="imageControls" className="image-controls hidden"><div className="mini-ratio"><button id="chat-ratio-square" className="active" type="button">1:1</button><button id="chat-ratio-portrait" type="button">2:3</button><button id="chat-ratio-landscape" type="button">3:2</button><button id="chat-ratio-portrait43" type="button">3:4</button><button id="chat-ratio-landscape43" type="button">4:3</button><button id="chat-ratio-story" type="button">9:16</button><button id="chat-ratio-wide" type="button">16:9</button></div><div className="resolution-toggle" title="分辨率"><button id="chat-res-1k" className="resolution-option active" type="button">1K</button><button id="chat-res-2k" className="resolution-option" type="button">2K</button></div></div>
              </div></div>
              <button id="sendBtn" className="send-btn" title="发送" aria-label="发送" type="button" disabled={!draft.trim() || busy || !model} onClick={() => void send()}><Icon name="send" /></button>
            </div>
          </div>
        </div>
      </div>
    </main>
    <div id="imagePreviewModal" className={`image-preview-modal ${preview ? 'open' : ''}`} onClick={() => setPreview('')}><button className="image-preview-close" title="关闭" aria-label="关闭" type="button" onClick={event => { event.stopPropagation(); setPreview(''); }}><Icon name="x" /></button><img id="imagePreviewImg" src={preview} alt="preview" onClick={event => event.stopPropagation()} /></div>
  </div>;
}
