import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { CanvasFolder, CanvasManagementClient, CanvasSummary } from '../infrastructure/canvas-management';

const CANVAS_COLORS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink', 'slate'];
const CANVAS_ICONS = ['layers', 'sparkles', 'image', 'palette', 'wand-2', 'star', 'heart', 'rocket', 'flame', 'moon', 'cloud', 'leaf', 'gem', 'compass', 'pin', 'flag', 'bookmark', 'crown'];

export interface CanvasManagerConfiguration {
  createLabel?: string;
  defaultTitle?: string;
  heading?: string;
  kind?: 'classic' | 'smart';
  managerBackHref?: string;
  subtitle?: string;
}

export interface CanvasManagerProps {
  canvases: CanvasSummary[];
  configuration: CanvasManagerConfiguration;
  folders: CanvasFolder[];
  management: CanvasManagementClient;
  onOpen(canvas: CanvasSummary): Promise<void>;
  onRefresh(): Promise<void>;
  onStatus(status: string): void;
  status: string;
  trash: CanvasSummary[];
}

type CreateKind = 'classic' | 'smart';
type SortMode = 'name' | 'recent';

export function CanvasManager({ canvases, configuration, folders, management, onOpen, onRefresh, onStatus, status, trash }: CanvasManagerProps) {
  const [activeFolder, setActiveFolder] = useState('all');
  const [createKind, setCreateKind] = useState<CreateKind>(configuration.kind ?? 'classic');
  const [createTitle, setCreateTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [metaAnchor, setMetaAnchor] = useState({ left: 0, top: 0 });
  const [metaCanvasId, setMetaCanvasId] = useState('');
  const [movingCanvasId, setMovingCanvasId] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState('');
  const [pendingPurgeId, setPendingPurgeId] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>(() => localStorage.getItem('canvasSortMode') === 'name' ? 'name' : 'recent');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(() => {
    if (showTrash) return [...trash];
    const filtered = activeFolder === 'all' ? canvases : canvases.filter((item) => normalizeFolderId(item.folder_id) === activeFolder);
    return filtered.sort((a, b) => compareCanvases(a, b, sortMode));
  }, [activeFolder, canvases, showTrash, sortMode, trash]);

  useEffect(() => {
    if (activeFolder !== 'all' && activeFolder && !folders.some((folder) => folder.id === activeFolder)) setActiveFolder('');
  }, [activeFolder, folders]);
  useEffect(() => {
    if (!creating) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [creating]);
  useEffect(() => {
    refreshIcons();
  }, [activeFolder, creating, editingTitle, folders, metaCanvasId, movingCanvasId, pendingDeleteId, pendingPurgeId, showTrash, sortMode, visible]);
  useEffect(() => {
    const close = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (movingCanvasId && !target?.closest('.canvas-folder-menu,.canvas-folder-btn')) setMovingCanvasId('');
      if (metaCanvasId && !target?.closest('.canvas-meta-pop,.canvas-preview-mark,.canvas-owner-chip')) setMetaCanvasId('');
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [metaCanvasId, movingCanvasId]);

  const beginCreate = (kind: CreateKind) => {
    setCreateKind(kind);
    setCreating(true);
    setShowTrash(false);
    setCreateTitle('');
    onStatus('请输入画布名称');
  };
  const cancelCreate = () => {
    setCreating(false);
    setCreateTitle('');
    onStatus(canvases.length ? '请选择一个画布' : '还没有画布，新建一个开始创作。');
  };
  const createCanvas = async () => {
    const kind = configuration.kind ?? createKind;
    const defaultName = configuration.defaultTitle || (kind === 'smart' ? '新智能画布' : '新画布');
    const title = createTitle.trim() || `${defaultName} ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    onStatus('正在创建…');
    try {
      const created = await management.create(title, {
        folderId: activeFolder === 'all' ? '' : activeFolder,
        icon: kind === 'smart' ? 'sparkles' : '🧩',
        kind,
      });
      setCreating(false);
      setCreateTitle('');
      await onRefresh();
      if (kind === 'smart' && configuration.kind !== 'smart') {
        window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(created.id)}&v=2026.07.23.3`;
        return;
      }
      await onOpen(created);
    } catch (error) {
      onStatus(errorMessage(error, '新建画布失败'));
    }
  };
  const openCanvas = async (item: CanvasSummary) => {
    if (item.kind === 'smart' && configuration.kind !== 'smart') {
      window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(item.id)}&v=2026.07.23.3`;
      return;
    }
    await onOpen(item);
  };
  const createFolder = async (parentId = '') => {
    const name = window.prompt('文件夹名称')?.trim();
    if (!name) return;
    try {
      const created = await management.createFolder(name, parentId);
      setActiveFolder(created.id);
      await onRefresh();
    } catch (error) { onStatus(errorMessage(error, '新建文件夹失败')); }
  };
  const renameFolder = async (folder: CanvasFolder) => {
    const name = window.prompt('文件夹名称', String(folder.name || ''))?.trim();
    if (!name || name === folder.name) return;
    try { await management.updateFolder(folder.id, { name }); await onRefresh(); }
    catch (error) { onStatus(errorMessage(error, '重命名文件夹失败')); }
  };
  const deleteFolder = async (folder: CanvasFolder) => {
    if (!window.confirm('删除该文件夹？其中的画布和子文件夹会移动到上一级。')) return;
    try {
      await management.deleteFolder(folder.id);
      if (activeFolder === folder.id) setActiveFolder(normalizeFolderId(folder.parent_id));
      await onRefresh();
    } catch (error) { onStatus(errorMessage(error, '删除文件夹失败')); }
  };
  const moveCanvas = async (canvasId: string, folderId: string) => {
    setMovingCanvasId('');
    try { await management.moveToFolder(canvasId, folderId); await onRefresh(); }
    catch (error) { onStatus(errorMessage(error, '移动画布失败')); }
  };
  const patchMeta = async (canvasId: string, patch: Record<string, unknown>, failure: string) => {
    try { await management.patchMeta(canvasId, patch); await onRefresh(); }
    catch (error) { onStatus(errorMessage(error, failure)); }
  };
  const removeCanvas = async (canvasId: string) => {
    onStatus('正在移入回收站…');
    try { await management.delete(canvasId); setPendingDeleteId(''); await onRefresh(); onStatus('已移入回收站'); }
    catch (error) { onStatus(errorMessage(error, '移入回收站失败')); }
  };
  const restoreCanvas = async (canvasId: string) => {
    onStatus('正在恢复…');
    try { await management.restore(canvasId); await onRefresh(); onStatus('已恢复'); }
    catch (error) { onStatus(errorMessage(error, '恢复失败')); }
  };
  const purgeCanvas = async (canvasId: string) => {
    onStatus('正在删除…');
    try { await management.purge(canvasId); setPendingPurgeId(''); await onRefresh(); onStatus('已彻底删除'); }
    catch (error) { onStatus(errorMessage(error, '彻底删除失败')); }
  };
  const dropCanvas = (event: DragEvent, folderId: string) => {
    event.preventDefault();
    const canvasId = event.dataTransfer.getData('text/canvas-id');
    if (canvasId) void moveCanvas(canvasId, folderId === 'all' ? '' : folderId);
  };
  const setSort = (mode: SortMode) => {
    setSortMode(mode);
    localStorage.setItem('canvasSortMode', mode);
  };

  const combinedManager = !configuration.kind;
  return <main className="canvas-modern-manager">
    <div className={`canvas-gate${creating ? ' creating' : ''}${showTrash ? ' trash-mode' : ''}`}>
      <div className="gate-panel">
        <div className="gate-head">
          <div className="gate-head-text">
            <button className="gate-back-link" onClick={() => setShowTrash(false)} type="button"><Icon name="arrow-left" size={14} /><span>返回画布列表</span></button>
            <div className="gate-title-row">
              <div className="gate-title">{showTrash ? '回收站' : configuration.heading || '选择画布'}</div>
              <span className="gate-count-pill">{visible.length}</span>
            </div>
            <div className="gate-subtitle">{showTrash ? '恢复误删的画布，或彻底删除不再需要的内容。' : configuration.subtitle || '打开已有画布，或新建一个开始创作。'}</div>
          </div>
          <div className="gate-head-actions">
            <div className={`gate-sort${showTrash ? ' hidden' : ''}`} role="group" aria-label="排序方式">
              <button className={`gate-sort-btn${sortMode === 'recent' ? ' active' : ''}`} data-sort="recent" onClick={() => setSort('recent')} type="button">最近编辑</button>
              <button className={`gate-sort-btn${sortMode === 'name' ? ' active' : ''}`} data-sort="name" onClick={() => setSort('name')} type="button">名称</button>
            </div>
            {configuration.managerBackHref ? <a className="gate-icon-btn" href={configuration.managerBackHref} title="返回画布列表" aria-label="返回画布列表"><Icon name="arrow-left" /></a> : null}
            <button className="gate-icon-btn" onClick={() => void onRefresh()} title="刷新列表" aria-label="刷新列表" type="button"><Icon name="refresh-cw" /></button>
            <button className="gate-icon-btn gate-trash-entry" onClick={() => { setShowTrash(true); setCreating(false); }} title="打开回收站" aria-label="打开回收站" type="button">
              <Icon name="trash-2" /><span className={`gate-trash-badge${trash.length ? ' visible' : ''}`}>{trash.length}</span>
            </button>
            <button className="gate-icon-btn gate-manager-btn" hidden title="资产库管理" aria-label="资产库管理" type="button"><Icon name="library" /><span>素材库管理</span></button>
            <button className="primary-btn" onClick={() => beginCreate(configuration.kind ?? 'classic')} type="button"><Icon name="plus" /><span>{configuration.createLabel || '新建画布'}</span></button>
            {combinedManager ? <button className="smart-create-btn" onClick={() => beginCreate('smart')} type="button"><Icon name="sparkles" /><span>新建智能画布</span></button> : null}
          </div>
        </div>
        <div className="gate-status">{status}</div>
        <div className="gate-create-row">
          <input className="gate-name-input" maxLength={80} onChange={(event) => setCreateTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createCanvas(); if (event.key === 'Escape') cancelCreate(); }} placeholder={createKind === 'smart' ? '新智能画布名称（可留空使用默认）' : '新画布名称（可留空使用默认）'} ref={inputRef} type="text" value={createTitle} />
          <button className="create-confirm" onClick={() => void createCanvas()} title="确定" aria-label="确定" type="button"><Icon name="check" /></button>
          <button className="create-cancel" onClick={cancelCreate} title="取消" aria-label="取消" type="button"><Icon name="x" /></button>
        </div>
        <div className="trash-note"><Icon name="info" size={14} /><span>回收站中的画布会在 30 天后自动清理。</span></div>
        <div className="gate-browser">
          <aside className="gate-folder-pane" aria-label="画布文件夹">
            <div className="gate-folder-head"><span>文件夹</span><button className="gate-folder-add" onClick={() => void createFolder('')} title="新建文件夹" aria-label="新建文件夹" type="button"><Icon name="folder-plus" size={14} /></button></div>
            <div className="gate-folder-tree">
              <FolderRow active={activeFolder === 'all'} count={canvases.length} icon="layout-grid" id="all" name="全部画布" onDrop={dropCanvas} onSelect={setActiveFolder} />
              <FolderRow active={activeFolder === ''} count={countFolderCanvases(canvases, '')} icon="inbox" id="" name="未分类" onDrop={dropCanvas} onSelect={setActiveFolder} />
              <div className="gate-folder-separator" />
              {folderChildren(folders, '').map((folder) => <FolderBranch activeFolder={activeFolder} canvases={canvases} folder={folder} folders={folders} key={folder.id} onCreate={createFolder} onDelete={deleteFolder} onDrop={dropCanvas} onRename={renameFolder} onSelect={setActiveFolder} />)}
            </div>
          </aside>
          <div className="gate-canvas-pane">
            <div className="gate-folder-bar"><div className="gate-folder-current"><Icon name={activeFolder === 'all' ? 'layout-grid' : activeFolder ? 'folder' : 'inbox'} size={14} /><span>{folderLabel(activeFolder, folders)}</span></div><span className="gate-folder-current-count">{visible.length}</span></div>
            <div className="gate-list">
              {!visible.length ? <div className="gate-list-empty"><div className="gate-list-empty-icon"><Icon name={showTrash ? 'trash-2' : 'layout-grid'} size={24} /></div>{showTrash ? '回收站为空' : <>还没有画布<br />新建一个开始创作</>}</div> : visible.map((item) => <CanvasCard
                editing={editingTitle === item.id}
                folders={folders}
                item={item}
                key={item.id}
                metaOpen={metaCanvasId === item.id}
                metaPosition={metaAnchor}
                moving={movingCanvasId === item.id}
                onDelete={() => setPendingDeleteId(item.id)}
                onConfirmDelete={() => void removeCanvas(item.id)}
                onConfirmPurge={() => void purgeCanvas(item.id)}
                onCancelConfirm={() => { setPendingDeleteId(''); setPendingPurgeId(''); }}
                onEdit={() => setEditingTitle(item.id)}
                onMeta={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMetaAnchor({ left: Math.min(Math.max(rect.left, 12), window.innerWidth - 224), top: Math.min(rect.bottom + 8, window.innerHeight - 280) });
                  setMetaCanvasId(metaCanvasId === item.id ? '' : item.id);
                }}
                onMove={(folderId) => void moveCanvas(item.id, folderId)}
                onMoveMenu={() => setMovingCanvasId(movingCanvasId === item.id ? '' : item.id)}
                onOpen={() => void openCanvas(item)}
                onPatch={(patch, failure) => void patchMeta(item.id, patch, failure)}
                onPurge={() => setPendingPurgeId(item.id)}
                onRestore={() => void restoreCanvas(item.id)}
                onTitle={(title) => { setEditingTitle(''); if (title && title !== item.title) void patchMeta(item.id, { title }, '重命名失败'); }}
                pendingDelete={pendingDeleteId === item.id}
                pendingPurge={pendingPurgeId === item.id}
                showTrash={showTrash}
              />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>;
}

export function ScopedCanvasManager({ canvases, configuration, folders, management, onOpen, onRefresh, onStatus, status, trash }: CanvasManagerProps) {
  const [activeFolder, setActiveFolder] = useState('all');
  const [createTitle, setCreateTitle] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const list = showTrash ? trash : activeFolder === 'all' ? canvases : activeFolder === 'root' ? canvases.filter((item) => !item.folder_id) : canvases.filter((item) => item.folder_id === activeFolder);
  const create = async () => {
    try {
      const created = await management.create(createTitle || configuration.defaultTitle || '', {
        icon: configuration.kind === 'smart' ? 'sparkles' : undefined,
        kind: configuration.kind ?? 'classic',
      });
      setCreateTitle('');
      await onRefresh();
      await onOpen(created);
    } catch (error) { onStatus(errorMessage(error, '新建画布失败')); }
  };
  return <main className="canvas-modern-manager">
    <section className="gate-panel canvas-modern-gate">
      <header className="gate-head">
        <div className="gate-head-text"><h1 className="gate-title">{showTrash ? '回收站' : configuration.heading || '经典画布 V2'}</h1><p className="gate-subtitle">{configuration.subtitle || 'React + TypeScript 独立文档与执行路径'}</p></div>
        <div className="gate-head-actions">
          {configuration.managerBackHref ? <a className="gate-icon-btn" href={configuration.managerBackHref}>返回首页</a> : null}
          {!showTrash ? <><select aria-label="画布文件夹" onChange={(event) => setActiveFolder(event.target.value)} value={activeFolder}><option value="all">全部画布</option><option value="root">未分类</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{String(folder.name || '未命名文件夹')}</option>)}</select><button className="gate-icon-btn" onClick={async () => { const name = window.prompt('文件夹名称')?.trim(); if (name) { await management.createFolder(name); await onRefresh(); } }} type="button">新建文件夹</button>{!['all', 'root'].includes(activeFolder) ? <button className="gate-icon-btn" onClick={async () => { if (window.confirm('删除此文件夹？文件夹内画布不会被永久删除。')) { await management.deleteFolder(activeFolder); setActiveFolder('all'); await onRefresh(); } }} type="button">删除文件夹</button> : null}</> : null}
          <button className="gate-icon-btn" onClick={() => void onRefresh()} type="button">刷新</button>
          <button className="gate-icon-btn" onClick={() => setShowTrash((value) => !value)} type="button">{showTrash ? '返回画布' : `回收站 ${trash.length}`}</button>
        </div>
      </header>
      {!showTrash ? <div className="gate-create-row canvas-modern-create">
        <input className="gate-name-input" maxLength={80} onChange={(event) => setCreateTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void create(); }} placeholder="新画布名称" value={createTitle} />
        <button className="primary-btn" onClick={() => void create()} type="button">{configuration.createLabel || '新建画布'}</button>
      </div> : null}
      {status ? <div className="gate-status">{status}</div> : null}
      <div className="gate-list canvas-modern-list">
        {list.map((item) => <article className="gate-card" data-canvas-id={item.id} key={item.id}>
          <button className="canvas-modern-card-main" disabled={showTrash} onClick={() => void onOpen(item)} type="button"><strong>{String(item.title || '未命名画布')}</strong><small>{formatTime(item.updated_at)}</small></button>
          {showTrash ? <><button onClick={async () => { await management.restore(item.id); await onRefresh(); }} type="button">恢复</button><button onClick={async () => { if (window.confirm('永久删除后无法恢复，确定继续？')) { await management.purge(item.id); await onRefresh(); } }} type="button">永久删除</button></> : <><select aria-label={`移动 ${String(item.title || '画布')}`} onChange={async (event) => { await management.moveToFolder(item.id, event.target.value); await onRefresh(); }} value={String(item.folder_id || '')}><option value="">未分类</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{String(folder.name || '未命名文件夹')}</option>)}</select><button aria-label="移入回收站" onClick={async () => { if (window.confirm('将此画布移入回收站？')) { await management.delete(item.id); await onRefresh(); } }} type="button">删除</button></>}
        </article>)}
      </div>
    </section>
  </main>;
}

function CanvasCard({ editing, folders, item, metaOpen, metaPosition, moving, onCancelConfirm, onConfirmDelete, onConfirmPurge, onDelete, onEdit, onMeta, onMove, onMoveMenu, onOpen, onPatch, onPurge, onRestore, onTitle, pendingDelete, pendingPurge, showTrash }: {
  editing: boolean; folders: CanvasFolder[]; item: CanvasSummary; metaOpen: boolean; metaPosition: { left: number; top: number }; moving: boolean;
  onCancelConfirm(): void; onConfirmDelete(): void; onConfirmPurge(): void; onDelete(): void; onEdit(): void; onMeta(event: MouseEvent<HTMLButtonElement>): void; onMove(folderId: string): void; onMoveMenu(): void; onOpen(): void;
  onPatch(patch: Record<string, unknown>, failure: string): void; onPurge(): void; onRestore(): void; onTitle(title: string): void;
  pendingDelete: boolean; pendingPurge: boolean; showTrash: boolean;
}) {
  const color = String(item.color || '');
  const owner = String(item.owner || '');
  const smart = item.kind === 'smart';
  const pinned = Boolean(item.pinned) && !showTrash;
  return <div className={`canvas-item${smart ? ' smart-canvas' : ''}${pinned ? ' pinned' : ''}${color ? ' has-color' : ''}`} data-canvas-id={item.id} draggable={!showTrash} onDragEnd={(event) => event.currentTarget.classList.remove('dragging')} onDragStart={(event) => {
    event.dataTransfer.setData('text/canvas-id', item.id); event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; event.currentTarget.classList.add('dragging');
  }}>
    <div className="canvas-open" onClick={showTrash ? undefined : onOpen} onKeyDown={(event) => { if (!showTrash && (event.key === 'Enter' || event.key === ' ')) onOpen(); }} role="button" tabIndex={showTrash ? -1 : 0}>
      <div className="canvas-card-icon-row"><button className={`canvas-preview-mark${color ? ` icon-has-color cc-${color}` : ''}`} onClick={(event) => { event.stopPropagation(); if (!showTrash) onMeta(event); }} title={showTrash ? '已删除画布' : '编辑图标 / 颜色 / 负责人'} type="button"><CanvasIcon icon={smart && /[^\x00-\x7F]/.test(String(item.icon || '')) ? 'sparkles' : String(item.icon || '')} size={16} /></button>{smart ? <span className="canvas-kind-chip">智能</span> : null}</div>
      <div className="canvas-card-title">{editing ? <TitleInput title={String(item.title || '')} onFinish={onTitle} /> : String(item.title || '未命名画布')}</div>
      {owner ? <button className="canvas-owner-chip" onClick={(event) => { event.stopPropagation(); onMeta(event); }} title={owner} type="button"><Icon name="user-round" size={12} /><span className="canvas-owner-text">{owner}</span></button> : null}
      <div className="canvas-card-meta"><span className="canvas-card-meta-dot" /><div className="canvas-card-time">{showTrash ? `删除于 ${formatTime(item.deleted_at)}` : formatTime(item.updated_at || item.created_at)}</div></div>
    </div>
    {showTrash ? (pendingPurge ? <CardConfirmation text="彻底删除后无法恢复，确定继续？" onCancel={onCancelConfirm} onConfirm={onConfirmPurge} /> : <><button className="canvas-delete canvas-restore" onClick={onRestore} style={{ right: 42 }} title="恢复画布" aria-label={`恢复画布 ${String(item.title || '')}`} type="button"><Icon name="rotate-ccw" size={14} /></button><button className="canvas-delete canvas-purge" onClick={onPurge} title="彻底删除" aria-label={`彻底删除 ${String(item.title || '')}`} type="button"><Icon name="x" size={14} /></button></>) : (pendingDelete ? <CardConfirmation text="将此画布移入回收站？" onCancel={onCancelConfirm} onConfirm={onConfirmDelete} /> : <>
      <button className={`canvas-pin-btn${pinned ? ' active' : ''}`} onClick={() => onPatch({ pinned: !pinned }, '置顶状态保存失败')} title={pinned ? '取消置顶' : '置顶'} aria-label={pinned ? '取消置顶' : '置顶'} type="button"><Icon name="pin" size={14} /></button>
      <button className="canvas-card-edit" onClick={onEdit} title="重命名" aria-label={`重命名 ${String(item.title || '')}`} type="button"><Icon name="pencil" size={14} /></button>
      <button className="canvas-folder-btn" onClick={onMoveMenu} title="移动到文件夹" aria-label={`移动到文件夹 ${String(item.title || '')}`} type="button"><Icon name="folder-input" size={14} /></button>
      <button className="canvas-delete" onClick={onDelete} title="移入回收站" aria-label={`移入回收站 ${String(item.title || '')}`} type="button"><Icon name="trash-2" size={14} /></button>
      {moving ? <div className="canvas-folder-menu"><button className={!item.folder_id ? 'active' : ''} onClick={() => onMove('')} style={{ '--depth': 0 } as CSSProperties} type="button"><Icon name="inbox" size={12} /><span>未分类</span></button>{folders.map((folder) => <button className={item.folder_id === folder.id ? 'active' : ''} key={folder.id} onClick={() => onMove(folder.id)} style={{ '--depth': folderDepth(folder.id, folders) } as CSSProperties} type="button"><Icon name="folder" size={12} /><span>{String(folder.name || '未命名文件夹')}</span></button>)}</div> : null}
    </>)}
    {metaOpen ? <CanvasMetaPopover item={item} onPatch={onPatch} position={metaPosition} /> : null}
  </div>;
}

function CanvasMetaPopover({ item, onPatch, position }: { item: CanvasSummary; onPatch(patch: Record<string, unknown>, failure: string): void; position: { left: number; top: number } }) {
  const [owner, setOwner] = useState(String(item.owner || ''));
  const popover = <div className="canvas-meta-pop" data-canvas-meta-pop={item.id} onMouseDown={(event) => event.stopPropagation()} style={{ ...position, zIndex: 1120 }}>
    <div className="canvas-meta-section"><div className="canvas-meta-label">负责人 / 项目</div><input className="canvas-owner-input" maxLength={40} onBlur={() => { const value = owner.trim(); if (value !== String(item.owner || '')) onPatch({ owner: value }, '负责人保存失败'); }} onChange={(event) => setOwner(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} placeholder="如：张三 / 双十一项目" type="text" value={owner} /></div>
    <div className="canvas-meta-section"><div className="canvas-meta-label">颜色标记</div><div className="canvas-color-row"><button className={`canvas-color-swatch cc-none${item.color ? '' : ' active'}`} onClick={() => onPatch({ color: '' }, '颜色保存失败')} title="无" type="button"><Icon name="ban" size={12} /></button>{CANVAS_COLORS.map((color) => <button aria-label={color} className={`canvas-color-swatch cc-${color}${item.color === color ? ' active' : ''}`} key={color} onClick={() => onPatch({ color }, '颜色保存失败')} type="button" />)}</div></div>
    <div className="canvas-meta-section"><div className="canvas-meta-label">更换图标</div><div className="emoji-picker-grid">{CANVAS_ICONS.map((icon) => <button className="emoji-option" data-icon={icon} key={icon} onClick={() => onPatch({ icon }, '图标保存失败')} type="button"><Icon name={icon} size={14} /></button>)}</div></div>
  </div>;
  return createPortal(popover, document.body);
}

function TitleInput({ onFinish, title }: { onFinish(title: string): void; title: string }) {
  const [value, setValue] = useState(title);
  const done = useRef(false);
  const finish = (commit: boolean) => { if (done.current) return; done.current = true; onFinish(commit ? value.trim() : title); };
  return <input autoFocus className="canvas-card-title-input" maxLength={80} onBlur={() => finish(true)} onChange={(event) => setValue(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') finish(true); if (event.key === 'Escape') finish(false); }} onMouseDown={(event) => event.stopPropagation()} type="text" value={value} />;
}

function FolderBranch({ activeFolder, canvases, folder, folders, onCreate, onDelete, onDrop, onRename, onSelect }: {
  activeFolder: string; canvases: CanvasSummary[]; folder: CanvasFolder; folders: CanvasFolder[];
  onCreate(parentId: string): Promise<void>; onDelete(folder: CanvasFolder): Promise<void>; onDrop(event: DragEvent, folderId: string): void; onRename(folder: CanvasFolder): Promise<void>; onSelect(id: string): void;
}) {
  const depth = folderDepth(folder.id, folders);
  return <><div className={`gate-folder-node${activeFolder === folder.id ? ' active' : ''}`} data-folder-id={folder.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, folder.id)} style={{ '--depth': depth } as CSSProperties}>
    <button className="gate-folder-main" onClick={() => onSelect(folder.id)} title={String(folder.name || '')} type="button"><Icon name="folder" size={14} /><span className="gate-folder-name">{String(folder.name || '未命名文件夹')}</span><span className="gate-folder-count">{countFolderCanvases(canvases, folder.id)}</span></button>
    <div className="gate-folder-actions"><button className="gate-folder-action" onClick={() => void onCreate(folder.id)} title="新建子文件夹" type="button"><Icon name="folder-plus" size={12} /></button><button className="gate-folder-action" onClick={() => void onRename(folder)} title="重命名" type="button"><Icon name="pencil" size={12} /></button><button className="gate-folder-action" onClick={() => void onDelete(folder)} title="删除文件夹" type="button"><Icon name="trash-2" size={12} /></button></div>
  </div>{folderChildren(folders, folder.id).map((child) => <FolderBranch activeFolder={activeFolder} canvases={canvases} folder={child} folders={folders} key={child.id} onCreate={onCreate} onDelete={onDelete} onDrop={onDrop} onRename={onRename} onSelect={onSelect} />)}</>;
}

function FolderRow({ active, count, icon, id, name, onDrop, onSelect }: { active: boolean; count: number; icon: string; id: string; name: string; onDrop(event: DragEvent, folderId: string): void; onSelect(id: string): void }) {
  return <div className={`gate-folder-node gate-folder-special${active ? ' active' : ''}`} data-folder-id={id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, id)}><button className="gate-folder-main" onClick={() => onSelect(id)} type="button"><Icon name={icon} size={14} /><span className="gate-folder-name">{name}</span><span className="gate-folder-count">{count}</span></button></div>;
}

function CardConfirmation({ onCancel, onConfirm, text }: { onCancel(): void; onConfirm(): void; text: string }) {
  return <div className="canvas-delete-confirm"><div className="canvas-delete-box"><div className="canvas-delete-title">{text}</div><div className="canvas-delete-actions"><button className="canvas-confirm-btn" onClick={onConfirm} type="button">确定</button><button className="canvas-cancel-btn" onClick={onCancel} type="button">取消</button></div></div></div>;
}

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <i aria-hidden="true" data-lucide={name} style={{ height: size, width: size }} />;
}

function CanvasIcon({ icon, size }: { icon: string; size: number }) {
  if (icon && /[^\x00-\x7F]/.test(icon) && icon !== '🧩') return <>{icon}</>;
  return <Icon name={!icon || icon === '🧩' ? 'layers' : icon} size={size} />;
}

function compareCanvases(a: CanvasSummary, b: CanvasSummary, mode: SortMode): number {
  const pinned = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
  if (pinned) return pinned;
  if (mode === 'name') {
    const name = String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    if (name) return name;
  }
  return Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0);
}

function folderChildren(folders: CanvasFolder[], parentId: string): CanvasFolder[] {
  return folders.filter((folder) => normalizeFolderId(folder.parent_id) === parentId).sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
}

function folderDepth(folderId: string, folders: CanvasFolder[]): number {
  let depth = 0;
  let current = folders.find((folder) => folder.id === folderId);
  const seen = new Set<string>();
  while (current?.parent_id && !seen.has(current.id)) { seen.add(current.id); depth += 1; current = folders.find((folder) => folder.id === current?.parent_id); }
  return depth;
}

function countFolderCanvases(canvases: CanvasSummary[], folderId: string): number {
  return canvases.filter((item) => normalizeFolderId(item.folder_id) === folderId).length;
}

function folderLabel(folderId: string, folders: CanvasFolder[]): string {
  if (folderId === 'all') return '全部画布';
  if (!folderId) return '未分类';
  return String(folders.find((folder) => folder.id === folderId)?.name || '文件夹');
}

function normalizeFolderId(value: unknown): string {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function formatTime(value: unknown): string {
  const timestamp = Number(value || 0);
  return timestamp ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toLocaleString() : '--';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message || fallback : fallback;
}

function refreshIcons(): void {
  (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons();
}
