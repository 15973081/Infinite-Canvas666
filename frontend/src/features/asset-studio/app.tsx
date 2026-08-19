import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { publishStudioEvent } from '../../shared/studio-events';
import { assetClient } from './client';
import { assetCategories, copyItemsToCanvas, firstCategory, firstLibrary, flattenTree, itemsForFolder, mediaMatches, promptCategoryName, promptMatches } from './domain';
import type { AssetCategory, AssetLibrary, AssetLibraryState, AssetProvider, AssetTab, CanvasAssetState, FolderNode, MediaItem, PromptItem, PromptLibraryState, SharedFolder } from './types';

const tabs: Array<{ id: AssetTab; label: string; icon: IconName }> = [
  { id: 'assets', label: '图片资产', icon: 'image' },
  { id: 'workflows', label: '工作流管理', icon: 'workflow' },
  { id: 'prompts', label: '提示词库', icon: 'prompt' },
  { id: 'canvas', label: '画布资产', icon: 'grid' },
  { id: 'local', label: '本地素材', icon: 'folder' },
  { id: 'shared', label: '共享目录', icon: 'link' },
];

type IconName = 'image' | 'workflow' | 'prompt' | 'grid' | 'folder' | 'link' | 'refresh' | 'plus' | 'edit' | 'trash' | 'search' | 'upload' | 'download' | 'copy' | 'cut' | 'move' | 'check' | 'x' | 'chevron' | 'video' | 'audio' | 'file' | 'external' | 'user' | 'loader';

function Icon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body: Record<IconName, ReactNode> = {
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
    workflow: <><path d="M5 6h6M13 18h6M8 6v12h5"/><circle cx="5" cy="6" r="2"/><circle cx="15" cy="18" r="2"/><circle cx="19" cy="6" r="2"/></>,
    prompt: <><path d="M4 5h16v12H8l-4 3z"/><path d="M8 9h8M8 13h5"/></>,
    grid: <><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></>,
    folder: <path d="M3 6h7l2 2h9v11H3z"/>, link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/></>, plus: <path d="M12 5v14M5 12h14"/>, edit: <><path d="m4 20 4-1 11-11-3-3L5 16z"/><path d="m14 6 3 3"/></>, trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v6h14v-6"/></>, download: <><path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M5 20h14"/></>, copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5H5v11h3"/></>, cut: <><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><path d="m8 8 10 8M8 16 18 8"/></>, move: <><path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3M21 12l-3-3m3 3-3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3"/></>,
    check: <path d="m5 12 4 4L19 6"/>, x: <path d="m6 6 12 12M18 6 6 18"/>, chevron: <path d="m9 18 6-6-6-6"/>, video: <><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/></>, audio: <><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>, file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></>, external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/></>, user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>, loader: <><path d="M12 3a9 9 0 1 1-8.4 5.8"/><path d="M3 4v5h5"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common}>{body[name]}</svg>;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const kindLabel = (kind: MediaItem['kind']) => ({ image: '图片', video: '视频', audio: '音频', workflow: '工作流' }[kind] || kind);
const formatDate = (value?: number) => value ? new Date(value > 10_000_000_000 ? value : value * 1000).toLocaleString('zh-CN', { hour12: false }) : '—';

function MediaPreview({ item, detail = false }: { item: MediaItem; detail?: boolean }) {
  if (item.kind === 'video') return <video src={item.url} controls={detail} muted={!detail} preload="metadata" />;
  if (item.kind === 'audio') return <div className="asset-file-icon"><Icon name="audio"/><span>AUDIO</span>{detail && <audio src={item.url} controls />}</div>;
  if (item.kind === 'workflow') return <div className="asset-file-icon workflow-file-icon"><Icon name="workflow"/><span>WORKFLOW</span></div>;
  return <img src={item.url} alt={item.name} loading={detail ? 'eager' : 'lazy'} />;
}

function PromptEditor({ item, categories, onSave, onClose }: { item?: PromptItem; categories: Array<{ id: string; name: string }>; onSave: (item: Omit<PromptItem, 'id'> & { id?: string }) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => ({ id: item?.id, name: item?.name || '', category: item?.category || categories[0]?.id || '', positive: item?.positive || '', negative: item?.negative || '', scene: item?.scene || '' }));
  return <div className="asset-editor-backdrop" onMouseDown={onClose}><form className="asset-editor-dialog" onSubmit={event => { event.preventDefault(); if (draft.positive.trim()) onSave(draft); }} onMouseDown={event => event.stopPropagation()}>
    <div className="panel-head"><div className="panel-title"><strong>{item ? '编辑提示词' : '新建提示词'}</strong><span>保存到当前提示词库</span></div><button type="button" className="asset-icon-btn" onClick={onClose}><Icon name="x"/></button></div>
    <div className="asset-editor-fields"><label>名称<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label><label>分组<select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>正向提示词<textarea autoFocus value={draft.positive} onChange={event => setDraft({ ...draft, positive: event.target.value })}/></label><label>负向提示词<textarea value={draft.negative} onChange={event => setDraft({ ...draft, negative: event.target.value })}/></label><label>场景备注<input value={draft.scene} onChange={event => setDraft({ ...draft, scene: event.target.value })}/></label><button className="asset-btn primary" type="submit">保存提示词</button></div>
  </form></div>;
}

function LibraryTree({ libraries, activeLibrary, activeCategory, kind, expanded, onExpand, onLibrary, onCategory, onLibraryAction, onCategoryAction }: { libraries: AssetLibrary[]; activeLibrary?: AssetLibrary; activeCategory?: AssetCategory; kind: 'image' | 'workflow'; expanded: Set<string>; onExpand: (id: string) => void; onLibrary: (id: string) => void; onCategory: (libraryId: string, categoryId: string) => void; onLibraryAction: (action: 'add' | 'rename' | 'delete', library?: AssetLibrary) => void; onCategoryAction: (action: 'add' | 'rename' | 'delete', library: AssetLibrary, category?: AssetCategory) => void }) {
  return <aside className="asset-panel asset-nav"><div className="panel-head"><div className="panel-title"><strong>资产层级</strong><span>先选库，再选分组</span></div><button className="asset-icon-btn" type="button" title="新建资产库" onClick={() => onLibraryAction('add')}><Icon name="plus"/></button></div><div className="nav-scroll"><div className="nav-tree asset-library-tree">
    {libraries.map(library => { const categories = assetCategories(library, kind); const isOpen = expanded.has(library.id) || library.id === activeLibrary?.id; const total = categories.reduce((sum, category) => sum + category.items.length, 0); return <div className={`tree-branch ${isOpen ? 'expanded' : ''}`} key={library.id}>
      <button className={`tree-row tree-parent ${library.id === activeLibrary?.id ? 'contains-active' : ''}`} type="button" onClick={() => { onLibrary(library.id); onExpand(library.id); }}><span className="tree-toggle"><Icon name="chevron"/></span><span className="tree-row-icon"><Icon name="folder"/></span><span className="tree-row-name">{library.name}</span><span className="tree-row-count">{total}</span></button>
      {library.id === activeLibrary?.id && <div className="tree-action-bar"><button type="button" onClick={() => onCategoryAction('add', library)}><Icon name="plus"/>新分组</button><button type="button" onClick={() => onLibraryAction('rename', library)}><Icon name="edit"/>重命名</button><button className="danger" type="button" onClick={() => onLibraryAction('delete', library)}><Icon name="trash"/>删除库</button></div>}
      <div className="tree-children">{categories.length ? categories.map(category => <div key={category.id}><button className={`tree-row tree-child ${category.id === activeCategory?.id && library.id === activeLibrary?.id ? 'active' : ''}`} type="button" onClick={() => onCategory(library.id, category.id)}><span className="tree-elbow"/><span className="tree-row-icon"><Icon name={kind === 'workflow' ? 'workflow' : 'image'}/></span><span className="tree-row-name">{category.name}</span><span className="tree-row-count">{category.items.length}</span></button>{category.id === activeCategory?.id && library.id === activeLibrary?.id && <div className="tree-action-bar child-actions"><button type="button" onClick={() => onCategoryAction('rename', library, category)}><Icon name="edit"/>重命名</button><button className="danger" type="button" onClick={() => onCategoryAction('delete', library, category)}><Icon name="trash"/>删除组</button></div>}</div>) : <div className="tree-empty">暂无分组</div>}</div>
    </div>; })}
  </div></div></aside>;
}

function FolderTree({ title, subtitle, nodes, activePath, onSelect, action }: { title: string; subtitle: string; nodes: FolderNode[]; activePath: string; onSelect: (path: string) => void; action?: ReactNode }) {
  return <aside className="asset-panel asset-nav"><div className="panel-head"><div className="panel-title"><strong>{title}</strong><span>{subtitle}</span></div>{action}</div><div className="nav-scroll"><div className="nav-tree">{nodes.map(node => <button className={`tree-row tree-parent ${activePath === node.path ? 'active' : ''}`} type="button" key={node.id} onClick={() => onSelect(node.path)}><span className="tree-row-icon"><Icon name="folder"/></span><span className="tree-row-name">{node.name}</span><span className="tree-row-count">{node.count ?? node.items.length}</span></button>)}</div></div></aside>;
}

function MediaCard({ item, active, checked, manage, onOpen, onToggle }: { item: MediaItem; active: boolean; checked: boolean; manage: boolean; onOpen: () => void; onToggle: () => void }) {
  return <article className={`asset-card ${item.kind === 'workflow' ? 'workflow-card' : ''} ${active ? 'active' : ''}`}>
    {manage && <input className="asset-card-check" aria-label={`选择 ${item.name}`} type="checkbox" checked={checked} onChange={onToggle}/>}<button className="asset-thumb" type="button" onClick={onOpen}><MediaPreview item={item}/></button><div className="asset-card-body"><div className="asset-card-name" title={item.name}>{item.name}</div><div className="asset-card-meta">{kindLabel(item.kind)} · {formatDate(item.created_at)}</div></div>
  </article>;
}

function DetailPanel({ item, tab, library, category, providers, selectedProvider, onProvider, onRename, onDelete, onCaption, onRegister, onCancel, onStatus, onLightbox }: { item?: MediaItem; tab: AssetTab; library?: AssetLibrary; category?: AssetCategory; providers: AssetProvider[]; selectedProvider: string; onProvider: (id: string) => void; onRename: (item: MediaItem, name: string) => void; onDelete: (item: MediaItem) => void; onCaption: (item: MediaItem, caption: string) => void; onRegister: (item: MediaItem, providerId: string) => void; onCancel: (item: MediaItem, providerId: string) => void; onStatus: (item: MediaItem, providerId: string) => void; onLightbox: (item: MediaItem) => void }) {
  const [name, setName] = useState(item?.name || '');
  const [caption, setCaption] = useState(item?.caption || '');
  useEffect(() => { setName(item?.name || ''); setCaption(item?.caption || ''); }, [item?.id, item?.name, item?.caption]);
  const registration = item?.registrations?.[selectedProvider];
  const status = registration?.status || '';
  return <aside className="asset-panel asset-detail"><div className="panel-head"><div className="panel-title"><strong>素材预览</strong><span>{item ? kindLabel(item.kind) : '选择素材后查看详情'}</span></div>{item && <div className="panel-actions compact-actions"><a className="asset-icon-btn" title="下载" href={`/api/download-output?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(item.name)}`} download><Icon name="download"/></a>{(tab === 'assets' || tab === 'workflows') && <button className="asset-icon-btn" title="重命名" type="button" onClick={() => { const next = prompt('素材名称', item.name); if (next?.trim()) onRename(item, next); }}><Icon name="edit"/></button>}{['assets', 'workflows', 'local'].includes(tab) && <button className="asset-icon-btn danger" title="删除" type="button" onClick={() => onDelete(item)}><Icon name="trash"/></button>}</div>}</div>
    <div className="detail-scroll">{!item ? <div className="detail-empty"><Icon name="image"/><span>选择一个素材查看预览、信息和可用操作</span></div> : <><div className="detail-media"><button className={`detail-media-frame ${item.kind === 'image' ? 'detail-media-zoomable' : ''}`} type="button" onClick={() => onLightbox(item)}><MediaPreview item={item} detail/></button></div><div className="detail-body">
      {(tab === 'assets' || tab === 'workflows') ? <input className="detail-name-input" aria-label="素材名称" value={name} onChange={event => setName(event.target.value)} onBlur={() => { if (name.trim() && name !== item.name) onRename(item, name); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/> : <div className="detail-name">{item.name}</div>}
      <div className="detail-meta-grid"><div className="detail-meta"><span>类型</span><strong>{kindLabel(item.kind)}</strong></div><div className="detail-meta"><span>创建时间</span><strong>{formatDate(item.created_at)}</strong></div><div className="detail-meta"><span>资产库</span><strong>{library?.name || item.canvas_title || item.canvas_name || '—'}</strong></div><div className="detail-meta"><span>分组</span><strong>{category?.name || item.folder || item.node_title || '—'}</strong></div></div><div className="detail-url">{item.url}</div>
      {tab === 'local' && item.kind === 'image' && <div className="detail-caption-card"><div className="detail-caption-head"><strong>素材描述</strong><button className="asset-btn" type="button" onClick={() => onCaption(item, caption)}>保存</button></div><textarea className="detail-caption-textarea" value={caption} placeholder="为素材补充描述…" onChange={event => setCaption(event.target.value)}/></div>}
      {tab === 'assets' && item.kind === 'video' && providers.length > 0 && <section className="avatar-section"><div className="avatar-head"><Icon name={status === 'Processing' || status === 'Uploading' || status === 'Queued' ? 'loader' : 'user'}/><span>{status === 'Active' ? '已认证可用' : status ? `认证状态：${status}` : '注册到平台'}</span></div>{registration?.asset_uri && <div className="avatar-uri">{registration.asset_uri}</div>}{registration?.detail && <div className="avatar-hint warn">{registration.detail}</div>}<select className="avatar-provider-select" aria-label="认证平台" value={selectedProvider} onChange={event => onProvider(event.target.value)}>{providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select><div className="panel-actions">{status && status !== 'Cancelled' && <button className="asset-btn" type="button" onClick={() => onStatus(item, selectedProvider)}><Icon name="refresh"/>刷新状态</button>}{status && status !== 'Cancelled' ? <button className="asset-btn danger" type="button" onClick={() => onCancel(item, selectedProvider)}>取消认证</button> : <button className="asset-btn primary" type="button" onClick={() => onRegister(item, selectedProvider)}><Icon name="user"/>注册到该平台</button>}</div></section>}
    </div></>}</div>
  </aside>;
}

export function AssetStudioApp() {
  const [tab, setTab] = useState<AssetTab>('assets');
  const [assets, setAssets] = useState<AssetLibraryState>({ active_library_id: '', libraries: [] });
  const [prompts, setPrompts] = useState<PromptLibraryState>({ active_library_id: '', libraries: [] });
  const [localItems, setLocalItems] = useState<MediaItem[]>([]);
  const [localTree, setLocalTree] = useState<FolderNode>();
  const [sharedFolders, setSharedFolders] = useState<SharedFolder[]>([]);
  const [sharedTree, setSharedTree] = useState<FolderNode>();
  const [canvas, setCanvas] = useState<CanvasAssetState>({ categories: [], items: [] });
  const [providers, setProviders] = useState<AssetProvider[]>([]);
  const [libraryId, setLibraryId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [promptLibraryId, setPromptLibraryId] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [sharedId, setSharedId] = useState('');
  const [canvasKind, setCanvasKind] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<MediaItem>();
  const [promptDetail, setPromptDetail] = useState<PromptItem>();
  const [promptEdit, setPromptEdit] = useState<PromptItem | 'new' | null>(null);
  const [manage, setManage] = useState(false);
  const [status, setStatus] = useState('正在加载素材…');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedProvider, setSelectedProvider] = useState('');
  const [clipboard, setClipboard] = useState<{ mode: 'copy' | 'cut'; items: MediaItem[]; sourceLibraryId: string }>();
  const [lightbox, setLightbox] = useState<MediaItem>();
  const fileRef = useRef<HTMLInputElement>(null);

  const categoryKind = tab === 'workflows' ? 'workflow' : 'image';
  const activeLibrary = firstLibrary(assets.libraries, libraryId || assets.active_library_id);
  const categories = assetCategories(activeLibrary, categoryKind);
  const activeCategory = firstCategory(categories, categoryId);
  const promptLibrary = firstLibrary(prompts.libraries, promptLibraryId || prompts.active_library_id);
  const sharedNodes = flattenTree(sharedTree);

  const applyAssets = (next: AssetLibraryState) => {
    setAssets(next);
    const library = firstLibrary(next.libraries, libraryId || next.active_library_id);
    setLibraryId(library?.id || '');
    setCategoryId(current => library?.categories.some(category => category.id === current) ? current : assetCategories(library, categoryKind)[0]?.id || '');
    setExpanded(current => new Set([...current, ...(library ? [library.id] : [])]));
  };
  const applyPrompts = (next: PromptLibraryState) => { setPrompts(next); setPromptLibraryId(current => next.libraries.some(item => item.id === current) ? current : next.active_library_id); };
  const refreshLocal = async () => { const value = await assetClient.local(); setLocalItems(value.items); setLocalTree(value.tree); };
  const refreshShared = async () => { const value = await assetClient.shared(); setSharedFolders(value.folders); setSharedId(current => value.folders.some(folder => folder.id === current) ? current : value.folders[0]?.id || ''); };
  const refresh = async () => {
    setBusy(true); setStatus('正在同步全部素材源…');
    try {
      const [assetValue, promptValue, localValue, sharedValue, canvasValue, providerValue] = await Promise.all([assetClient.assets(), assetClient.prompts(), assetClient.local(), assetClient.shared(), assetClient.canvas(), assetClient.providers().catch(() => ({ providers: [] }))]);
      applyAssets(assetValue.library); applyPrompts(promptValue.library); setLocalItems(localValue.items); setLocalTree(localValue.tree); setSharedFolders(sharedValue.folders); setSharedId(current => sharedValue.folders.some(folder => folder.id === current) ? current : sharedValue.folders[0]?.id || ''); setCanvas(canvasValue); const avatarProviders = providerValue.providers.filter(provider => provider.enabled !== false && (provider.protocol === 'volcengine' || provider.protocol === 'apimart' || provider.base_url?.includes('apimart.ai'))); setProviders(avatarProviders); setSelectedProvider(current => avatarProviders.some(provider => provider.id === current) ? current : avatarProviders[0]?.id || ''); setStatus('已同步全部素材源');
    } catch (error) { setStatus(errorMessage(error)); } finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { setSelected(new Set()); setDetail(undefined); setPromptDetail(undefined); setQuery(''); setManage(false); }, [tab, libraryId, categoryId, folderPath, sharedId, canvasKind]);
  useEffect(() => { if (!sharedId) { setSharedTree(undefined); return; } assetClient.sharedTree(sharedId).then(value => setSharedTree(value.tree)).catch(error => setStatus(errorMessage(error))); }, [sharedId]);
  useEffect(() => { document.body.classList.toggle('asset-lightbox-open', Boolean(lightbox)); return () => document.body.classList.remove('asset-lightbox-open'); }, [lightbox]);

  const currentItems = useMemo(() => {
    if (tab === 'assets' || tab === 'workflows') return (activeCategory?.items ?? []).filter(item => mediaMatches(item, query));
    if (tab === 'local') return itemsForFolder(localItems, folderPath).filter(item => mediaMatches(item, query));
    if (tab === 'shared') return (sharedNodes.find(node => node.path === folderPath)?.items ?? []).filter(item => mediaMatches(item, query));
    if (tab === 'canvas') return canvas.items.filter(item => (canvasKind === 'all' || item.canvas_kind === canvasKind) && mediaMatches(item, query));
    return [];
  }, [tab, activeCategory, localItems, folderPath, sharedNodes, canvas.items, canvasKind, query]);
  const promptItems = useMemo(() => (promptLibrary?.items ?? []).filter(item => promptMatches(item, query)), [promptLibrary, query]);
  const selectedItems = currentItems.filter(item => selected.has(item.id));
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectAll = () => setSelected(selected.size === currentItems.length ? new Set() : new Set(currentItems.map(item => item.id)));
  const run = async (label: string, action: () => Promise<void>) => { setBusy(true); setStatus(label); try { await action(); setSelected(new Set()); setStatus('操作完成'); publishStudioEvent('assets-changed'); } catch (error) { setStatus(errorMessage(error)); } finally { setBusy(false); } };

  const manageLibrary = async (action: 'add' | 'rename' | 'delete', target = activeLibrary) => {
    if (action === 'delete') { if (!target || !confirm(`删除素材库“${target.name}”及其中内容？`)) return; return run('正在删除素材库…', async () => applyAssets((await assetClient.deleteLibrary(target.id)).library)); }
    const name = prompt(action === 'add' ? '新素材库名称' : '素材库名称', action === 'rename' ? target?.name : '新素材库'); if (!name?.trim()) return;
    return run('正在保存素材库…', async () => applyAssets((await (action === 'add' ? assetClient.createLibrary(name) : assetClient.renameLibrary(target!.id, name))).library));
  };
  const manageCategory = async (action: 'add' | 'rename' | 'delete', library = activeLibrary, target = activeCategory) => {
    if (!library) return;
    if (action === 'delete') { if (!target || !confirm(`删除分组“${target.name}”及其中内容？`)) return; return run('正在删除分组…', async () => applyAssets((await assetClient.deleteCategory(library.id, target.id)).library)); }
    const name = prompt(action === 'add' ? '新分组名称' : '分组名称', action === 'rename' ? target?.name : '新分组'); if (!name?.trim()) return;
    return run('正在保存分组…', async () => applyAssets((await (action === 'add' ? assetClient.createCategory(library.id, name, categoryKind) : assetClient.renameCategory(library.id, target!.id, name))).library));
  };
  const upload = async (files: FileList | File[]) => {
    if (!files.length) return;
    if (tab === 'local') return run('正在上传本地素材…', async () => { await assetClient.uploadLocal(folderPath, files as FileList); await refreshLocal(); });
    if (tab === 'workflows' && activeLibrary && activeCategory) return run('正在上传工作流…', async () => applyAssets((await assetClient.uploadWorkflows(activeLibrary.id, activeCategory.id, files as FileList)).library));
    if (tab === 'assets' && activeLibrary && activeCategory) return run('正在上传媒体素材…', async () => applyAssets((await assetClient.uploadAssets(activeLibrary.id, activeCategory.id, files)).library));
  };
  const dropFiles = (event: DragEvent) => { event.preventDefault(); setDragOver(false); if (event.dataTransfer.files.length) void upload(event.dataTransfer.files); };
  const addUrl = async () => { if (!activeLibrary || !activeCategory) return; const url = prompt('本地 /assets、/output 或可访问的素材 URL'); if (!url?.trim()) return; const name = prompt('素材名称', url.split('/').pop() || 'asset') || 'asset'; await run('正在保存素材…', async () => applyAssets((await assetClient.addUrl(activeLibrary.id, activeCategory.id, url, name)).library)); };
  const renameItem = async (item: MediaItem, name: string) => { if (!name.trim() || name === item.name) return; await run('正在重命名…', async () => { const next = (await assetClient.renameItem(item.id, name)).library; applyAssets(next); setDetail({ ...item, name }); }); };
  const deleteItems = async (items: MediaItem[]) => { if (!items.length || !confirm(`删除选中的 ${items.length} 项？`)) return; if (tab === 'local') return run('正在删除本地素材…', async () => { await assetClient.deleteLocal(items.map(item => item.file || item.id)); await refreshLocal(); setDetail(undefined); }); if ((tab === 'assets' || tab === 'workflows') && activeLibrary) return run('正在删除素材…', async () => { applyAssets((await assetClient.deleteItems(activeLibrary.id, items.map(item => item.id))).library); setDetail(undefined); }); };
  const moveSelected = async () => { if (!activeLibrary || !selected.size) return; const targets = activeLibrary.categories.filter(category => category.type === categoryKind && category.id !== activeCategory?.id); const targetId = prompt(`目标分组 ID：\n${targets.map(item => `${item.id} — ${item.name}`).join('\n')}`); const target = targets.find(category => category.id === targetId); if (!target) return; await run('正在移动素材…', async () => applyAssets((await assetClient.moveItems(activeLibrary.id, [...selected], activeLibrary.id, target.id)).library)); };
  const registerAvatar = async (item: MediaItem, providerId: string) => { if (!activeLibrary || !providerId) return; await run('正在提交平台认证…', async () => { const response = await assetClient.registerAvatar(activeLibrary.id, item.id, providerId); if (response.library) applyAssets(response.library); if (response.item) setDetail(response.item); }); };
  const cancelAvatar = async (item: MediaItem, providerId: string) => { if (!activeLibrary || !providerId || !confirm('取消该素材的平台认证？')) return; await run('正在取消认证…', async () => { const response = await assetClient.cancelAvatar(activeLibrary.id, item.id, providerId); if (response.library) applyAssets(response.library); if (response.item) setDetail(response.item); }); };
  const checkAvatar = async (item: MediaItem, providerId: string) => { if (!activeLibrary || !providerId) return; await run('正在刷新认证状态…', async () => { const response = await assetClient.avatarStatus(activeLibrary.id, item.id, providerId); if (response.library) applyAssets(response.library); if (response.item) setDetail(response.item); }); };
  const batchRegister = async () => { if (!activeLibrary || !selectedProvider) return; const videos = selectedItems.filter(item => item.kind === 'video'); if (!videos.length) return setStatus('请先选择视频素材'); await run(`正在认证 ${videos.length} 个视频…`, async () => { for (const item of videos) await assetClient.registerAvatar(activeLibrary.id, item.id, selectedProvider); applyAssets((await assetClient.assets()).library); }); };
  const pasteClipboard = async () => { if (!clipboard || !activeLibrary || !activeCategory) return; await run(clipboard.mode === 'cut' ? '正在移动素材…' : '正在复制素材…', async () => { const response = clipboard.mode === 'cut' ? await assetClient.moveItems(clipboard.sourceLibraryId, clipboard.items.map(item => item.id), activeLibrary.id, activeCategory.id) : await assetClient.copyItems(activeLibrary.id, activeCategory.id, clipboard.items); applyAssets(response.library); setClipboard(undefined); }); };

  const treeNodes = flattenTree(localTree);
  const side = tab === 'assets' || tab === 'workflows'
    ? <LibraryTree libraries={assets.libraries} activeLibrary={activeLibrary} activeCategory={activeCategory} kind={categoryKind} expanded={expanded} onExpand={id => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onLibrary={id => { setLibraryId(id); setCategoryId(''); }} onCategory={(lib, cat) => { setLibraryId(lib); setCategoryId(cat); }} onLibraryAction={(action, library) => void manageLibrary(action, library)} onCategoryAction={(action, library, category) => void manageCategory(action, library, category)}/>
    : tab === 'local' ? <FolderTree title="本地目录" subtitle="上传目录与文件夹" nodes={treeNodes} activePath={folderPath} onSelect={setFolderPath} action={<button className="asset-icon-btn" type="button" title="新建文件夹" onClick={async () => { const name = prompt('新文件夹名称'); if (name) await run('正在创建文件夹…', async () => { const value = await assetClient.createLocalFolder(folderPath, name); setLocalItems(value.items); setLocalTree(value.tree); }); }}><Icon name="plus"/></button>}/>
    : tab === 'shared' ? <aside className="asset-panel asset-nav"><div className="panel-head"><div className="panel-title"><strong>共享目录</strong><span>服务器目录与文件</span></div><button className="asset-icon-btn" title="注册共享目录" type="button" onClick={async () => { const path = prompt('服务器可访问的目录路径'); if (!path) return; const name = prompt('显示名称', path.split(/[\\/]/).pop()) || ''; await run('正在注册共享目录…', async () => { await assetClient.registerShared(path, name); await refreshShared(); }); }}><Icon name="plus"/></button></div><div className="nav-scroll"><div className="nav-list">{sharedFolders.map(folder => <button className={`nav-row ${folder.id === sharedId ? 'active' : ''}`} type="button" key={folder.id} onClick={() => { setSharedId(folder.id); setFolderPath(''); }}><span className="nav-row-icon"><Icon name="link"/></span><span className="nav-row-name">{folder.name}</span><span className="nav-row-count">{folder.exists ? '在线' : '失效'}</span></button>)}</div>{sharedId && <div className="tree-action-bar"><button className="danger" type="button" onClick={async () => { if (confirm('取消注册此共享目录？')) await run('正在移除共享目录…', async () => { await assetClient.removeShared(sharedId); await refreshShared(); }); }}><Icon name="trash"/>取消注册</button></div>}<div className="nav-tree">{sharedNodes.map(node => <button className={`tree-row tree-child ${folderPath === node.path ? 'active' : ''}`} type="button" key={node.id} onClick={() => setFolderPath(node.path)}><span className="tree-elbow"/><span className="tree-row-icon"><Icon name="folder"/></span><span className="tree-row-name">{node.name}</span><span className="tree-row-count">{node.items.length}</span></button>)}</div></div></aside>
    : tab === 'canvas' ? <aside className="asset-panel asset-nav"><div className="panel-head"><div className="panel-title"><strong>画布来源</strong><span>按画布类型筛选</span></div></div><div className="nav-scroll"><div className="nav-list">{canvas.categories.map(category => <button className={`nav-row ${canvasKind === category.id ? 'active' : ''}`} type="button" key={category.id} onClick={() => setCanvasKind(category.id)}><span className="nav-row-icon"><Icon name="grid"/></span><span className="nav-row-name">{category.name}</span><span className="nav-row-count">{category.count}</span></button>)}</div></div></aside>
    : <aside className="asset-panel asset-nav"><div className="panel-head"><div className="panel-title"><strong>提示词库</strong><span>按库与分组浏览</span></div><button className="asset-icon-btn" type="button" onClick={async () => { const name = prompt('新提示词库名称'); if (name) await run('正在创建提示词库…', async () => applyPrompts((await assetClient.createPromptLibrary(name)).library)); }}><Icon name="plus"/></button></div><div className="nav-scroll"><div className="nav-list">{prompts.libraries.map(library => <button className={`nav-row ${library.id === promptLibrary?.id ? 'active' : ''}`} type="button" key={library.id} onClick={() => setPromptLibraryId(library.id)}><span className="nav-row-icon"><Icon name="prompt"/></span><span className="nav-row-name">{library.name}</span><span className="nav-row-count">{library.items.length}</span></button>)}</div><div className="nav-section-title">分组</div><div className="nav-tree">{promptLibrary?.categories.map(category => <div className="tree-row tree-child" key={category.id}><span className="tree-elbow"/><span className="tree-row-icon"><Icon name="folder"/></span><span className="tree-row-name">{category.name}</span><span className="tree-row-count">{promptLibrary.items.filter(item => item.category === category.id).length}</span></div>)}</div><button className="asset-btn" type="button" onClick={async () => { const name = prompt('新分组名称'); if (name && promptLibrary) await run('正在创建分组…', async () => applyPrompts((await assetClient.createPromptCategory(promptLibrary.id, name)).library)); }}><Icon name="plus"/>新分组</button></div></aside>;

  const isUploadTab = tab === 'assets' || tab === 'workflows' || tab === 'local';
  const heading = tab === 'prompts' ? '提示词' : tab === 'canvas' ? '画布素材' : tab === 'local' ? (folderPath || '全部本地素材') : tab === 'shared' ? (folderPath || '共享目录') : activeCategory?.name || '未选择分组';
  const headingSub = tab === 'prompts' ? `${promptLibrary?.name || '提示词库'} / ${promptItems.length} 条` : `${activeLibrary?.name || tabs.find(item => item.id === tab)?.label || ''} / ${currentItems.length} 个素材`;

  return <div className="asset-page">
    <header className="asset-page-head"><div><div className="asset-title">素材库管理</div><div className="asset-sub">按库、分组、内容和预览管理素材与提示词。</div></div><div className="asset-head-actions"><div className="asset-status" title={status}>{status}</div><button className="asset-btn" type="button" disabled={busy} onClick={() => void refresh()}><Icon name="refresh"/>刷新</button></div></header>
    <nav className="asset-tabs" aria-label="素材类型">{tabs.map(item => <button className={tab === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => { setTab(item.id); setCategoryId(''); setFolderPath(''); }}><Icon name={item.icon}/>{item.label}</button>)}</nav>
    <div className="asset-manager-root">{side}<main className={`asset-panel asset-content ${manage ? 'manage-on' : ''}`}>
      <div className="content-toolbar"><div className="content-heading"><strong>{heading}</strong><span>{headingSub}</span></div><div className="asset-tools"><label className="asset-search-wrap"><Icon name="search"/><input className="asset-search" aria-label="搜索素材" placeholder={tab === 'prompts' ? '搜索提示词' : '搜索素材'} value={query} onChange={event => setQuery(event.target.value)}/></label>{tab === 'prompts' ? <button className="asset-btn primary" type="button" onClick={() => setPromptEdit('new')}><Icon name="plus"/>新建提示词</button> : <>{tab === 'assets' && <button className="asset-btn" type="button" onClick={() => void addUrl()}><Icon name="link"/>从 URL 添加</button>}<button className="asset-btn" type="button" onClick={() => { setManage(value => !value); setSelected(new Set()); }}><Icon name={manage ? 'check' : 'grid'}/>{manage ? '完成管理' : '批量管理'}</button></>}</div></div>
      {manage && <div className="manage-tools"><span>已选择 {selected.size} 项</span><div className="asset-tools"><button className="asset-btn" type="button" onClick={selectAll}>{selected.size === currentItems.length && currentItems.length ? '清空' : '全选'}</button>{(tab === 'assets' || tab === 'workflows') && <><button className="asset-btn" type="button" disabled={!selected.size} onClick={() => { setClipboard({ mode: 'cut', items: selectedItems, sourceLibraryId: activeLibrary!.id }); setStatus(`已剪切 ${selected.size} 项，请选择目标分组粘贴`); }}><Icon name="cut"/>剪切</button><button className="asset-btn" type="button" disabled={!selected.size} onClick={() => { setClipboard({ mode: 'copy', items: selectedItems, sourceLibraryId: activeLibrary!.id }); setStatus(`已复制 ${selected.size} 项，请选择目标分组粘贴`); }}><Icon name="copy"/>复制</button></>}<button className="asset-btn" type="button" disabled={!selected.size} onClick={() => { const count = copyItemsToCanvas(selectedItems); setStatus(`已发送 ${count} 项到智能画布收件箱`); }}><Icon name="grid"/>复制到画布</button>{(tab === 'assets' || tab === 'workflows') && <button className="asset-btn" type="button" disabled={!selected.size} onClick={() => void moveSelected()}><Icon name="move"/>移动</button>}<button className="asset-btn" type="button" disabled={!selected.size} onClick={() => void run('正在打包下载…', () => assetClient.downloadItems(selectedItems))}><Icon name="download"/>下载所选</button>{tab === 'assets' && <button className="asset-btn" type="button" disabled={!selectedItems.some(item => item.kind === 'video') || !selectedProvider} onClick={() => void batchRegister()}><Icon name="user"/>批量认证</button>}{['assets', 'workflows', 'local'].includes(tab) && <button className="asset-btn danger" type="button" disabled={!selected.size} onClick={() => void deleteItems(selectedItems)}><Icon name="trash"/>删除所选</button>}</div></div>}
      {clipboard && (tab === 'assets' || tab === 'workflows') && <div className="asset-clipboard-bar"><div className="asset-clipboard-info"><Icon name={clipboard.mode === 'cut' ? 'cut' : 'copy'}/><span>{clipboard.mode === 'cut' ? '剪切' : '复制'}了 {clipboard.items.length} 项，可切换素材库和分组</span></div><div className="asset-tools"><button className="asset-btn primary" type="button" disabled={!activeCategory} onClick={() => void pasteClipboard()}>粘贴到当前分组</button><button className="asset-icon-btn" type="button" title="取消" onClick={() => setClipboard(undefined)}><Icon name="x"/></button></div></div>}
      {tab === 'shared' && selected.size > 0 && activeLibrary && assetCategories(activeLibrary, 'image').length > 0 && <div className="manage-tools asset-shared-import"><span>导入 {selected.size} 项到</span><select className="manage-select" aria-label="导入分组" id="sharedImportCategory">{assetCategories(activeLibrary, 'image').map(category => <option value={category.id} key={category.id}>{activeLibrary.name} / {category.name}</option>)}</select><button className="asset-btn primary" type="button" onClick={() => { const category = (document.getElementById('sharedImportCategory') as HTMLSelectElement).value; void run('正在导入共享素材…', async () => applyAssets((await assetClient.importShared(activeLibrary.id, category, sharedId, selectedItems.map(item => item.relativePath || item.source_path || ''))).library)); }}>导入</button></div>}
      <div className="content-scroll" onDragEnter={event => { if (isUploadTab) { event.preventDefault(); setDragOver(true); } }} onDragOver={event => { if (isUploadTab) event.preventDefault(); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }} onDrop={dropFiles}>
        {tab === 'prompts' ? <div className="prompt-list">{promptItems.length ? promptItems.map(item => <button className={`prompt-row ${promptDetail?.id === item.id ? 'active' : ''}`} type="button" key={item.id} onClick={() => setPromptDetail(item)}><div className="prompt-row-main"><div className="prompt-row-title"><strong>{item.name || '未命名提示词'}</strong><span className="prompt-tag">{promptCategoryName(promptLibrary, item.category)}</span></div>{item.scene && <div className="prompt-row-scene">{item.scene}</div>}<div className="prompt-row-text">{item.positive}</div></div></button>) : <div className="empty-state">暂无提示词</div>}</div> : <div className="asset-grid">
          {isUploadTab && <button className={`upload-grid-card ${dragOver ? 'drag-over' : ''}`} type="button" onClick={() => fileRef.current?.click()}><span className="upload-thumb"><Icon name="upload"/></span><span className="upload-body"><strong>{tab === 'workflows' ? '上传工作流' : tab === 'local' ? '上传到当前目录' : '上传到当前分组'}</strong><small>拖入文件或点击上传</small></span></button>}
          {currentItems.map(item => <MediaCard key={item.id} item={item} active={detail?.id === item.id} checked={selected.has(item.id)} manage={manage || tab === 'shared'} onToggle={() => toggle(item.id)} onOpen={() => { setDetail(item); if (manage || tab === 'shared') toggle(item.id); }}/>) }{!currentItems.length && !isUploadTab && <div className="empty-state">当前目录暂无内容</div>}
        </div>}
      </div>
    </main>
    {tab === 'prompts' ? <aside className="asset-panel asset-detail"><div className="panel-head"><div className="panel-title"><strong>提示词详情</strong><span>{promptDetail ? promptCategoryName(promptLibrary, promptDetail.category) : '选择提示词后查看'}</span></div>{promptDetail && <div className="panel-actions"><button className="asset-icon-btn" type="button" title="编辑" onClick={() => setPromptEdit(promptDetail)}><Icon name="edit"/></button><button className="asset-icon-btn danger" type="button" title="删除" onClick={() => { if (confirm('删除这个提示词？')) void run('正在删除提示词…', async () => { applyPrompts((await assetClient.deletePrompts([promptDetail.id])).library); setPromptDetail(undefined); }); }}><Icon name="trash"/></button></div>}</div><div className="detail-scroll">{promptDetail ? <><div className="prompt-detail-head"><div className="prompt-detail-title">{promptDetail.name}</div>{promptDetail.scene && <div className="prompt-detail-scene">{promptDetail.scene}</div>}</div><div className="prompt-block"><div className="prompt-block-head">正向提示词</div><div className="prompt-block-body">{promptDetail.positive}</div></div>{promptDetail.negative && <div className="prompt-block"><div className="prompt-block-head">负向提示词</div><div className="prompt-block-body negative">{promptDetail.negative}</div></div>}</> : <div className="detail-empty"><Icon name="prompt"/>选择一条提示词</div>}</div></aside> : <DetailPanel item={detail} tab={tab} library={activeLibrary} category={activeCategory} providers={providers} selectedProvider={selectedProvider} onProvider={setSelectedProvider} onRename={(item, name) => void renameItem(item, name)} onDelete={item => void deleteItems([item])} onCaption={(item, caption) => void run('正在保存描述…', async () => { await assetClient.saveCaption(item.file || item.id, caption); await refreshLocal(); setDetail({ ...item, caption }); })} onRegister={(item, provider) => void registerAvatar(item, provider)} onCancel={(item, provider) => void cancelAvatar(item, provider)} onStatus={(item, provider) => void checkAvatar(item, provider)} onLightbox={item => { if (item.kind === 'image' || item.kind === 'video') setLightbox(item); }}/>} </div>
    <input hidden multiple ref={fileRef} type="file" accept={tab === 'workflows' ? '.json,.zip' : 'image/*,video/*,audio/*,.json,.zip'} onChange={event => { if (event.target.files) void upload(event.target.files); event.target.value = ''; }}/>
    {promptEdit && promptLibrary && (
      <PromptEditor key={promptEdit === 'new' ? 'new' : promptEdit.id} item={promptEdit === 'new' ? undefined : promptEdit} categories={promptLibrary.categories} onClose={() => setPromptEdit(null)} onSave={item => void run('正在保存提示词…', async () => { applyPrompts((await assetClient.savePrompt(promptLibrary.id, item)).library); setPromptEdit(null); })}/>
    )}
    {lightbox && <div className="asset-lightbox" role="dialog" aria-label="素材大图预览" onMouseDown={() => setLightbox(undefined)}><div className="asset-lightbox-inner" onMouseDown={event => event.stopPropagation()}>{lightbox.kind === 'video' ? <video className="asset-lightbox-video" src={lightbox.url} controls autoPlay/> : <img className="asset-lightbox-image" src={lightbox.url} alt={lightbox.name}/>}</div></div>}
  </div>;
}
