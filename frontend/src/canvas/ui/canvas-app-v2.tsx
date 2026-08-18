import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { CanvasDocument } from '../domain/types';
import { canvasDocumentSavePayload, type CanvasRepository } from '../infrastructure/canvas-repository';
import {
  createCanvasManagementClient,
  type CanvasFolder,
  type CanvasManagementClient,
  type CanvasSummary,
} from '../infrastructure/canvas-management';
import type { CanvasRuntime } from '../application/modern-canvas-runtime';
import { mountCanvasBoardV2 } from './canvas-board-v2';
import { canvasDocumentCost, readCanvasAssetInbox } from './canvas-app-domain';

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

function CanvasAppV2({ configuration = {}, management = createCanvasManagementClient(), repository, runtime }: CanvasAppDependencies) {
  const canvasKind = configuration.kind ?? 'classic';
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [trash, setTrash] = useState<CanvasSummary[]>([]);
  const [folders, setFolders] = useState<CanvasFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState('all');
  const [showTrash, setShowTrash] = useState(false);
  const [current, setCurrent] = useState<CanvasDocument | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [status, setStatus] = useState('正在加载画布列表…');
  const [backups, setBackups] = useState<Array<Record<string, unknown>> | null>(null);
  const [promptTarget, setPromptTarget] = useState('');
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; text: string }>>([]);
  const [inspector, setInspector] = useState<{ document: CanvasDocument; mode: 'cost' | 'logs' } | null>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [assets, setAssets] = useState<Array<{ id: string; kind: string; name: string; url: string }> | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const clientId = useRef(canvasClientId());
  const initialCanvasAttempted = useRef(false);

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
    const cleanup = mountCanvasBoardV2(host, null, { initialDocument: current, repository, runtime });
    return cleanup;
  }, [current, repository, runtime]);

  useEffect(() => {
    const release = () => {
      if (current?.id) void management.releaseLock(String(current.id), clientId.current, true);
    };
    window.addEventListener('pagehide', release, { once: true });
    return () => window.removeEventListener('pagehide', release);
  }, [current?.id, management]);

  useEffect(() => {
    const previous = window.openPromptTemplateModal;
    window.openPromptTemplateModal = (nodeId) => {
      setPromptTarget(nodeId);
      void fetch('/api/prompt-libraries').then((response) => response.json()).then((payload) => setTemplates(promptItems(payload))).catch(() => setTemplates([]));
    };
    return () => { if (previous) window.openPromptTemplateModal = previous; else delete window.openPromptTemplateModal; };
  }, []);

  const openCanvas = async (summary: CanvasSummary) => {
    setStatus('正在打开画布…');
    try {
      const lock = await management.acquireLock(summary.id, clientId.current, localStorage.getItem('canvasUserName') || '');
      if (!lock.ok) throw new Error(`画布正由 ${String(lock.holder?.username || '其他用户')} 编辑`);
      const loaded = await repository.get(summary.id);
      setCurrent(loaded);
      setStatus('');
      void runtime.recoverDocument(loaded).then(async (recovered) => {
        if (JSON.stringify(recovered) === JSON.stringify(loaded)) return;
        const saved = await repository.save(summary.id, canvasDocumentSavePayload(recovered));
        setCurrent((active) => active?.id === saved.id ? saved : active);
      }).catch((error) => setStatus(`任务恢复失败：${error instanceof Error ? error.message : String(error)}`));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    const canvasId = String(configuration.initialCanvasId || '').trim();
    if (!canvasId || current || initialCanvasAttempted.current) return;
    initialCanvasAttempted.current = true;
    void openCanvas(canvases.find((item) => item.id === canvasId) ?? { id: canvasId, kind: canvasKind });
  }, [canvases, canvasKind, configuration.initialCanvasId, current]);

  const closeCanvas = async () => {
    if (current?.id) await management.releaseLock(String(current.id), clientId.current).catch(() => undefined);
    setCurrent(null);
    setBackups(null);
    await refresh();
  };

  const create = async () => {
    try {
      const created = await management.create(createTitle || configuration.defaultTitle || '', {
        icon: canvasKind === 'smart' ? 'sparkles' : undefined,
        kind: canvasKind,
      });
      setCreateTitle('');
      await refresh();
      await openCanvas(created);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
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
    const workflow = window.CanvasBoardV2?.exportSelection();
    if (!workflow?.nodes.length) { setStatus('没有可导出的节点'); return; }
    const blob = new Blob([JSON.stringify({ version: 2, ...workflow }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement('a'), { download: `${String(current?.title || 'canvas')}-workflow.json`, href: url });
    anchor.click();
    URL.revokeObjectURL(url);
    setWorkflowOpen(false);
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
  const showAssets = async () => {
    try {
      const response = await fetch('/api/asset-library');
      if (!response.ok) throw new Error('加载资产库失败');
      setAssets(assetItems(await response.json()));
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  };
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
    const list = showTrash ? trash : activeFolder === 'all' ? canvases : activeFolder === 'root' ? canvases.filter((item) => !item.folder_id) : canvases.filter((item) => item.folder_id === activeFolder);
    return <main className="canvas-modern-manager">
      <section className="gate-panel canvas-modern-gate">
        <header className="gate-head">
          <div className="gate-head-text"><h1 className="gate-title">{showTrash ? '回收站' : configuration.heading || '经典画布 V2'}</h1><p className="gate-subtitle">{configuration.subtitle || 'React + TypeScript 独立文档与执行路径'}</p></div>
          <div className="gate-head-actions">
            {configuration.managerBackHref ? <a className="gate-icon-btn" href={configuration.managerBackHref}>返回首页</a> : null}
            {!showTrash ? <><select aria-label="画布文件夹" onChange={(event) => setActiveFolder(event.target.value)} value={activeFolder}><option value="all">全部画布</option><option value="root">未分类</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{String(folder.name || '未命名文件夹')}</option>)}</select><button className="gate-icon-btn" onClick={async () => { const name = window.prompt('文件夹名称')?.trim(); if (name) { await management.createFolder(name); await refresh(); } }} type="button">新建文件夹</button>{!['all', 'root'].includes(activeFolder) ? <button className="gate-icon-btn" onClick={async () => { if (window.confirm('删除此文件夹？文件夹内画布不会被永久删除。')) { await management.deleteFolder(activeFolder); setActiveFolder('all'); await refresh(); } }} type="button">删除文件夹</button> : null}</> : null}
            <button className="gate-icon-btn" onClick={() => void refresh()} type="button">刷新</button>
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
            <button className="canvas-modern-card-main" disabled={showTrash} onClick={() => void openCanvas(item)} type="button">
              <strong>{String(item.title || '未命名画布')}</strong><small>{formatTime(item.updated_at)}</small>
            </button>
            {showTrash ? <><button onClick={async () => { await management.restore(item.id); await refresh(); }} type="button">恢复</button><button onClick={async () => { if (window.confirm('永久删除后无法恢复，确定继续？')) { await management.purge(item.id); await refresh(); } }} type="button">永久删除</button></>
              : <><select aria-label={`移动 ${String(item.title || '画布')}`} onChange={async (event) => { await management.moveToFolder(item.id, event.target.value); await refresh(); }} value={String(item.folder_id || '')}><option value="">未分类</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{String(folder.name || '未命名文件夹')}</option>)}</select><button aria-label="移入回收站" onClick={() => void remove(item.id)} type="button">删除</button></>}
          </article>)}
        </div>
      </section>
    </main>;
  }

  return <main className="canvas-modern-editor">
    <header className="topbar canvas-modern-topbar">
      <div className="panel canvas-nav"><button className="tool-btn" onClick={() => void closeCanvas()} type="button">← 返回</button><div className="canvas-nav-meta"><strong>{String(current.title || '未命名画布')}</strong><small>{formatTime(current.updated_at)}</small></div></div>
      <div className="panel toolbar canvas-modern-toolbar">
        <div className="toolbar-items">{nodeButtons.map(([type, label]) => <button className="tool-btn" key={type} onClick={() => window.CanvasBoardV2?.addNode(type)} type="button">{label}</button>)}</div>
        <div className="toolbar-fixed"><button className="tool-btn" onClick={() => window.CanvasBoardV2?.groupSelected()} type="button">分组</button><button className="tool-btn" onClick={() => setWorkflowOpen(true)} type="button">工作流</button><button className="tool-btn" onClick={() => void showAssets()} type="button">资产库</button>{configuration.assetInboxKey ? <button className="tool-btn" onClick={importAssetInbox} type="button">导入素材</button> : null}<button className="tool-btn" onClick={() => void showInspector('cost')} type="button">费用</button><button className="tool-btn" onClick={() => void showInspector('logs')} type="button">日志</button><button className="tool-btn" onClick={() => void showBackups()} type="button">备份</button></div>
      </div>
    </header>
    <div className="canvas-modern-board" ref={boardRef} />
    {configuration.editorAddon}
    {backups ? <div className="modal open canvas-modern-backups"><section className="modal-panel"><header><strong>画布备份</strong><button onClick={() => setBackups(null)} type="button">关闭</button></header><button onClick={async () => { await repository.createBackup(String(current.id)); await showBackups(); }} type="button">立即备份</button>{backups.map((backup) => <div className="backup-item" key={String(backup.filename)}><span>{String(backup.filename)}</span><button onClick={async () => { const restored = await repository.restoreBackup(String(current.id), String(backup.filename)); setCurrent(restored); setBackups(null); }} type="button">恢复</button><button onClick={async () => { await management.deleteBackup(String(current.id), String(backup.filename)); await showBackups(); }} type="button">删除</button></div>)}</section></div> : null}
    {promptTarget ? <div className="modal open canvas-modern-backups"><section className="modal-panel"><header><strong>提示词模板</strong><button onClick={() => setPromptTarget('')} type="button">关闭</button></header>{templates.length ? templates.map((item) => <button key={item.id} onClick={() => { window.CanvasBoardV2?.updateNode(promptTarget, { text: item.text }); setPromptTarget(''); }} type="button"><strong>{item.name}</strong><small>{item.text.slice(0, 100)}</small></button>) : <p>暂无模板</p>}</section></div> : null}
    {workflowOpen ? <div className="modal open canvas-modern-backups"><section className="modal-panel"><header><strong>工作流导入 / 导出</strong><button onClick={() => setWorkflowOpen(false)} type="button">关闭</button></header><p>有选中节点时仅导出选区；未选中时导出整张画布。</p><button onClick={exportWorkflow} type="button">导出 JSON</button><label className="primary-btn">导入 JSON / ZIP<input accept=".json,.zip,application/json,application/zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorkflow(file); }} type="file" /></label></section></div> : null}
    {assets ? <div className="modal open canvas-modern-backups canvas-modern-assets"><section className="modal-panel"><header><strong>资产库</strong><button onClick={() => setAssets(null)} type="button">关闭</button></header><div className="canvas-modern-asset-grid">{assets.map((item) => <button key={item.id} onClick={() => { const id = window.CanvasBoardV2?.addNode('image'); if (id) window.CanvasBoardV2?.updateNode(id, { mediaKind: item.kind, name: item.name, url: item.url }); setAssets(null); }} type="button">{item.kind === 'image' ? <img alt={item.name} src={item.url} /> : <span>{item.kind === 'video' ? '视频' : item.kind === 'audio' ? '音频' : '文件'}</span>}<small>{item.name}</small></button>)}</div>{!assets.length ? <p>资产库暂无可用媒体。</p> : null}</section></div> : null}
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

function promptItems(payload: unknown): Array<{ id: string; name: string; text: string }> {
  const result: Array<{ id: string; name: string; text: string }> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const text = String(record.text || record.prompt || record.content || '');
    if (text) result.push({ id: String(record.id || `${result.length}`), name: String(record.name || record.title || '模板'), text });
    Object.values(record).forEach((item) => { if (item !== record.text && item !== record.prompt && item !== record.content) visit(item); });
  };
  visit(payload);
  return result;
}

function normalizeWorkflow(payload: unknown): { connections: unknown[]; nodes: unknown[] } {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const workflow = record.workflow && typeof record.workflow === 'object' ? record.workflow as Record<string, unknown> : record;
  return { connections: Array.isArray(workflow.connections) ? workflow.connections : [], nodes: Array.isArray(workflow.nodes) ? workflow.nodes : [] };
}

function assetItems(payload: unknown): Array<{ id: string; kind: string; name: string; url: string }> {
  const result: Array<{ id: string; kind: string; name: string; url: string }> = [];
  const visit = (value: unknown, categoryKind = '') => {
    if (Array.isArray(value)) { value.forEach((item) => visit(item, categoryKind)); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const kind = String(record.kind || record.type || categoryKind || 'image').toLowerCase();
    const url = String(record.url || record.uri || record.asset_url || '');
    if (url && kind !== 'workflow') result.push({ id: String(record.id || url), kind: /video/.test(kind) ? 'video' : /audio/.test(kind) ? 'audio' : 'image', name: String(record.name || record.title || '素材'), url });
    Object.entries(record).forEach(([key, item]) => { if (!['url', 'uri', 'asset_url'].includes(key)) visit(item, key === 'items' ? kind : categoryKind); });
  };
  visit(payload);
  return [...new Map(result.map((item) => [item.id, item])).values()];
}
