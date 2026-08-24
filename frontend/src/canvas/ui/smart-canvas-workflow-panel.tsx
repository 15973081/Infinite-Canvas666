import { useEffect, useRef, useState, type DragEvent } from 'react';

export interface SmartWorkflowSelection { connections: unknown[]; nodes: unknown[] }

export function SmartCanvasWorkflowPanel({ onClose, onImport, onSaveToLibrary, onStatus, title }: {
  onClose(): void;
  onImport(file: File): Promise<number>;
  onSaveToLibrary(workflow: SmartWorkflowSelection): void;
  onStatus(message: string): void;
  title: string;
}) {
  const [selection, setSelection] = useState(() => selectedWorkflow());
  const [dragOver, setDragOver] = useState(false);
  const [meta, setMeta] = useState('');
  const [metaState, setMetaState] = useState<'busy' | 'success' | ''>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const refresh = () => setSelection(selectedWorkflow());
    window.addEventListener('canvas-board-v2-selection', refresh);
    window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
    return () => window.removeEventListener('canvas-board-v2-selection', refresh);
  }, []);

  const currentSelection = () => {
    const value = selectedWorkflow();
    setSelection(value);
    return value;
  };
  const exportJson = () => {
    const workflow = currentSelection();
    if (!workflow.nodes.length) { setMeta('未选择节点，请先选中要导出的组件'); onStatus('未选择节点，请先选中要导出的组件'); return; }
    const payload = smartCanvasWorkflowPayload(workflow);
    downloadWorkflowBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), smartCanvasWorkflowFilename(title, 'json'));
    onStatus('已导出智能画布工作流 JSON');
  };
  const exportArchive = async () => {
    const workflow = currentSelection();
    if (!workflow.nodes.length) { setMeta('未选择节点，请先选中要导出的组件'); onStatus('未选择节点，请先选中要导出的组件'); return; }
    const filename = smartCanvasWorkflowFilename(title, 'zip');
    setMetaState('busy'); setMeta('正在打包资源...');
    try {
      const response = await fetch('/api/canvas-workflows/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...smartCanvasWorkflowPayload(workflow), filename, include_resources: true }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, '导出工作流失败'));
      downloadWorkflowBlob(await response.blob(), filename, response.headers.get('Content-Disposition'));
      setMetaState('success'); setMeta(`已导出 ${workflow.nodes.length} 个节点，包含可找到的本地资源`);
      onStatus('已导出包含资源的智能画布工作流包');
    } catch (error) { setMetaState(''); setMeta(errorMessage(error)); onStatus(errorMessage(error)); }
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setMetaState('busy'); setMeta('正在导入工作流...');
    try {
      const count = await onImport(file);
      onStatus(count ? `已导入 ${count} 个节点` : '文件中没有可导入节点');
    } catch (error) { setMetaState(''); setMeta(errorMessage(error)); onStatus(errorMessage(error)); }
  };
  const saveToLibrary = () => {
    const workflow = currentSelection();
    if (!workflow.nodes.length) { setMeta('未选择节点，请先选中要导出的组件'); return; }
    onSaveToLibrary(workflow);
  };
  const exportResults = async () => {
    const workflow = currentSelection();
    const items = smartCanvasGroupExportItems(workflow.nodes);
    if (!items.length) { setMeta('选区中没有可批量导出的媒体或文本'); onStatus('选区中没有可批量导出的媒体或文本'); return; }
    const folder = window.prompt('导出到服务器文件夹（留空使用默认导出目录）', '');
    if (folder === null) return;
    setMetaState('busy'); setMeta('正在批量导出选区结果...');
    try {
      const response = await fetch('/api/smart-canvas/group-export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folder.trim(), group_name: title || 'canvas', items }),
      });
      const payload = await response.json().catch(() => ({})) as { count?: number; detail?: string; folder?: string };
      if (!response.ok) throw new Error(payload.detail || '批量导出失败');
      const message = `已导出 ${Number(payload.count || items.length)} 项到 ${String(payload.folder || '默认导出目录')}`;
      setMetaState('success'); setMeta(message); onStatus(message);
    } catch (error) { setMetaState(''); setMeta(errorMessage(error)); onStatus(errorMessage(error)); }
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation(); setDragOver(false);
    const file = [...event.dataTransfer.files].find((item) => /\.(json|zip)$/i.test(item.name));
    if (file) void importFile(file);
  };
  const defaultMeta = selection.nodes.length ? `已选择 ${selection.nodes.length} 个节点，${selection.connections.length} 条连线` : '未选择节点，请先选中要导出的组件';
  const sub = selection.nodes.length ? '导出当前选中内容，或把工作流导入到当前画布' : '请先选中节点再导出；导入会追加到当前画布';

  return <aside className="workflow-transfer-panel open" id="smartWorkflowTransferModal" onPointerDown={(event) => event.stopPropagation()}>
    <div className="workflow-transfer-head"><div><div className="workflow-transfer-title">导入导出工作流</div><div className="workflow-transfer-sub" id="smartWorkflowTransferSub">{sub}</div></div><button className="asset-mini-btn" onClick={onClose} title="关闭" type="button"><i data-lucide="x" /></button></div>
    <div className="workflow-transfer-body">
      <section className="workflow-transfer-card"><div className="workflow-transfer-card-head"><i data-lucide="upload" /><strong>导出工作流</strong></div><p>使用当前选中的节点和它们之间的连线生成工作流。</p><div className={`workflow-transfer-meta ${metaState}`} id="smartWorkflowExportMeta">{meta || defaultMeta}</div><div className="workflow-transfer-actions workflow-export-actions"><button className="workflow-transfer-btn secondary" onClick={exportJson} type="button"><i data-lucide="file-json" /><span>导出 JSON</span></button><button className="workflow-transfer-btn primary" onClick={() => void exportArchive()} type="button"><i data-lucide="package" /><span>导出并包含资源</span></button><button className="workflow-transfer-btn secondary" onClick={saveToLibrary} type="button"><i data-lucide="library" /><span>保存到工作流库</span></button><button className="workflow-transfer-btn secondary" onClick={() => void exportResults()} type="button"><i data-lucide="folder-output" /><span>批量导出选区结果</span></button></div></section>
      <section className="workflow-transfer-card"><div className="workflow-transfer-card-head"><i data-lucide="download" /><strong>导入工作流</strong></div><p>支持工作流 JSON，也支持包含资源的 ZIP 包。导入内容会追加到当前画布。</p><div className={`workflow-import-drop ${dragOver ? 'drag-over' : ''}`} id="smartWorkflowImportDropZone" onClick={() => inputRef.current?.click()} onDragLeave={() => setDragOver(false)} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setDragOver(true); }} onDrop={drop}><i data-lucide="file-up" /><span>拖入 JSON / ZIP 工作流</span><small>或点击选择文件</small></div><input accept=".json,.zip,application/json,application/zip" hidden id="smartWorkflowImportInput" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void importFile(file); }} ref={inputRef} type="file" /></section>
    </div>
  </aside>;
}

export function smartCanvasWorkflowPayload(workflow: SmartWorkflowSelection, exportedAt = Date.now()) {
  return {
    format: 'infinite-smart-canvas-workflow', version: 1, canvas_type: 'smart', exported_at: exportedAt,
    nodes: workflow.nodes.map(serializableNode), connections: structuredClone(workflow.connections),
  };
}

export function smartCanvasGroupExportItems(nodes: unknown[]): Array<{ kind: string; name: string; text?: string; url?: string }> {
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

function selectedWorkflow(): SmartWorkflowSelection {
  if (!(window.CanvasBoardV2?.selectedNodeIds().length)) return { connections: [], nodes: [] };
  return window.CanvasBoardV2.exportSelection();
}
function serializableNode(value: unknown) {
  const node = structuredClone(value && typeof value === 'object' ? value as Record<string, unknown> : {});
  node.running = false; node.pending = 0; node.queued = false;
  delete node.pendingTasks; delete node._dom;
  return node;
}
function smartCanvasWorkflowFilename(title: string, extension: 'json' | 'zip') {
  const safe = (title || 'smart-canvas').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '-').slice(0, 48) || 'smart-canvas';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return `${safe}-workflow-${stamp}.${extension}`;
}
function downloadWorkflowBlob(blob: Blob, fallback: string, disposition?: string | null) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), { download: encoded ? decodeURIComponent(encoded) : quoted || fallback, href: url });
  anchor.click(); URL.revokeObjectURL(url);
}
async function responseMessage(response: Response, fallback: string) { const payload = await response.json().catch(() => ({})) as { detail?: string }; return payload.detail || fallback; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
