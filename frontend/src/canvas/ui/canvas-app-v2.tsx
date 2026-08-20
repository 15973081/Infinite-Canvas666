import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { CanvasDocument } from '../domain/types';
import { canvasDocumentSavePayload, type CanvasRepository } from '../infrastructure/canvas-repository';
import {
  getDefaultCanvasManagementClient,
  type CanvasFolder,
  type CanvasManagementClient,
  type CanvasSummary,
} from '../infrastructure/canvas-management';
import type { CanvasRuntime } from '../application/modern-canvas-runtime';
import { CanvasBoardApiProvider, type CanvasBoardApi } from './canvas-board-api';
import { mountCanvasBoardV2 } from './canvas-board-v2';
import { canvasDocumentCost, readCanvasAssetInbox } from './canvas-app-domain';
import { AssetLibraryDialog, type CanvasAssetLibraryRequest } from './asset-library-dialog';
import { PromptLibraryDialog, type PromptLibraryRequest } from './prompt-library-dialog';

export interface CanvasAppConfiguration {
  assetInboxKey?: string;
  createLabel?: string;
  defaultTitle?: string;
  editorAddon?: ReactNode;
  heading?: string;
  initialCanvasId?: string;
  kind?: 'classic' | 'smart';
  managerBackHref?: string;
  subtitle?: string;
}

export interface CanvasAppDependencies {
  configuration?: CanvasAppConfiguration;
  management?: CanvasManagementClient;
  repository: CanvasRepository;
  runtime: CanvasRuntime;
}

const nodeButtons = [
  ['image', '上传'], ['prompt', '提示词'], ['loop', '循环'], ['llm', 'LLM'], ['generator', 'API生成'],
  ['msgen', 'ModelScope'], ['video', '视频'], ['comfy', 'ComfyUI'], ['ltxDirector', 'LTX Director'], ['output', 'Output'],
] as const;

function CanvasAppV2({ configuration = {}, management = getDefaultCanvasManagementClient(), repository, runtime }: CanvasAppDependencies) {
  const canvasKind = configuration.kind ?? 'classic';
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [trash, setTrash] = useState<CanvasSummary[]>([]);
  const [folders, setFolders] = useState<CanvasFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState('all');
  const [showTrash, setShowTrash] = useState(false);
  const [sortMode, setSortMode] = useState<'recent' | 'name'>('recent');
  const [creating, setCreating] = useState(false);
  const [movingCanvasId, setMovingCanvasId] = useState('');
  const [current, setCurrent] = useState<CanvasDocument | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [status, setStatus] = useState('正在加载画布列表…');
  const [backups, setBackups] = useState<Array<Record<string, unknown>> | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptLibraryRequest | null>(null);
  const [inspector, setInspector] = useState<{ document: CanvasDocument; mode: 'cost' | 'logs' } | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [assetRequest, setAssetRequest] = useState<CanvasAssetLibraryRequest | null>(null);
  const [lockHolder, setLockHolder] = useState<Record<string, unknown> | null>(null);
  const [lockIssue, setLockIssue] = useState('');
  const [syncIssue, setSyncIssue] = useState('');
  const boardApiRef = useRef<CanvasBoardApi | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const clientId = useRef(canvasClientId());
  const initialCanvasAttempted = useRef(false);
  const lastKnownUpdatedAt = useRef(0);
  const ownsLock = useRef(false);
  const remoteSyncInFlight = useRef(false);
  const getBoardApi = useCallback(() => boardApiRef.current, []);

  const refresh = useCallback(async () => {
    setStatus('正在加载画布列表…');
    try {
      const [allActive, allDeleted, folderList] = await Promise.all([management.list(), management.listTrash(), management.listFolders()]);
      const matchesKind = (item: CanvasSummary) => String(item.kind || 'classic') === canvasKind;
      const active = allActive.filter(matchesKind);
      const deleted = allDeleted.filter(matchesKind);
      setCanvases(active.sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0)));
      setTrash(deleted);
      setFolders(folderList);
      setStatus(active.length ? '' : '还没有画布，新建一个开始创作。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [canvasKind, management]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const host = boardRef.current;
    if (!host || !current) return;
    const mounted = mountCanvasBoardV2(host, { clientId: clientId.current, initialDocument: current, readOnly: Boolean(lockHolder), repository, runtime });
    boardApiRef.current = mounted.api;
    mounted.api.setReadOnly(Boolean(lockHolder));
    return () => {
      if (boardApiRef.current === mounted.api) boardApiRef.current = null;
      mounted.unmount();
    };
  }, [current, repository, runtime]);

  useEffect(() => { boardApiRef.current?.setReadOnly(Boolean(lockHolder)); }, [lockHolder]);

  useEffect(() => {
    const listener = (event: Event) => {
      const saved = (event as CustomEvent<CanvasDocument>).detail;
      if (saved?.id === current?.id) {
        lastKnownUpdatedAt.current = Math.max(lastKnownUpdatedAt.current, Number(saved.updated_at || 0));
        setSyncIssue('');
      }
    };
    window.addEventListener('canvas-board-v2-document-saved', listener);
    return () => window.removeEventListener('canvas-board-v2-document-saved', listener);
  }, [current?.id]);

  useEffect(() => {
    const release = () => {
      if (current?.id && ownsLock.current) void management.releaseLock(String(current.id), clientId.current, true);
    };
    window.addEventListener('pagehide', release, { once: true });
    return () => window.removeEventListener('pagehide', release);
  }, [current?.id, management]);

  useEffect(() => {
    const previous = window.openPromptTemplateModal;
    const previousLibrary = window.openCanvasPromptLibrary;
    const previousAssetLibrary = window.openCanvasAssetLibrary;
    window.openPromptTemplateModal = (nodeId) => {
      setPromptRequest({ onApply: (text) => { boardApiRef.current?.updateNode(nodeId, { text }); } });
    };
    window.openCanvasPromptLibrary = (request) => setPromptRequest(request);
    window.openCanvasAssetLibrary = (request) => setAssetRequest(request);
    return () => {
      if (previous) window.openPromptTemplateModal = previous; else delete window.openPromptTemplateModal;
      if (previousLibrary) window.openCanvasPromptLibrary = previousLibrary; else delete window.openCanvasPromptLibrary;
      if (previousAssetLibrary) window.openCanvasAssetLibrary = previousAssetLibrary; else delete window.openCanvasAssetLibrary;
    };
  }, []);

  const openCanvas = async (summary: CanvasSummary) => {
    setStatus('正在打开画布…');
    try {
      const lock = await management.acquireLock(summary.id, clientId.current, localStorage.getItem('canvasUserName') || '');
      const loaded = await repository.get(summary.id);
      ownsLock.current = lock.ok;
      setLockHolder(lock.ok ? null : lock.holder || {});
      setLockIssue('');
      setSyncIssue('');
      lastKnownUpdatedAt.current = Number(loaded.updated_at || 0);
      setCurrent(loaded);
      if (!lock.ok) {
        setStatus(`只读模式：画布正由 ${lockHolderName(lock.holder)} 编辑`);
        return;
      }
      setStatus('');
      void runtime.recoverDocument(loaded).then(async (recovered) => {
        if (JSON.stringify(recovered) === JSON.stringify(loaded)) return;
        const saved = await repository.save(summary.id, { ...canvasDocumentSavePayload(recovered), client_id: clientId.current });
        lastKnownUpdatedAt.current = Number(saved.updated_at || 0);
        setCurrent((active) => active?.id === saved.id ? saved : active);
      }).catch((error) => setStatus(`任务恢复失败：${error instanceof Error ? error.message : String(error)}`));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const acquireCurrentLock = useCallback(async () => {
    if (!current?.id) return false;
    try {
      const wasOwner = ownsLock.current;
      const lock = await management.acquireLock(String(current.id), clientId.current, localStorage.getItem('canvasUserName') || '');
      if (!lock.ok) {
        ownsLock.current = false;
        setLockHolder(lock.holder || {});
        setLockIssue('');
        setStatus(`只读模式：画布正由 ${lockHolderName(lock.holder)} 编辑`);
        return false;
      }
      ownsLock.current = true;
      setLockHolder(null);
      setLockIssue('');
      if (!wasOwner) {
        const latest = await repository.get(String(current.id));
        lastKnownUpdatedAt.current = Number(latest.updated_at || 0);
        setCurrent(latest);
        setStatus('已取得编辑锁，并同步到最新画布');
      }
      return true;
    } catch (error) {
      ownsLock.current = false;
      setLockHolder({ username: '锁状态未知' });
      const message = `编辑锁续期失败，已切换只读并将自动重试：${error instanceof Error ? error.message : String(error)}`;
      setLockIssue(message);
      setStatus(message);
      return false;
    }
  }, [current?.id, management, repository]);

  const syncRemoteVersion = useCallback(async (hintedUpdatedAt = 0) => {
    if (!current?.id || remoteSyncInFlight.current) return;
    remoteSyncInFlight.current = true;
    try {
      const updatedAt = hintedUpdatedAt || Number((await management.getMeta(String(current.id))).updated_at || 0);
      if (!updatedAt || updatedAt <= lastKnownUpdatedAt.current) return;
      const remote = await repository.get(String(current.id));
      const result = boardApiRef.current?.syncRemote(remote);
      if (!result?.updated) {
        if (result?.conflicts.includes('save-in-progress')) setSyncIssue('检测到远端更新，等待当前保存完成后同步');
        else setSyncIssue(`远端更新与本地修改冲突：${result?.conflicts.join('、') || '无法自动合并'}`);
        return;
      }
      lastKnownUpdatedAt.current = Math.max(updatedAt, Number(remote.updated_at || 0));
      setSyncIssue(result.merged ? '已合并远端更新，正在保存' : '');
    } catch (error) {
      console.warn('[canvas-modern] remote canvas synchronization failed', error);
    } finally {
      remoteSyncInFlight.current = false;
    }
  }, [current?.id, management, repository]);

  useEffect(() => {
    if (!current?.id) return;
    const timer = window.setInterval(() => { void syncRemoteVersion(); }, 5_000);
    const message = (event: MessageEvent) => {
      const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : {};
      if (data.type !== 'canvas_updated' || String(data.canvas_id || '') !== String(current.id)) return;
      if (String(data.client_id || '') === clientId.current) return;
      void syncRemoteVersion(Number(data.updated_at || 0));
    };
    window.addEventListener('message', message);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', message);
    };
  }, [current?.id, syncRemoteVersion]);

  useEffect(() => {
    if (!current?.id) return;
    const timer = window.setInterval(() => { void acquireCurrentLock(); }, 25_000);
    return () => window.clearInterval(timer);
  }, [acquireCurrentLock, current?.id]);

  useEffect(() => {
    const canvasId = String(configuration.initialCanvasId || '').trim();
    if (!canvasId || current || initialCanvasAttempted.current) return;
    initialCanvasAttempted.current = true;
    void openCanvas(canvases.find((item) => item.id === canvasId) ?? { id: canvasId, kind: canvasKind });
  }, [canvases, canvasKind, configuration.initialCanvasId, current]);

  const closeCanvas = async () => {
    if (current?.id && ownsLock.current) await management.releaseLock(String(current.id), clientId.current).catch(() => undefined);
    ownsLock.current = false;
    setLockHolder(null);
    setLockIssue('');
    setSyncIssue('');
    lastKnownUpdatedAt.current = 0;
    setCurrent(null);
    setBackups(null);
    await refresh();
  };

  const create = async () => {
    try {
      const created = await management.create(createTitle || configuration.defaultTitle || '', {
        folderId: ['all', 'root'].includes(activeFolder) ? undefined : activeFolder,
        icon: canvasKind === 'smart' ? 'sparkles' : undefined,
        kind: canvasKind,
      });
      setCreateTitle('');
      setCreating(false);
      await refresh();
      await openCanvas(created);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const editIdentity = async () => {
    const currentName = localStorage.getItem('canvasUserName') || '';
    const name = window.prompt('编辑身份名称', currentName);
    if (name === null) return;
    localStorage.setItem('canvasUserName', name.trim());
    if (current?.id) await acquireCurrentLock();
  };

  const remove = async (id: string) => {
    if (!window.confirm('将此画布移入回收站？')) return;
    await management.delete(id);
    await refresh();
  };

  const showBackups = async () => {
    if (!current?.id) return;
    setBackups(await repository.listBackups(String(current.id)));
  };
  const showInspector = async (mode: 'cost' | 'logs') => {
    if (!current?.id) return;
    setInspector({ mode, document: await repository.get(String(current.id)) });
  };
  const exportWorkflow = () => {
    const workflow = boardApiRef.current?.exportSelection();
    if (!workflow?.nodes.length) { setStatus('没有可导出的节点'); return; }
    const blob = new Blob([JSON.stringify({ version: 2, ...workflow }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement('a'), { download: `${String(current?.title || 'canvas')}-workflow.json`, href: url });
    anchor.click();
    URL.revokeObjectURL(url);
    setWorkflowOpen(false);
  };
  const exportWorkflowArchive = async () => {
    const workflow = boardApiRef.current?.exportSelection();
    if (!workflow?.nodes.length) { setStatus('没有可导出的节点'); return; }
    try {
      setStatus('正在收集工作流资源…');
      const filename = `${String(current?.title || 'canvas')}-workflow.zip`;
      const response = await fetch('/api/canvas-workflows/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...workflow, filename, include_resources: true }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(payload.detail || '导出工作流失败');
      }
      downloadBlob(await response.blob(), response.headers.get('Content-Disposition'), filename);
      setStatus('已导出含本地资源的工作流 ZIP');
      setWorkflowOpen(false);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const saveWorkflowToLibrary = () => {
    const workflow = boardApiRef.current?.exportSelection();
    if (!workflow?.nodes.length) { setStatus('没有可保存的节点'); return; }
    const name = String(current?.title || 'canvas');
    setWorkflowOpen(false);
    setAssetRequest({ saveWorkflow: { ...workflow, filename: `${name}-workflow.zip`, name } });
  };
  const exportSelectedResults = async () => {
    const workflow = boardApiRef.current?.exportSelection();
    const items = canvasGroupExportItems(workflow?.nodes || []);
    if (!items.length) { setStatus('选区中没有可批量导出的媒体或文本'); return; }
    const folder = window.prompt('导出到服务器文件夹（留空使用默认导出目录）', '');
    if (folder === null) return;
    try {
      const response = await fetch('/api/smart-canvas/group-export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folder.trim(), group_name: String(current?.title || 'canvas'), items }),
      });
      const payload = await response.json().catch(() => ({})) as { count?: number; detail?: string; folder?: string };
      if (!response.ok) throw new Error(payload.detail || '批量导出失败');
      setStatus(`已导出 ${Number(payload.count || items.length)} 项到 ${String(payload.folder || '默认导出目录')}`);
      setWorkflowOpen(false);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const importWorkflow = async (file: File) => {
    try {
      let payload: unknown;
      if (/\.json$/i.test(file.name)) payload = JSON.parse(await file.text());
      else {
        const form = new FormData(); form.append('file', file);
        const response = await fetch('/api/canvas-workflows/import', { method: 'POST', body: form });
        if (!response.ok) throw new Error('导入工作流失败');
        payload = await response.json();
      }
      const normalized = normalizeWorkflow(payload);
      const ids = boardApiRef.current?.importWorkflow(normalized) ?? [];
      setStatus(ids.length ? `已导入 ${ids.length} 个节点` : '文件中没有可导入节点');
      setWorkflowOpen(false);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const showAssets = () => setAssetRequest({
    onInsert: (item) => {
      const id = boardApiRef.current?.addNode('image', { x: 100, y: 100 });
      if (id) boardApiRef.current?.updateNode(id, { mediaKind: item.kind, name: item.name, url: item.url });
    },
    onImportWorkflow: async (item) => {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error('读取资产库工作流失败');
      const extension = /\.json(?:[?#]|$)/i.test(item.url) ? '.json' : '.zip';
      await importWorkflow(new File([await response.blob()], `${item.name || 'workflow'}${extension}`));
    },
  });
  const importAssetInbox = () => {
    const key = configuration.assetInboxKey || '';
    const items = readCanvasAssetInbox(key);
    if (!items.length) { setStatus('素材收件箱为空或已过期'); return 0; }
    const columns = Math.max(1, Math.min(items.length, Math.ceil(Math.sqrt(items.length))));
    const ids = items.map((item, index) => {
      const id = boardApiRef.current?.addNode('image', {
        x: 100 + (index % columns) * 280,
        y: 100 + Math.floor(index / columns) * 220,
      });
      if (id) boardApiRef.current?.updateNode(id, { mediaKind: item.kind, name: item.name, url: item.url });
      return id;
    }).filter(Boolean);
    localStorage.removeItem(key);
    setStatus(`已从素材库导入 ${ids.length} 个素材`);
    return ids.length;
  };

  useEffect(() => {
    if (!current || !configuration.assetInboxKey) return;
    const paste = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target?.tagName || '')) return;
      if (!readCanvasAssetInbox(configuration.assetInboxKey || '').length) return;
      event.preventDefault();
      importAssetInbox();
    };
    window.addEventListener('keydown', paste, true);
    return () => window.removeEventListener('keydown', paste, true);
  }, [configuration.assetInboxKey, current]);

  if (!current) {
    const filtered = showTrash ? trash : activeFolder === 'all' ? canvases : activeFolder === 'root' ? canvases.filter((item) => !item.folder_id) : canvases.filter((item) => item.folder_id === activeFolder);
    const list = [...filtered].sort(sortMode === 'name'
      ? (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN')
      : (a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0));
    const folderName = activeFolder === 'all' ? '全部画布' : activeFolder === 'root' ? '未分类' : String(folders.find((folder) => folder.id === activeFolder)?.name || '文件夹');
    const folderCount = (folderId: string) => folderId === 'all' ? canvases.length : folderId === 'root' ? canvases.filter((item) => !item.folder_id).length : canvases.filter((item) => item.folder_id === folderId).length;
    const startCreate = () => { setCreateTitle(''); setCreating(true); };
    return <main className="canvas-modern-manager canvas-gate">
      <section className={`gate-panel canvas-modern-gate ${creating ? 'creating' : ''} ${showTrash ? 'trash-mode' : ''}`}>
        <header className="gate-head">
          <div className="gate-head-text">
            {showTrash ? <button className="gate-back-link" onClick={() => setShowTrash(false)} type="button"><Icon name="arrow-left" />返回画布列表</button> : null}
            <div className="gate-title-row"><h1 className="gate-title">{showTrash ? '回收站' : canvasKind === 'classic' ? '选择画布' : configuration.heading || '智能画布'}</h1><span className="gate-count-pill">{showTrash ? trash.length : canvases.length} 个</span></div>
            <p className="gate-subtitle">{showTrash ? '可恢复画布，或将其永久删除。' : '打开已有画布，或新建一个开始创作。'}</p>
          </div>
          <div className="gate-head-actions">
            {!showTrash ? <div className="gate-sort" role="group" aria-label="排序方式"><button className={`gate-sort-btn ${sortMode === 'recent' ? 'active' : ''}`} onClick={() => setSortMode('recent')} type="button">最近编辑</button><button className={`gate-sort-btn ${sortMode === 'name' ? 'active' : ''}`} onClick={() => setSortMode('name')} type="button">名称</button></div> : null}
            <button aria-label="刷新列表" className="gate-icon-btn" onClick={() => void refresh()} title="刷新列表" type="button"><Icon name="refresh" /></button>
            {!showTrash ? <button aria-label="打开回收站" className="gate-icon-btn gate-trash-entry" onClick={() => setShowTrash(true)} title="打开回收站" type="button"><Icon name="trash" /><span className={`gate-trash-badge ${trash.length ? 'visible' : ''}`}>{trash.length}</span></button> : null}
            {!showTrash && canvasKind === 'classic' ? <button className="primary-btn" onClick={startCreate} type="button"><Icon name="plus" />新建画布</button> : null}
            {!showTrash && canvasKind === 'classic' ? <a className="smart-create-btn" href="/static/smart-canvas.html"><Icon name="sparkles" />新建智能画布</a> : null}
            {!showTrash && canvasKind === 'smart' ? <button className="smart-create-btn" onClick={() => void create()} type="button"><Icon name="sparkles" />{configuration.createLabel || '新建智能画布'}</button> : null}
          </div>
        </header>
        {creating ? <div className="gate-create-row">
          <input autoFocus className="gate-name-input" maxLength={80} onChange={(event) => setCreateTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void create(); if (event.key === 'Escape') setCreating(false); }} placeholder="新画布名称（可留空使用默认）" value={createTitle} />
          <button aria-label="确定" className="create-confirm" onClick={() => void create()} type="button"><Icon name="check" /></button>
          <button aria-label="取消" className="create-cancel" onClick={() => setCreating(false)} type="button"><Icon name="x" /></button>
        </div> : null}
        {status ? <div className="gate-status">{status}</div> : null}
        {showTrash ? <div className="trash-note">回收站中的画布会在 30 天后自动清理。</div> : null}
        <div className="gate-browser">
          {!showTrash ? <aside aria-label="画布文件夹" className="gate-folder-pane"><div className="gate-folder-head"><span>文件夹</span><button aria-label="新建文件夹" className="gate-folder-add" onClick={async () => { const name = window.prompt('文件夹名称')?.trim(); if (name) { await management.createFolder(name); await refresh(); } }} title="新建文件夹" type="button"><Icon name="folder-plus" /></button></div><div className="gate-folder-tree">
            <FolderRow active={activeFolder === 'all'} count={folderCount('all')} icon="grid" label="全部画布" onClick={() => setActiveFolder('all')} />
            <FolderRow active={activeFolder === 'root'} count={folderCount('root')} icon="inbox" label="未分类" onClick={() => setActiveFolder('root')} />
            <div className="gate-folder-separator" />
            {folders.map((folder) => <div className={`gate-folder-node ${activeFolder === folder.id ? 'active' : ''}`} key={folder.id}><button className="gate-folder-main" onClick={() => setActiveFolder(folder.id)} type="button"><Icon name="folder" /><span className="gate-folder-name">{String(folder.name || '未命名文件夹')}</span><span className="gate-folder-count">{folderCount(folder.id)}</span></button><span className="gate-folder-actions"><button aria-label={`删除文件夹 ${String(folder.name || '')}`} className="gate-folder-action" onClick={async () => { if (window.confirm('删除此文件夹？文件夹内画布不会被永久删除。')) { await management.deleteFolder(folder.id); if (activeFolder === folder.id) setActiveFolder('all'); await refresh(); } }} type="button"><Icon name="trash" /></button></span></div>)}
          </div></aside> : null}
          <div className="gate-canvas-pane"><div className="gate-folder-bar"><div className="gate-folder-current"><Icon name={showTrash ? 'trash' : 'grid'} /><span>{showTrash ? '回收站' : folderName}</span></div><span className="gate-folder-current-count">{list.length}</span></div>
          <div className="gate-list">
          {!list.length ? <div className="gate-list-empty"><div className="gate-list-empty-icon"><Icon name={showTrash ? 'trash' : 'grid'} /></div>{showTrash ? '回收站为空' : '还没有画布'}<br />{showTrash ? null : '新建一个开始创作'}</div> : null}
          {list.map((item) => <article className={`canvas-item ${item.kind === 'smart' ? 'smart-canvas' : ''}`} data-canvas-id={item.id} key={item.id}>
            <button className="canvas-open" disabled={showTrash} onClick={() => void openCanvas(item)} type="button"><div className="canvas-card-icon-row"><span className="canvas-preview-mark"><Icon name={item.kind === 'smart' ? 'sparkles' : 'layers'} /></span>{item.kind === 'smart' ? <span className="canvas-kind-chip">智能</span> : null}</div><div className="canvas-card-title">{String(item.title || '未命名画布')}</div><div className="canvas-card-meta"><span className="canvas-card-meta-dot" /><span className="canvas-card-time">{formatTime(showTrash ? item.deleted_at : item.updated_at)}</span></div></button>
            {showTrash ? <><button aria-label="恢复画布" className="canvas-delete canvas-restore" onClick={async () => { await management.restore(item.id); await refresh(); }} style={{ right: 42 }} type="button"><Icon name="restore" /></button><button aria-label="永久删除画布" className="canvas-delete" onClick={async () => { if (window.confirm('永久删除后无法恢复，确定继续？')) { await management.purge(item.id); await refresh(); } }} type="button"><Icon name="x" /></button></> : <><button aria-label="移动到文件夹" className="canvas-folder-btn" onClick={() => setMovingCanvasId((id) => id === item.id ? '' : item.id)} type="button"><Icon name="folder-input" /></button><button aria-label="移入回收站" className="canvas-delete" onClick={() => void remove(item.id)} type="button"><Icon name="trash" /></button>{movingCanvasId === item.id ? <div className="canvas-folder-menu"><button className={!item.folder_id ? 'active' : ''} onClick={async () => { await management.moveToFolder(item.id, ''); setMovingCanvasId(''); await refresh(); }} type="button"><Icon name="inbox" />未分类</button>{folders.map((folder) => <button className={item.folder_id === folder.id ? 'active' : ''} key={folder.id} onClick={async () => { await management.moveToFolder(item.id, folder.id); setMovingCanvasId(''); await refresh(); }} type="button"><Icon name="folder" />{String(folder.name || '未命名文件夹')}</button>)}</div> : null}</>}
          </article>)}
          </div></div>
        </div>
      </section>
    </main>;
  }

  return <CanvasBoardApiProvider getApi={getBoardApi}>
    <main className="canvas-modern-editor">
      <header className="topbar canvas-modern-topbar">
      <div className="panel canvas-nav"><button className="tool-btn" onClick={() => void closeCanvas()} type="button">← 返回</button><div className="canvas-nav-meta"><strong>{String(current.title || '未命名画布')}</strong><small>{lockHolder ? `只读 · ${lockHolderName(lockHolder)} 编辑中` : syncIssue || formatTime(current.updated_at)}</small></div><button className="tool-btn" onClick={() => void editIdentity()} type="button">编辑身份</button></div>
      <div className="panel toolbar canvas-modern-toolbar">
        <div className="toolbar-items">{nodeButtons.map(([type, label]) => <button className="tool-btn" disabled={Boolean(lockHolder)} key={type} onClick={() => boardApiRef.current?.addNode(type)} type="button">{label}</button>)}</div>
        <div className="toolbar-fixed"><button className="tool-btn" disabled={Boolean(lockHolder)} onClick={() => boardApiRef.current?.undo()} title="Ctrl/⌘ + Z" type="button">撤销</button><button className="tool-btn" disabled={Boolean(lockHolder)} onClick={() => boardApiRef.current?.redo()} title="Ctrl/⌘ + Shift + Z" type="button">重做</button><button className="tool-btn" disabled={Boolean(lockHolder)} onClick={() => boardApiRef.current?.groupSelected()} type="button">分组</button><button className="tool-btn" onClick={() => setWorkflowOpen(true)} type="button">工作流</button><button className="tool-btn" onClick={showAssets} type="button">资产库</button>{configuration.assetInboxKey ? <button className="tool-btn" disabled={Boolean(lockHolder)} onClick={importAssetInbox} type="button">导入素材</button> : null}<button className="tool-btn" onClick={() => void showInspector('cost')} type="button">费用</button><button className="tool-btn" onClick={() => void showInspector('logs')} type="button">日志</button><button className="tool-btn" disabled={Boolean(lockHolder)} onClick={() => void showBackups()} type="button">备份</button></div>
      </div>
      </header>
      <div className="canvas-modern-board" ref={boardRef} />
      {configuration.editorAddon}
      {lockHolder ? <div className="canvas-modern-readonly-overlay"><section><strong>只读模式</strong><span>{lockHolderName(lockHolder)} 正在编辑此画布</span>{lockIssue ? <small>{lockIssue}</small> : null}<button className="primary-btn" onClick={() => void acquireCurrentLock()} type="button">尝试取得编辑锁</button></section></div> : null}
      {backups ? <div className="modal open canvas-modern-backups"><section className="modal-panel"><header><strong>画布备份</strong><button onClick={() => setBackups(null)} type="button">关闭</button></header><button onClick={async () => { await repository.createBackup(String(current.id)); await showBackups(); }} type="button">立即备份</button>{backups.map((backup) => <div className="backup-item" key={String(backup.filename)}><span>{String(backup.filename)}</span><button onClick={async () => { const restored = await repository.restoreBackup(String(current.id), String(backup.filename)); setCurrent(restored); setBackups(null); }} type="button">恢复</button><button onClick={async () => { await management.deleteBackup(String(current.id), String(backup.filename)); await showBackups(); }} type="button">删除</button></div>)}</section></div> : null}
      {promptRequest ? <PromptLibraryDialog onClose={() => setPromptRequest(null)} request={promptRequest} /> : null}
      {workflowOpen ? <div className="modal open canvas-modern-backups"><section className="modal-panel"><header><strong>工作流导入 / 导出</strong><button onClick={() => setWorkflowOpen(false)} type="button">关闭</button></header><p>有选中节点时仅导出选区；分组会自动包含其成员。ZIP 会携带节点引用的本地媒体，导入后自动恢复资源地址。</p><button onClick={exportWorkflow} type="button">导出 JSON</button><button className="primary-btn" onClick={() => void exportWorkflowArchive()} type="button">导出 ZIP（含资源）</button><button onClick={saveWorkflowToLibrary} type="button">保存到工作流库</button><button onClick={() => void exportSelectedResults()} type="button">批量导出选区结果</button><label className="primary-btn">导入 JSON / ZIP<input accept=".json,.zip,application/json,application/zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorkflow(file); }} type="file" /></label></section></div> : null}
      {assetRequest ? <AssetLibraryDialog onClose={() => setAssetRequest(null)} request={assetRequest} /> : null}
      {inspector ? <div className="modal open canvas-modern-backups"><section className="modal-panel"><header><strong>{inspector.mode === 'logs' ? '生成日志' : '费用汇总'}</strong><button onClick={() => setInspector(null)} type="button">关闭</button></header>{inspector.mode === 'logs' ? <>{(Array.isArray(inspector.document.logs) ? inspector.document.logs : []).slice().reverse().map((log, index) => <pre key={String((log as Record<string, unknown>).id || index)}>{JSON.stringify(log, null, 2)}</pre>)}</> : <><h2>¥ {canvasDocumentCost(inspector.document).toFixed(4)}</h2><p>仅汇总任务记录中已返回的费用字段；供应商未返回价格时显示为 0。</p></>}</section></div> : null}
    </main>
  </CanvasBoardApiProvider>;
}

export function mountCanvasAppV2(element: HTMLElement, dependencies: CanvasAppDependencies): () => void {
  const root = createRoot(element);
  root.render(<CanvasAppV2 {...dependencies} />);
  return () => root.unmount();
}

function canvasClientId(): string {
  const existing = sessionStorage.getItem('canvasClientId');
  if (existing) return existing;
  const id = `canvas_${crypto.randomUUID?.() || Date.now()}`;
  sessionStorage.setItem('canvasClientId', id);
  return id;
}

function formatTime(value: unknown): string {
  const timestamp = Number(value || 0);
  return timestamp ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toLocaleString() : '--';
}

type ManagerIconName = 'arrow-left' | 'check' | 'folder' | 'folder-input' | 'folder-plus' | 'grid' | 'inbox' | 'layers' | 'plus' | 'refresh' | 'restore' | 'sparkles' | 'trash' | 'x';

function Icon({ name }: { name: ManagerIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 2 };
  const paths: Record<ManagerIconName, ReactNode> = {
    'arrow-left': <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
    'folder-input': <><path d="M2 8a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" /><path d="m12 11 3 3-3 3" /><path d="M8 14h7" /></>,
    'folder-plus': <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 10v6M9 13h6" /></>,
    grid: <><rect height="7" rx="1" width="7" x="3" y="3" /><rect height="7" rx="1" width="7" x="14" y="3" /><rect height="7" rx="1" width="7" x="3" y="14" /><rect height="7" rx="1" width="7" x="14" y="14" /></>,
    inbox: <><path d="M4 5h16l2 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" /><path d="M2 12h5l2 3h6l2-3h5" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    refresh: <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" /></>,
    restore: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
    sparkles: <><path d="m12 3-1 4-4 1 4 1 1 4 1-4 4-1-4-1Z" /><path d="m19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7Z" /><path d="m5 14-.6 1.6L3 16l1.4.4L5 18l.6-1.6L7 16l-1.4-.4Z" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 15H6L5 6" /><path d="M10 11v6M14 11v6" /></>,
    x: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  };
  return <svg aria-hidden="true" className="manager-icon" height="16" viewBox="0 0 24 24" width="16" {...common}>{paths[name]}</svg>;
}

function FolderRow({ active, count, icon, label, onClick }: { active: boolean; count: number; icon: ManagerIconName; label: string; onClick: () => void }) {
  return <div className={`gate-folder-node ${active ? 'active' : ''}`}><button className="gate-folder-main" onClick={onClick} type="button"><Icon name={icon} /><span className="gate-folder-name">{label}</span><span className="gate-folder-count">{count}</span></button></div>;
}

function lockHolderName(holder: Record<string, unknown> | undefined): string {
  return String(holder?.username || holder?.ip || '其他用户');
}

function normalizeWorkflow(payload: unknown): { connections: unknown[]; nodes: unknown[] } {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const workflow = record.workflow && typeof record.workflow === 'object' ? record.workflow as Record<string, unknown> : record;
  return { connections: Array.isArray(workflow.connections) ? workflow.connections : [], nodes: Array.isArray(workflow.nodes) ? workflow.nodes : [] };
}

function downloadBlob(blob: Blob, disposition: string | null, fallback: string) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : quoted || fallback;
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), { download: filename, href: url });
  anchor.click();
  URL.revokeObjectURL(url);
}

function canvasGroupExportItems(nodes: unknown[]): Array<{ kind: string; name: string; text?: string; url?: string }> {
  const result: Array<{ kind: string; name: string; text?: string; url?: string }> = [];
  const urls = new Set<string>();
  const addMedia = (value: unknown, fallback: string) => {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const url = typeof value === 'string' ? value : String(record.url || '');
    if (!url || urls.has(url)) return;
    urls.add(url);
    const kind = String(record.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|m4a)(\?|$)/i.test(url) ? 'audio' : 'image'));
    result.push({ kind, name: String(record.name || fallback), url });
  };
  nodes.forEach((value, index) => {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const title = String(node.title || node.name || `${String(node.type || 'node')}-${index + 1}`);
    if (node.url) addMedia(node, title);
    if (Array.isArray(node.images)) node.images.forEach((item, itemIndex) => addMedia(item, `${title}-${itemIndex + 1}`));
    const text = String(node.outputText || (node.type === 'prompt' ? node.text || '' : '')).trim();
    if (text) result.push({ kind: 'text', name: `${title}.txt`, text });
  });
  return result;
}
