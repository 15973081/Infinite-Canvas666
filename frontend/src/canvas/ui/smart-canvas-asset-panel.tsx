import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react';
import {
  canvasAssetLibraryClient,
  type CanvasAssetCategory,
  type CanvasAssetItem,
  type CanvasAssetLibraryState,
} from '../infrastructure/asset-library-client';
import type { CanvasAssetLibraryRequest } from './asset-library-dialog';

const EMPTY_LIBRARY: CanvasAssetLibraryState = { active_library_id: '', libraries: [] };

type AssetTab = 'image' | 'workflow';
type NameDialog = { category?: CanvasAssetCategory; kind: 'category-new' | 'category-rename'; value: string } | null;

export function SmartCanvasAssetPanel({ onClose, request }: { onClose(): void; request: CanvasAssetLibraryRequest }) {
  const [state, setState] = useState(EMPTY_LIBRARY);
  const [libraryId, setLibraryId] = useState('');
  const [categoryIds, setCategoryIds] = useState<Record<AssetTab, string>>({ image: '', workflow: '' });
  const [tab, setTab] = useState<AssetTab>(request.saveWorkflow ? 'workflow' : 'image');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('正在加载资产库…');
  const [dragOver, setDragOver] = useState(false);
  const [renameId, setRenameId] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  const [hover, setHover] = useState<{ item: CanvasAssetItem; left: number; top: number } | null>(null);
  const library = state.libraries.find((item) => item.id === libraryId) ?? state.libraries[0];
  const categories = useMemo(() => (library?.categories || []).filter((item) => item.type === tab), [library, tab]);
  const category = categories.find((item) => item.id === categoryIds[tab]) ?? categories[0];
  const items = useMemo(() => smartCanvasAssetItems(category, query), [category, query]);

  const adopt = (next: CanvasAssetLibraryState, preferredLibrary = library?.id || libraryId, preferredCategory = category?.id || '') => {
    setState(next);
    const nextLibrary = next.libraries.find((item) => item.id === preferredLibrary)
      ?? next.libraries.find((item) => item.id === next.active_library_id)
      ?? next.libraries[0];
    setLibraryId(nextLibrary?.id || '');
    setCategoryIds((current) => ({
      image: nextLibrary?.categories.find((item) => item.type === 'image' && item.id === (tab === 'image' ? preferredCategory : current.image))?.id
        || nextLibrary?.categories.find((item) => item.type === 'image')?.id || '',
      workflow: nextLibrary?.categories.find((item) => item.type === 'workflow' && item.id === (tab === 'workflow' ? preferredCategory : current.workflow))?.id
        || nextLibrary?.categories.find((item) => item.type === 'workflow')?.id || '',
    }));
  };

  useEffect(() => {
    let active = true;
    void canvasAssetLibraryClient.list().then((response) => {
      if (!active) return;
      adopt(response.library, response.library.active_library_id, '');
      setStatus('');
    }).catch((error) => active && setStatus(errorMessage(error)));
    return () => { active = false; };
    // The panel mirrors the legacy one-shot load on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
  }, [items.length, nameDialog, renameId, tab]);

  const mutate = async (action: () => ReturnType<typeof canvasAssetLibraryClient.list>, success: string, preferredCategory = category?.id || '') => {
    try {
      const response = await action();
      adopt(response.library, library?.id, preferredCategory);
      setStatus(success);
      return response;
    } catch (error) { setStatus(errorMessage(error)); return null; }
  };
  const switchLibrary = (nextId: string) => {
    const next = state.libraries.find((item) => item.id === nextId);
    setLibraryId(nextId);
    setCategoryIds({ image: next?.categories.find((item) => item.type === 'image')?.id || '', workflow: next?.categories.find((item) => item.type === 'workflow')?.id || '' });
  };
  const saveNameDialog = async () => {
    if (!nameDialog || !library || !nameDialog.value.trim()) return;
    if (nameDialog.kind === 'category-new') {
      const response = await mutate(() => canvasAssetLibraryClient.createCategory(library.id, nameDialog.value.trim(), tab), '文件夹已创建', '');
      if (response?.category) adopt(response.library, library.id, response.category.id);
    } else if (nameDialog.category) await mutate(() => canvasAssetLibraryClient.renameCategory(library.id, nameDialog.category!.id, nameDialog.value.trim()), '文件夹已重命名');
    setNameDialog(null);
  };
  const finishRename = async (save: boolean) => {
    const id = renameId; const value = renameValue.trim();
    setRenameId(''); setRenameValue('');
    if (!save || !id || !value) return;
    await mutate(() => canvasAssetLibraryClient.renameItem(id, value), '素材已重命名');
  };
  const addItems = async (entries: Array<{ name: string; url: string }>) => {
    if (!library || !category || category.type !== 'image' || library.readonly || category.readonly) { setStatus('请先选择可编辑的图片文件夹'); return; }
    const valid = entries.filter((item) => item.url);
    if (!valid.length) return;
    await mutate(() => valid.length === 1
      ? canvasAssetLibraryClient.addUrl(library.id, category.id, valid[0].url, valid[0].name)
      : canvasAssetLibraryClient.addBatch(library.id, category.id, valid), `已保存 ${valid.length} 个素材`);
  };
  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation(); setDragOver(false);
    if (tab !== 'image') return;
    const canvasImage = event.dataTransfer.getData('application/x-smart-canvas-image');
    if (canvasImage) {
      try { const item = JSON.parse(canvasImage) as { name?: string; url?: string }; if (item.url) await addItems([{ name: item.name || mediaName(item.url), url: item.url }]); }
      catch { setStatus('素材拖入失败'); }
      return;
    }
    const files = [...event.dataTransfer.files].filter((file) => /^(image|video|audio)\//.test(file.type));
    if (files.length) {
      try {
        const uploaded = await canvasAssetLibraryClient.upload(files);
        await addItems((uploaded.files || []).flatMap((item, index) => item.url ? [{ name: item.name || files[index]?.name || 'asset', url: item.url }] : []));
      } catch (error) { setStatus(errorMessage(error)); }
      return;
    }
    const url = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
    if (/^(?:https?:\/\/|\/)/i.test(url)) await addItems([{ name: mediaName(url), url }]);
  };
  const saveRequested = async () => {
    if (request.saveWorkflow) {
      if (!library || !category || category.type !== 'workflow') { setStatus('请选择工作流文件夹'); return; }
      const response = await mutate(() => canvasAssetLibraryClient.saveWorkflow(library.id, category.id, request.saveWorkflow!), '工作流已保存到资产库');
      if (response?.item) onClose();
      return;
    }
    if (request.saveItem?.url) { await addItems([{ name: request.saveItem.name || mediaName(request.saveItem.url), url: request.saveItem.url }]); onClose(); }
  };

  return <>
    <aside className={`asset-panel open ${dragOver ? 'drag-over' : ''}`} id="assetPanel" onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false); }} onDragOver={(event) => { if (tab === 'image') { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setDragOver(true); } }} onDrop={(event) => void handleDrop(event)} onPointerDown={(event) => event.stopPropagation()}>
      <div className="asset-head"><div className="asset-title"><i data-lucide="library" /><span>资产库</span></div><button className="asset-mini-btn" id="assetCloseBtn" onClick={onClose} title="关闭" type="button"><i data-lucide="chevron-right" /></button></div>
      <div className="asset-tabs">{(['image', 'workflow'] as const).map((value) => <button className={`asset-tab ${tab === value ? 'active' : ''}`} data-asset-tab={value} key={value} onClick={() => { setTab(value); setQuery(''); }} type="button">{value === 'image' ? '图片资产' : '工作流'}</button>)}</div>
      <div id="assetImageControls">
        <select className="asset-category-select asset-library-select" id="assetLibrarySelect" onChange={(event) => switchLibrary(event.target.value)} title="选择资产库" value={library?.id || ''}>{state.libraries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <div className="asset-category-row"><select className="asset-category-select" id="assetCategorySelect" onChange={(event) => setCategoryIds((current) => ({ ...current, [tab]: event.target.value }))} value={category?.id || ''}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <button className="asset-mini-btn" disabled={!library || library.readonly} id="assetAddCategoryBtn" onClick={() => setNameDialog({ kind: 'category-new', value: tab === 'workflow' ? '工作流' : '素材' })} title="新建文件夹" type="button"><i data-lucide="folder-plus" /></button>
          <button className="asset-mini-btn" disabled={!category || library?.readonly || category?.readonly} id="assetRenameCategoryBtn" onClick={() => category && setNameDialog({ category, kind: 'category-rename', value: category.name })} title="重命名文件夹" type="button"><i data-lucide="pencil" /></button>
        </div>
      </div>
      <label className="asset-name-search"><i data-lucide="search" /><input autoComplete="off" id="assetNameSearch" onChange={(event) => setQuery(event.target.value)} placeholder="搜索素材名称" type="search" value={query} /></label>
      <div className={`asset-drop-zone ${dragOver ? 'drag-over' : ''}`} id="assetDropZone" onClick={() => { if (request.saveItem || request.saveWorkflow) void saveRequested(); }}>{request.saveWorkflow ? '保存当前工作流到当前文件夹' : request.saveItem ? '保存当前素材到当前文件夹' : '把画布图片拖到这里保存到当前文件夹'}</div>
      <div className="asset-grid" id="assetGrid">{items.length ? items.map((item) => <article className={`asset-item ${tab === 'workflow' ? 'workflow-asset-item' : ''}`} data-asset-id={item.id} data-kind={item.kind} data-name={item.name} data-url={item.url} draggable={tab === 'image'} key={item.id} onDoubleClick={() => { if (item.kind === 'workflow') void request.onImportWorkflow?.(item); else request.onInsert?.(item); }} onDragStart={(event) => {
        if (tab !== 'image') { event.preventDefault(); return; }
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-smart-asset', JSON.stringify({ asset_item_id: item.id, asset_uris: item.asset_uris || authenticatedUris(item), kind: item.kind, name: item.name, url: item.url }));
        event.dataTransfer.setData('text/plain', item.url);
      }}>
        <div className="asset-thumb-wrap" onMouseEnter={(event) => setHoverFromEvent(event, item, setHover)} onMouseLeave={() => setHover(null)} onMouseMove={(event) => setHoverFromEvent(event, item, setHover)}>{assetThumb(item)}{avatarBadge(item)}</div>
        <div className="asset-meta">{renameId === item.id ? <input aria-label="重命名素材" autoFocus className="asset-rename-input" onBlur={() => void finishRename(true)} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void finishRename(true); if (event.key === 'Escape') void finishRename(false); }} onPointerDown={(event) => event.stopPropagation()} value={renameValue} /> : <span className="asset-name" title={item.name}>{item.name || 'asset'}</span>}{avatarStatusLabel(item)}
          {!library?.readonly && !category?.readonly ? <><button className="asset-mini-btn" data-rename-asset={item.id} onClick={(event) => { event.stopPropagation(); setRenameId(item.id); setRenameValue(item.name || 'asset'); }} title="重命名" type="button"><i data-lucide="pencil" /></button><button className="asset-mini-btn" data-delete-asset={item.id} onClick={(event) => { event.stopPropagation(); void mutate(() => canvasAssetLibraryClient.deleteItem(library!.id, item.id), '素材已删除'); }} title="删除" type="button"><i data-lucide="trash-2" /></button></> : null}
        </div>
      </article>) : <div className="asset-empty">{query && category?.items.length ? '没有找到匹配名称的素材' : tab === 'workflow' ? '暂无工作流资产' : '当前文件夹暂无素材'}</div>}</div>
      <div className="workflow-empty" id="workflowEmpty" style={{ display: 'none' }}>工作流资产先预留在这里，后续接入。</div>
      {status ? <div className="asset-empty" role="status">{status}</div> : null}
    </aside>
    <div className={`asset-dialog-backdrop ${nameDialog ? 'open' : ''}`} hidden={!nameDialog} id="assetDialogBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNameDialog(null); }}><div className="asset-dialog"><div className="asset-dialog-title"><i data-lucide="folder-pen" /><span id="assetDialogTitle">{nameDialog?.kind === 'category-new' ? '新建文件夹' : '重命名文件夹'}</span></div><textarea autoComplete="off" className="asset-dialog-input" id="assetDialogInput" onChange={(event) => setNameDialog((current) => current ? { ...current, value: event.target.value } : current)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveNameDialog(); } if (event.key === 'Escape') setNameDialog(null); }} rows={1} value={nameDialog?.value || ''} /><select className="asset-dialog-input" hidden id="assetDialogTarget" /><div className="asset-dialog-actions"><button className="asset-dialog-btn secondary" id="assetDialogCancel" onClick={() => setNameDialog(null)} type="button">取消</button><button className="asset-dialog-btn primary" id="assetDialogOk" onClick={() => void saveNameDialog()} type="button">确定</button></div></div></div>
    {hover ? <div className="asset-hover-preview" id="assetHoverPreview" style={{ display: 'block', left: hover.left, top: hover.top }}>{hover.item.kind === 'video' ? <video autoPlay loop muted playsInline src={hover.item.url} /> : <img alt="asset preview" src={hover.item.thumbnail || hover.item.url} />}<div className="asset-hover-name">{hover.item.name}</div></div> : null}
  </>;
}

function assetThumb(item: CanvasAssetItem) {
  if (item.kind === 'video') return <><video className="asset-thumb" muted preload="metadata" src={item.thumbnail || item.url} /><span className="asset-video-badge"><i data-lucide="film" />VIDEO</span></>;
  if (item.kind === 'audio') return <div className="media-thumb audio-thumb asset-thumb"><i data-lucide="file-audio" /><span>{item.name || 'Audio'}</span></div>;
  if (item.kind === 'workflow') return <div className="media-thumb workflow-thumb asset-thumb"><i data-lucide="workflow" /><span>{item.name || 'Workflow'}</span></div>;
  return <img alt="" className="asset-thumb" src={item.thumbnail || item.url} />;
}

export function smartCanvasAssetItems(category: CanvasAssetCategory | undefined, query: string): CanvasAssetItem[] {
  const needle = query.trim().toLocaleLowerCase();
  return (category?.items || []).filter((item) => !needle || String(item.name || '').toLocaleLowerCase().includes(needle));
}

function registration(item: CanvasAssetItem) { return item.registrations?.volcengine; }
export function smartCanvasAssetAvatarState(item: CanvasAssetItem): 'active' | 'failed' | 'none' | 'processing' {
  if (item.asset_uris?.volcengine || registration(item)?.status === 'Active') return 'active';
  if (registration(item)?.status === 'Processing') return 'processing';
  if (registration(item)?.status === 'Failed') return 'failed';
  return 'none';
}
function authenticatedUris(item: CanvasAssetItem): Record<string, string> { const value = registration(item); return value?.status === 'Active' && value.asset_uri ? { volcengine: value.asset_uri } : {}; }
function avatarBadge(item: CanvasAssetItem) { return smartCanvasAssetAvatarState(item) === 'active' ? <span className="smart-face-verified-badge" title="头像认证已通过"><i data-lucide="badge-check" /></span> : null; }
function avatarStatusLabel(item: CanvasAssetItem) {
  const status = smartCanvasAssetAvatarState(item);
  if (status === 'processing') return <span className="asset-local-tag" title="头像认证中">认证中</span>;
  if (status === 'failed') return <span className="asset-local-tag" title={registration(item)?.detail || '头像认证失败'}>认证失败</span>;
  return null;
}
function setHoverFromEvent(event: MouseEvent<HTMLElement>, item: CanvasAssetItem, setHover: (value: { item: CanvasAssetItem; left: number; top: number }) => void) {
  const width = 260; const height = 300; const pad = 14;
  let left = event.clientX - width - 16; if (left < pad) left = event.clientX + 16;
  setHover({ item, left: Math.max(pad, Math.min(window.innerWidth - width - pad, left)), top: Math.max(pad, Math.min(window.innerHeight - height - pad, event.clientY + 12)) });
}
function mediaName(url: string): string { try { return decodeURIComponent(url.split(/[?#]/, 1)[0].split('/').pop() || 'asset'); } catch { return 'asset'; } }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
