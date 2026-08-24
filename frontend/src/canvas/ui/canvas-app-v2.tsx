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
import { mountCanvasBoardV2 } from './canvas-board-v2';
import { canvasDocumentCost, readCanvasAssetInbox } from './canvas-app-domain';
import { AssetLibraryDialog, type CanvasAssetLibraryRequest } from './asset-library-dialog';
import { PromptLibraryDialog, type PromptLibraryRequest } from './prompt-library-dialog';
import { CanvasManager, ScopedCanvasManager } from './canvas-manager';

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
  ['image', '上传', 'image-plus'], ['prompt', '提示词', 'text-cursor-input'], ['loop', '循环', 'repeat-2'], ['llm', 'LLM', 'message-square-text'], ['generator', 'API生成', 'wand-sparkles'],
  ['msgen', 'ModelScope生成', 'cloud-lightning'], ['video', '视频生成', 'clapperboard'], ['comfy', 'ComfyUI', 'workflow'], ['ltxDirector', 'LTX Director', 'film'], ['output', 'Output', 'circle-dot'],
] as const;

function CanvasAppV2({ configuration = {}, management = getDefaultCanvasManagementClient(), repository, runtime }: CanvasAppDependencies) {
  const canvasKind = configuration.kind ?? 'classic';
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [trash, setTrash] = useState<CanvasSummary[]>([]);
  const [folders, setFolders] = useState<CanvasFolder[]>([]);
  const [current, setCurrent] = useState<CanvasDocument | null>(null);
  const [status, setStatus] = useState('正在加载画布列表…');
  const [backups, setBackups] = useState<Array<Record<string, unknown>> | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptLibraryRequest | null>(null);
  const [inspector, setInspector] = useState<{ document: CanvasDocument; mode: 'cost' | 'logs' } | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [assetRequest, setAssetRequest] = useState<CanvasAssetLibraryRequest | null>(null);
  const [lockHolder, setLockHolder] = useState<Record<string, unknown> | null>(null);
  const [lockIssue, setLockIssue] = useState('');
  const [syncIssue, setSyncIssue] = useState('');
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => localStorage.getItem('canvas_quick_toolbar_collapsed') === '1');
  const boardRef = useRef<HTMLDivElement | null>(null);
  const clientId = useRef(canvasClientId());
  const initialCanvasAttempted = useRef(false);
  const lastKnownUpdatedAt = useRef(0);
  const ownsLock = useRef(false);
  const remoteSyncInFlight = useRef(false);

  const refresh = useCallback(async () => {
    setStatus('正在加载画布列表…');
    try {
      const [allActive, allDeleted, folderList] = await Promise.all([management.list(), management.listTrash(), management.listFolders()]);
      const matchesKind = (item: CanvasSummary) => !configuration.kind || String(item.kind || 'classic') === canvasKind;
      const active = allActive.filter(matchesKind);
      const deleted = allDeleted.filter(matchesKind);
      setCanvases(active.sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0)));
      setTrash(deleted);
      setFolders(folderList);
      setStatus(active.length ? '' : '还没有画布，新建一个开始创作。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [canvasKind, configuration.kind, management]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const host = boardRef.current;
    if (!host || !current) return;
    const cleanup = mountCanvasBoardV2(host, null, { clientId: clientId.current, initialDocument: current, legacyUi: !configuration.kind, readOnly: Boolean(lockHolder), repository, runtime });
    window.CanvasBoardV2?.setReadOnly(Boolean(lockHolder));
    return cleanup;
  }, [configuration.kind, current, repository, runtime]);

  useEffect(() => { window.CanvasBoardV2?.setReadOnly(Boolean(lockHolder)); }, [lockHolder]);

  useEffect(() => {
    if (!current || configuration.kind) return;
    window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
  }, [configuration.kind, current, lockHolder, toolbarCollapsed]);

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
      setPromptRequest({ onApply: (text) => { window.CanvasBoardV2?.updateNode(nodeId, { text }); } });
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
      const result = window.CanvasBoardV2?.syncRemote(remote);
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

  const editIdentity = async () => {
    const currentName = localStorage.getItem('canvasUserName') || '';
    const name = window.prompt('编辑身份名称', currentName);
    if (name === null) return;
    localStorage.setItem('canvasUserName', name.trim());
    if (current?.id) await acquireCurrentLock();
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
    const workflow = window.CanvasBoardV2?.exportSelection();
    if (!workflow?.nodes.length) { setStatus('没有可导出的节点'); return; }
    const blob = new Blob([JSON.stringify({ version: 2, ...workflow }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement('a'), { download: `${String(current?.title || 'canvas')}-workflow.json`, href: url });
    anchor.click();
    URL.revokeObjectURL(url);
    setWorkflowOpen(false);
  };
  const exportWorkflowArchive = async () => {
    const workflow = window.CanvasBoardV2?.exportSelection();
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
    const workflow = window.CanvasBoardV2?.exportSelection();
    if (!workflow?.nodes.length) { setStatus('没有可保存的节点'); return; }
    const name = String(current?.title || 'canvas');
    setWorkflowOpen(false);
    setAssetRequest({ saveWorkflow: { ...workflow, filename: `${name}-workflow.zip`, name } });
  };
  const exportSelectedResults = async () => {
    const workflow = window.CanvasBoardV2?.exportSelection();
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
      const ids = window.CanvasBoardV2?.importWorkflow(normalized) ?? [];
      setStatus(ids.length ? `已导入 ${ids.length} 个节点` : '文件中没有可导入节点');
      setWorkflowOpen(false);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
  const showAssets = () => setAssetRequest({
    onInsert: (item) => {
      const id = window.CanvasBoardV2?.addNode('image', { x: 100, y: 100 });
      if (id) window.CanvasBoardV2?.updateNode(id, { mediaKind: item.kind, name: item.name, url: item.url });
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
      const id = window.CanvasBoardV2?.addNode('image', {
        x: 100 + (index % columns) * 280,
        y: 100 + Math.floor(index / columns) * 220,
      });
      if (id) window.CanvasBoardV2?.updateNode(id, { mediaKind: item.kind, name: item.name, url: item.url });
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
    const Manager = configuration.kind === 'classic' ? ScopedCanvasManager : CanvasManager;
    return <Manager canvases={canvases} configuration={configuration} folders={folders} management={management} onOpen={openCanvas} onRefresh={refresh} onStatus={setStatus} status={status} trash={trash} />;
  }

  const classicEditor = !configuration.kind;
  const toggleToolbar = () => {
    setToolbarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem('canvas_quick_toolbar_collapsed', next ? '1' : '0');
      return next;
    });
  };

  return <main className={`canvas-modern-editor ${classicEditor ? 'shell' : ''}`}>
    {classicEditor ? <header className="topbar canvas-modern-topbar">
      <div className="panel canvas-nav">
        <button aria-label="返回画布管理" className="tool-btn" onClick={() => void closeCanvas()} title="返回画布管理" type="button"><i className="w-4 h-4" data-lucide="arrow-left" /></button>
        <div className="canvas-nav-meta">
          <div className="current-canvas-title">{String(current.title || '未命名画布')}</div>
          <div className="current-canvas-time">{lockHolder ? `只读 · ${lockHolderName(lockHolder)} 编辑中` : syncIssue || formatTime(current.updated_at)}</div>
        </div>
        {lockHolder ? <div className="canvas-lock-badge locked-by-other" title={`${lockHolderName(lockHolder)} 正在编辑`}><i className="w-3.5 h-3.5" data-lucide="lock" /><span>{lockHolderName(lockHolder)}</span></div> : null}
        <button aria-label="设置我的名称" className="canvas-identity-btn" onClick={() => void editIdentity()} title="设置我的名称" type="button"><i className="w-3.5 h-3.5" data-lucide="user-pen" /><span>我的名称</span></button>
      </div>
      <div className={`panel toolbar editor-only canvas-modern-toolbar ${toolbarCollapsed ? 'collapsed' : ''}`}>
        <button aria-label={toolbarCollapsed ? '展开快捷菜单' : '折叠快捷菜单'} className="tool-btn toolbar-toggle" onClick={toggleToolbar} title={toolbarCollapsed ? '展开快捷菜单' : '折叠快捷菜单'} type="button"><i className="w-4 h-4" data-lucide="chevron-left" /></button>
        <div className="toolbar-items">
          {nodeButtons.map(([type, label, icon]) => <button className="tool-btn" disabled={Boolean(lockHolder)} key={type} onClick={() => window.CanvasBoardV2?.addNode(type)} type="button"><i className="w-4 h-4" data-lucide={icon} /><span>{label}</span></button>)}
          <button className="tool-btn" disabled={Boolean(lockHolder)} onClick={() => window.CanvasBoardV2?.groupSelected()} type="button"><i className="w-4 h-4" data-lucide="group" /><span>分组</span></button>
        </div>
        <div className="toolbar-fixed">
          <button aria-label="导入导出工作流" className="tool-btn toolbar-workflow" onClick={() => setWorkflowOpen(true)} title="导入导出工作流" type="button"><i className="w-4 h-4" data-lucide="package-open" /><span>工作流</span></button>
          <button aria-label="资产库" className="tool-btn toolbar-asset canvas-asset-toggle" onClick={showAssets} title="资产库" type="button"><i className="w-4 h-4" data-lucide="library" /><span>资产库</span></button>
          <button aria-label="费用仪表盘" className="tool-btn toolbar-cost" onClick={() => void showInspector('cost')} title="费用仪表盘" type="button"><i className="w-4 h-4" data-lucide="circle-dollar-sign" /><span>费用 ¥{canvasDocumentCost(current).toFixed(2)}</span></button>
          <button aria-label="日志" className="tool-btn toolbar-log" onClick={() => void showInspector('logs')} title="日志" type="button"><i className="w-4 h-4" data-lucide="list-todo" /><span>日志</span></button>
          <button aria-label="备份" className="tool-btn toolbar-backup" disabled={Boolean(lockHolder)} onClick={() => void showBackups()} title="备份" type="button"><i className="w-4 h-4" data-lucide="hard-drive" /><span>备份</span></button>
        </div>
      </div>
    </header> : <header className="topbar canvas-modern-topbar">
      <div className="panel canvas-nav"><button className="tool-btn" onClick={() => void closeCanvas()} type="button">← 返回</button><div className="canvas-nav-meta"><strong>{String(current.title || '未命名画布')}</strong><small>{lockHolder ? `只读 · ${lockHolderName(lockHolder)} 编辑中` : syncIssue || formatTime(current.updated_at)}</small></div><button className="tool-btn" onClick={() => void editIdentity()} type="button">编辑身份</button></div>
      <div className="panel toolbar canvas-modern-toolbar">
        <div className="toolbar-items">{nodeButtons.map(([type, label]) => <button className="tool-btn" disabled={Boolean(lockHolder)} key={type} onClick={() => window.CanvasBoardV2?.addNode(type)} type="button">{label}</button>)}</div>
        <div className="toolbar-fixed"><button className="tool-btn" disabled={Boolean(lockHolder)} onClick={() => window.CanvasBoardV2?.undo()} title="Ctrl/⌘ + Z" type="button">撤销</button><button className="tool-btn" disabled={Boolean(lockHolder)} onClick={() => window.CanvasBoardV2?.redo()} title="Ctrl/⌘ + Shift + Z" type="button">重做</button><button className="tool-btn" disabled={Boolean(lockHolder)} onClick={() => window.CanvasBoardV2?.groupSelected()} type="button">分组</button><button className="tool-btn" onClick={() => setWorkflowOpen(true)} type="button">工作流</button><button className="tool-btn" onClick={showAssets} type="button">资产库</button>{configuration.assetInboxKey ? <button className="tool-btn" disabled={Boolean(lockHolder)} onClick={importAssetInbox} type="button">导入素材</button> : null}<button className="tool-btn" onClick={() => void showInspector('cost')} type="button">费用</button><button className="tool-btn" onClick={() => void showInspector('logs')} type="button">日志</button><button className="tool-btn" disabled={Boolean(lockHolder)} onClick={() => void showBackups()} type="button">备份</button></div>
      </div>
    </header>}
    <div className="canvas-modern-board" ref={boardRef} style={classicEditor ? { inset: 0 } : undefined} />
    {classicEditor ? <div className="hint editor-only">拖拽画布移动，Ctrl 框选多选，拖动选中节点可一起移动。上传/提示词节点右下端口拖线到生成节点。</div> : null}
    {configuration.editorAddon}
    {lockHolder ? <div className="canvas-modern-readonly-overlay"><section><strong>只读模式</strong><span>{lockHolderName(lockHolder)} 正在编辑此画布</span>{lockIssue ? <small>{lockIssue}</small> : null}<button className="primary-btn" onClick={() => void acquireCurrentLock()} type="button">尝试取得编辑锁</button></section></div> : null}
    {backups ? <div className="modal open canvas-modern-backups"><section className="modal-panel"><header><strong>画布备份</strong><button onClick={() => setBackups(null)} type="button">关闭</button></header><button onClick={async () => { await repository.createBackup(String(current.id)); await showBackups(); }} type="button">立即备份</button>{backups.map((backup) => <div className="backup-item" key={String(backup.filename)}><span>{String(backup.filename)}</span><button onClick={async () => { const restored = await repository.restoreBackup(String(current.id), String(backup.filename)); setCurrent(restored); setBackups(null); }} type="button">恢复</button><button onClick={async () => { await management.deleteBackup(String(current.id), String(backup.filename)); await showBackups(); }} type="button">删除</button></div>)}</section></div> : null}
    {promptRequest ? <PromptLibraryDialog onClose={() => setPromptRequest(null)} request={promptRequest} /> : null}
    {workflowOpen ? <div className="modal open canvas-modern-backups"><section className="modal-panel"><header><strong>工作流导入 / 导出</strong><button onClick={() => setWorkflowOpen(false)} type="button">关闭</button></header><p>有选中节点时仅导出选区；分组会自动包含其成员。ZIP 会携带节点引用的本地媒体，导入后自动恢复资源地址。</p><button onClick={exportWorkflow} type="button">导出 JSON</button><button className="primary-btn" onClick={() => void exportWorkflowArchive()} type="button">导出 ZIP（含资源）</button><button onClick={saveWorkflowToLibrary} type="button">保存到工作流库</button><button onClick={() => void exportSelectedResults()} type="button">批量导出选区结果</button><label className="primary-btn">导入 JSON / ZIP<input accept=".json,.zip,application/json,application/zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorkflow(file); }} type="file" /></label></section></div> : null}
    {assetRequest ? <AssetLibraryDialog onClose={() => setAssetRequest(null)} request={assetRequest} /> : null}
    {inspector ? <div className="modal open canvas-modern-backups"><section className="modal-panel"><header><strong>{inspector.mode === 'logs' ? '生成日志' : '费用汇总'}</strong><button onClick={() => setInspector(null)} type="button">关闭</button></header>{inspector.mode === 'logs' ? <>{(Array.isArray(inspector.document.logs) ? inspector.document.logs : []).slice().reverse().map((log, index) => <pre key={String((log as Record<string, unknown>).id || index)}>{JSON.stringify(log, null, 2)}</pre>)}</> : <><h2>¥ {canvasDocumentCost(inspector.document).toFixed(4)}</h2><p>仅汇总任务记录中已返回的费用字段；供应商未返回价格时显示为 0。</p></>}</section></div> : null}
  </main>;
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
