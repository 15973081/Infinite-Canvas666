import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, StudioPage } from '../../shared/page-root';
import { publishStudioEvent } from '../../shared/studio-events';
import { assetClient } from './client';
import { assetCategories, copyItemsToCanvas, firstCategory, firstLibrary, flattenTree, itemsForFolder, mediaMatches, promptCategoryName, promptMatches } from './domain';
import type { AssetCategory, AssetLibraryState, AssetTab, CanvasAssetState, FolderNode, MediaItem, PromptItem, PromptLibraryState, SharedFolder } from './types';

const tabs: Array<{ id: AssetTab; label: string }> = [
  { id: 'assets', label: '图片与媒体' }, { id: 'workflows', label: '工作流' }, { id: 'prompts', label: '提示词' },
  { id: 'canvas', label: 'Canvas 素材' }, { id: 'local', label: '本地素材' }, { id: 'shared', label: '共享目录' },
];
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';

function MediaPreview({ item }: { item: MediaItem }) {
  if (item.kind === 'video') return <video src={item.url} muted preload="metadata" />;
  if (item.kind === 'audio') return <div className="asset-kind">AUDIO</div>;
  if (item.kind === 'workflow') return <div className="asset-kind">WORKFLOW</div>;
  return <img src={item.url} alt={item.name} loading="lazy" />;
}

function MediaGrid({ items, selected, onToggle, onOpen }: { items: MediaItem[]; selected: Set<string>; onToggle: (id: string) => void; onOpen?: (item: MediaItem) => void }) {
  if (!items.length) return <EmptyState title="暂无内容">可以上传、导入或切换其他分组。</EmptyState>;
  return <div className="asset-grid">{items.map(item => <article className={`asset-card ${selected.has(item.id) ? 'selected' : ''}`} key={item.id}>
    <button type="button" className="asset-preview" onClick={() => onOpen?.(item)}><MediaPreview item={item} /></button>
    <label className="asset-check"><input aria-label={`选择 ${item.name}`} type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} /></label>
    <div className="asset-card-meta"><strong title={item.name}>{item.name}</strong><span>{item.kind}{item.canvas_name ? ` · ${item.canvas_name}` : ''}</span></div>
  </article>)}</div>;
}

function Sidebar({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <aside className="studio-card asset-sidebar"><div className="asset-sidebar-head"><strong>{title}</strong>{actions}</div>{children}</aside>;
}

function PromptEditor({ item, categories, onSave, onClose }: { item?: PromptItem; categories: Array<{ id: string; name: string }>; onSave: (item: Omit<PromptItem, 'id'> & { id?: string }) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => ({ id: item?.id, name: item?.name || '', category: item?.category || categories[0]?.id || '', positive: item?.positive || '', negative: item?.negative || '', scene: item?.scene || '' }));
  return <div className="asset-modal-backdrop" onMouseDown={onClose}><form className="studio-card asset-modal" onSubmit={event => { event.preventDefault(); if (draft.positive.trim()) onSave(draft); }} onMouseDown={event => event.stopPropagation()}>
    <div className="asset-modal-head"><h2>{item ? '编辑提示词' : '新建提示词'}</h2><button type="button" className="studio-button" onClick={onClose}>关闭</button></div>
    <div className="asset-form-grid"><label className="studio-label">名称<input className="studio-input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label className="studio-label">分组<select className="studio-input" value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div>
    <label className="studio-label">正向提示词<textarea className="studio-input" autoFocus value={draft.positive} onChange={event => setDraft({ ...draft, positive: event.target.value })} /></label>
    <label className="studio-label">负向提示词<textarea className="studio-input" value={draft.negative} onChange={event => setDraft({ ...draft, negative: event.target.value })} /></label>
    <label className="studio-label">场景备注<input className="studio-input" value={draft.scene} onChange={event => setDraft({ ...draft, scene: event.target.value })} /></label>
    <button className="studio-button primary" type="submit">保存提示词</button>
  </form></div>;
}

export function AssetStudioApp() {
  const [tab, setTab] = useState<AssetTab>('assets');
  const [assets, setAssets] = useState<AssetLibraryState>({ active_library_id: '', libraries: [] });
  const [prompts, setPrompts] = useState<PromptLibraryState>({ active_library_id: '', libraries: [] });
  const [localItems, setLocalItems] = useState<MediaItem[]>([]); const [localTree, setLocalTree] = useState<FolderNode>();
  const [sharedFolders, setSharedFolders] = useState<SharedFolder[]>([]); const [sharedTree, setSharedTree] = useState<FolderNode>();
  const [canvas, setCanvas] = useState<CanvasAssetState>({ categories: [], items: [] });
  const [libraryId, setLibraryId] = useState(''); const [categoryId, setCategoryId] = useState(''); const [promptLibraryId, setPromptLibraryId] = useState('system');
  const [folderPath, setFolderPath] = useState(''); const [sharedId, setSharedId] = useState(''); const [canvasKind, setCanvasKind] = useState('all');
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState<Set<string>>(new Set()); const [status, setStatus] = useState('正在加载素材…'); const [busy, setBusy] = useState(false);
  const [promptEdit, setPromptEdit] = useState<PromptItem | 'new' | null>(null); const [detail, setDetail] = useState<MediaItem>();
  const fileRef = useRef<HTMLInputElement>(null);

  const activeLibrary = firstLibrary(assets.libraries, libraryId || assets.active_library_id);
  const categoryKind = tab === 'workflows' ? 'workflow' : 'image';
  const categories = assetCategories(activeLibrary, categoryKind);
  const activeCategory = firstCategory(categories, categoryId);
  const promptLibrary = firstLibrary(prompts.libraries, promptLibraryId || prompts.active_library_id);
  const sharedNodes = flattenTree(sharedTree);

  const applyAssets = (next: AssetLibraryState) => { setAssets(next); const lib = firstLibrary(next.libraries, libraryId || next.active_library_id); setLibraryId(lib?.id || ''); setCategoryId(current => lib?.categories.some(category => category.id === current) ? current : lib?.categories[0]?.id || ''); };
  const applyPrompts = (next: PromptLibraryState) => { setPrompts(next); setPromptLibraryId(current => next.libraries.some(item => item.id === current) ? current : next.active_library_id); };
  const refreshLocal = async () => { const value = await assetClient.local(); setLocalItems(value.items); setLocalTree(value.tree); };
  const refreshShared = async () => { const value = await assetClient.shared(); setSharedFolders(value.folders); setSharedId(current => value.folders.some(folder => folder.id === current) ? current : value.folders[0]?.id || ''); };
  const refresh = async () => {
    setBusy(true); setStatus('正在同步素材数据…');
    try {
      const [assetValue, promptValue, localValue, sharedValue, canvasValue] = await Promise.all([assetClient.assets(), assetClient.prompts(), assetClient.local(), assetClient.shared(), assetClient.canvas()]);
      applyAssets(assetValue.library); applyPrompts(promptValue.library); setLocalItems(localValue.items); setLocalTree(localValue.tree); setSharedFolders(sharedValue.folders); setSharedId(current => sharedValue.folders.some(folder => folder.id === current) ? current : sharedValue.folders[0]?.id || ''); setCanvas(canvasValue); setStatus('已同步全部素材源');
    } catch (error) { setStatus(errorMessage(error)); } finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { setSelected(new Set()); setDetail(undefined); setQuery(''); }, [tab, libraryId, categoryId, folderPath, sharedId, canvasKind]);
  useEffect(() => { if (!sharedId) { setSharedTree(undefined); return; } assetClient.sharedTree(sharedId).then(value => setSharedTree(value.tree)).catch(error => setStatus(errorMessage(error))); }, [sharedId]);

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

  const manageLibrary = async (action: 'add' | 'rename' | 'delete') => {
    if (action === 'delete') { if (!activeLibrary || !confirm(`删除素材库“${activeLibrary.name}”及其中内容？`)) return; return run('正在删除素材库…', async () => applyAssets((await assetClient.deleteLibrary(activeLibrary.id)).library)); }
    const name = prompt(action === 'add' ? '新素材库名称' : '素材库名称', action === 'rename' ? activeLibrary?.name : '新素材库'); if (!name?.trim()) return;
    return run('正在保存素材库…', async () => applyAssets((await (action === 'add' ? assetClient.createLibrary(name) : assetClient.renameLibrary(activeLibrary!.id, name))).library));
  };
  const manageCategory = async (action: 'add' | 'rename' | 'delete') => {
    if (!activeLibrary) return;
    if (action === 'delete') { if (!activeCategory || !confirm(`删除分组“${activeCategory.name}”及其中内容？`)) return; return run('正在删除分组…', async () => applyAssets((await assetClient.deleteCategory(activeLibrary.id, activeCategory.id)).library)); }
    const name = prompt(action === 'add' ? '新分组名称' : '分组名称', action === 'rename' ? activeCategory?.name : '新分组'); if (!name?.trim()) return;
    return run('正在保存分组…', async () => applyAssets((await (action === 'add' ? assetClient.createCategory(activeLibrary.id, name, categoryKind) : assetClient.renameCategory(activeLibrary.id, activeCategory!.id, name))).library));
  };
  const deleteSelected = async () => {
    if (!selected.size || !confirm(`删除选中的 ${selected.size} 项？`)) return;
    if (tab === 'local') return run('正在删除本地素材…', async () => { await assetClient.deleteLocal(selectedItems.map(item => item.file || item.id)); await refreshLocal(); });
    if (tab === 'prompts') return run('正在删除提示词…', async () => applyPrompts((await assetClient.deletePrompts([...selected])).library));
    if ((tab === 'assets' || tab === 'workflows') && activeLibrary) return run('正在删除素材…', async () => applyAssets((await assetClient.deleteItems(activeLibrary.id, [...selected])).library));
  };
  const upload = async (files: FileList) => {
    if (tab === 'local') return run('正在上传本地素材…', async () => { await assetClient.uploadLocal(folderPath, files); await refreshLocal(); });
    if (tab === 'workflows' && activeLibrary && activeCategory) return run('正在上传工作流…', async () => applyAssets((await assetClient.uploadWorkflows(activeLibrary.id, activeCategory.id, files)).library));
  };
  const addUrl = async () => { if (!activeLibrary || !activeCategory) return; const url = prompt('本地 /assets 或 /output 素材 URL'); if (!url?.trim()) return; const name = prompt('素材名称', url.split('/').pop() || 'asset') || 'asset'; await run('正在保存素材…', async () => applyAssets((await assetClient.addUrl(activeLibrary.id, activeCategory.id, url, name)).library)); };
  const renameItem = async (item: MediaItem) => { const name = prompt('素材名称', item.name); if (!name?.trim()) return; await run('正在重命名…', async () => applyAssets((await assetClient.renameItem(item.id, name)).library)); };
  const moveSelected = async () => { if (!activeLibrary || !selected.size) return; const targets = activeLibrary.categories.filter(category => category.type === categoryKind && category.id !== activeCategory?.id); const target = targets.length === 1 ? targets[0] : targets.find(category => category.id === prompt(`目标分组 ID：\n${targets.map(item => `${item.id} — ${item.name}`).join('\n')}`)); if (!target) return; await run('正在移动素材…', async () => applyAssets((await assetClient.moveItems(activeLibrary.id, [...selected], activeLibrary.id, target.id)).library)); };

  const toolbar = <div className="asset-toolbar"><input className="studio-input asset-search" aria-label="搜索" placeholder="搜索名称、描述或画布…" value={query} onChange={event => setQuery(event.target.value)} /><button className="studio-button" type="button" disabled={!currentItems.length} onClick={selectAll}>{selected.size === currentItems.length && currentItems.length ? '取消全选' : '全选'}</button>
    {(tab === 'local' || tab === 'workflows') && <button className="studio-button primary" type="button" onClick={() => fileRef.current?.click()}>上传</button>}{tab === 'assets' && <button className="studio-button primary" type="button" onClick={() => void addUrl()}>从 URL 添加</button>}
    {selected.size > 0 && <><button className="studio-button" type="button" onClick={() => setStatus(`已写入 ${copyItemsToCanvas(selectedItems)} 项到 Smart Canvas 收件箱`)}>发送到 Canvas</button>{(tab === 'assets' || tab === 'workflows') && <button className="studio-button" type="button" onClick={() => void moveSelected()}>移动</button>}{tab === 'canvas' && <button className="studio-button" type="button" onClick={() => void run('正在打包下载…', () => assetClient.downloadCanvas(selectedItems))}>下载 ZIP</button>}{['assets','workflows','local'].includes(tab) && <button className="studio-button danger" type="button" onClick={() => void deleteSelected()}>删除</button>}</>}
    <input hidden multiple ref={fileRef} type="file" accept={tab === 'workflows' ? '.json,.zip' : 'image/*,video/*,audio/*,.json,.zip'} onChange={event => { if (event.target.files) void upload(event.target.files); event.target.value = ''; }} /></div>;

  const librarySidebar = <Sidebar title="素材库" actions={<div><button type="button" onClick={() => void manageLibrary('add')}>＋</button><button type="button" onClick={() => void manageLibrary('rename')}>✎</button><button type="button" onClick={() => void manageLibrary('delete')}>×</button></div>}>
    <select className="studio-input" aria-label="素材库" value={activeLibrary?.id || ''} onChange={event => { setLibraryId(event.target.value); setCategoryId(''); }}>{assets.libraries.map(library => <option value={library.id} key={library.id}>{library.name}</option>)}</select>
    <div className="asset-side-label"><span>{categoryKind === 'workflow' ? '工作流分组' : '媒体分组'}</span><div><button type="button" onClick={() => void manageCategory('add')}>＋</button><button type="button" onClick={() => void manageCategory('rename')}>✎</button><button type="button" onClick={() => void manageCategory('delete')}>×</button></div></div>
    <nav className="asset-side-list">{categories.map(category => <button className={activeCategory?.id === category.id ? 'active' : ''} type="button" key={category.id} onClick={() => setCategoryId(category.id)}><span>{category.name}</span><small>{category.items.length}</small></button>)}</nav>
  </Sidebar>;

  let content: React.ReactNode;
  if (tab === 'prompts') content = <><Sidebar title="提示词库" actions={<button type="button" onClick={async () => { const name = prompt('新提示词库名称'); if (name) await run('正在创建提示词库…', async () => applyPrompts((await assetClient.createPromptLibrary(name)).library)); }}>＋</button>}><select className="studio-input" value={promptLibrary?.id || ''} onChange={event => setPromptLibraryId(event.target.value)}>{prompts.libraries.map(library => <option value={library.id} key={library.id}>{library.name}</option>)}</select><nav className="asset-side-list">{promptLibrary?.categories.map(category => <div className="asset-static-row" key={category.id}><span>{category.name}</span><small>{promptLibrary.items.filter(item => item.category === category.id).length}</small></div>)}</nav><button className="studio-button" type="button" onClick={async () => { const name = prompt('新分组名称'); if (name && promptLibrary) await run('正在创建分组…', async () => applyPrompts((await assetClient.createPromptCategory(promptLibrary.id, name)).library)); }}>＋ 新分组</button></Sidebar><main className="asset-main"><div className="asset-toolbar"><input className="studio-input asset-search" placeholder="搜索提示词…" value={query} onChange={event => setQuery(event.target.value)} /><button className="studio-button primary" type="button" onClick={() => setPromptEdit('new')}>新建提示词</button>{selected.size > 0 && <button className="studio-button danger" type="button" onClick={() => void deleteSelected()}>删除 {selected.size} 项</button>}</div>{promptItems.length ? <div className="prompt-grid">{promptItems.map(item => <article className="studio-card prompt-card" key={item.id}><label><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} /></label><button type="button" onClick={() => setPromptEdit(item)}><strong>{item.name}</strong><small>{promptCategoryName(promptLibrary, item.category)}</small><p>{item.positive}</p>{item.negative && <em>负向：{item.negative}</em>}</button></article>)}</div> : <EmptyState title="暂无提示词" />}</main></>;
  else if (tab === 'local') content = <><Sidebar title="本地目录" actions={<button type="button" onClick={async () => { const name = prompt('新文件夹名称'); if (name) await run('正在创建文件夹…', async () => { const value = await assetClient.createLocalFolder(folderPath, name); setLocalItems(value.items); setLocalTree(value.tree); }); }}>＋</button>}><nav className="asset-side-list">{flattenTree(localTree).map(node => <button className={folderPath === node.path ? 'active' : ''} type="button" key={node.id} onClick={() => setFolderPath(node.path)}><span>{node.name}</span><small>{node.count ?? node.items.length}</small></button>)}</nav></Sidebar><main className="asset-main">{toolbar}<MediaGrid items={currentItems} selected={selected} onToggle={toggle} onOpen={setDetail} /></main></>;
  else if (tab === 'shared') content = <><Sidebar title="共享目录" actions={<button type="button" onClick={async () => { const path = prompt('服务器可访问的目录路径'); if (!path) return; const name = prompt('显示名称', path.split(/[\\/]/).pop()) || ''; await run('正在注册共享目录…', async () => { await assetClient.registerShared(path, name); await refreshShared(); }); }}>＋</button>}><select className="studio-input" value={sharedId} onChange={event => { setSharedId(event.target.value); setFolderPath(''); }}>{sharedFolders.map(folder => <option value={folder.id} key={folder.id}>{folder.name}{folder.exists ? '' : '（不可用）'}</option>)}</select>{sharedId && <button className="studio-button danger" type="button" onClick={async () => { if (confirm('取消注册此共享目录？')) await run('正在移除共享目录…', async () => { await assetClient.removeShared(sharedId); await refreshShared(); }); }}>取消注册</button>}<nav className="asset-side-list">{sharedNodes.map(node => <button className={folderPath === node.path ? 'active' : ''} type="button" key={node.id} onClick={() => setFolderPath(node.path)}><span>{node.name}</span><small>{node.items.length}</small></button>)}</nav></Sidebar><main className="asset-main">{toolbar}{selected.size > 0 && activeLibrary && assetCategories(activeLibrary, 'image').length > 0 && <div className="asset-import-bar"><span>将 {selected.size} 项导入</span><select className="studio-input" id="sharedImportCategory">{assetCategories(activeLibrary, 'image').map(category => <option value={category.id} key={category.id}>{activeLibrary.name} / {category.name}</option>)}</select><button className="studio-button primary" type="button" onClick={() => { const category = (document.getElementById('sharedImportCategory') as HTMLSelectElement).value; void run('正在导入共享素材…', async () => applyAssets((await assetClient.importShared(activeLibrary.id, category, sharedId, selectedItems.map(item => item.relativePath || ''))).library)); }}>导入</button></div>}<MediaGrid items={currentItems} selected={selected} onToggle={toggle} onOpen={setDetail} /></main></>;
  else if (tab === 'canvas') content = <><Sidebar title="Canvas 类型"><nav className="asset-side-list">{canvas.categories.map(category => <button className={canvasKind === category.id ? 'active' : ''} type="button" key={category.id} onClick={() => setCanvasKind(category.id)}><span>{category.name}</span><small>{category.count}</small></button>)}</nav></Sidebar><main className="asset-main">{toolbar}<MediaGrid items={currentItems} selected={selected} onToggle={toggle} onOpen={setDetail} /></main></>;
  else content = <>{librarySidebar}<main className="asset-main">{toolbar}<MediaGrid items={currentItems} selected={selected} onToggle={toggle} onOpen={item => setDetail(item)} /></main></>;

  return <StudioPage title="素材工作台" subtitle="统一管理媒体、工作流、提示词、本地上传、共享目录与 Canvas 素材。" status={status}><div className="studio-tabs asset-tabs">{tabs.map(item => <button className={tab === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => { setTab(item.id); setCategoryId(''); setFolderPath(''); }}>{item.label}</button>)}<button type="button" disabled={busy} onClick={() => void refresh()}>刷新</button></div><div className="asset-layout">{content}</div>
    {promptEdit && promptLibrary && <PromptEditor key={promptEdit === 'new' ? 'new' : promptEdit.id} item={promptEdit === 'new' ? undefined : promptEdit} categories={promptLibrary.categories} onClose={() => setPromptEdit(null)} onSave={item => void run('正在保存提示词…', async () => { applyPrompts((await assetClient.savePrompt(promptLibrary.id, item)).library); setPromptEdit(null); })} />}
    {detail && <div className="asset-modal-backdrop" onMouseDown={() => setDetail(undefined)}><div className="studio-card asset-detail" onMouseDown={event => event.stopPropagation()}><MediaPreview item={detail} /><div><h2>{detail.name}</h2><p>{detail.caption || detail.url}</p>{(tab === 'assets' || tab === 'workflows') && <button className="studio-button" type="button" onClick={() => void renameItem(detail)}>重命名</button>}{tab === 'local' && detail.kind === 'image' && <button className="studio-button" type="button" onClick={async () => { const caption = prompt('素材描述', detail.caption || ''); if (caption !== null) await run('正在保存描述…', async () => { await assetClient.saveCaption(detail.file || detail.id, caption); await refreshLocal(); setDetail({ ...detail, caption }); }); }}>编辑描述</button>}<a className="studio-button primary" href={detail.url} target="_blank" rel="noreferrer">打开原文件</a></div></div></div>}
  </StudioPage>;
}
