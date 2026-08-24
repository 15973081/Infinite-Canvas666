import { useEffect, useMemo, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasNode } from '../domain/types';

export interface SmartImageItem extends Record<string, unknown> { kind?: string; name?: string; url?: string }
export interface SmartImagePendingTask extends Record<string, unknown> { failed?: boolean; kind?: string; providerId?: string; querying?: boolean; recoverTaskId?: string; taskId: string }
export interface SmartImageLayout { cols: number; height: number; rows: number; thumb: number; visibleRows?: number; width: number }
type SmartImagePatch = Record<string, unknown> | ((node: CanvasNode) => Record<string, unknown>);

const activeTaskPolls = new Map<string, Promise<Record<string, unknown>>>();

export function smartImageMediaKind(item: SmartImageItem): 'audio' | 'file' | 'image' | 'text' | 'video' {
  const kind = String(item.kind || '').toLowerCase();
  const url = String(item.url || '').toLowerCase();
  if (kind === 'file') return 'file';
  if (kind === 'text' || /\.(txt|json|csv|srt|vtt|md)(\?|$)/.test(url)) return 'text';
  if (kind === 'audio' || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(url)) return 'audio';
  if (kind === 'video' || /\.(mp4|webm|mov|m4v)(\?|$)/.test(url)) return 'video';
  return 'image';
}

function mediaSize(item: SmartImageItem): { height: number; width: number } {
  return {
    height: Number(item.natural_h || item.height || item.h || item.layout_h || item.preview_h || 0),
    width: Number(item.natural_w || item.width || item.w || item.layout_w || item.preview_w || 0),
  };
}

export function smartImageNodeLayout(node: CanvasNode): SmartImageLayout {
  const images = smartImageItems(node);
  const count = images.length;
  const scaleValue = Number(node.scale);
  const scale = Number.isFinite(scaleValue) && scaleValue > 0 ? (count > 1 && scaleValue === 1.6 ? 0.8 : scaleValue) : (count > 1 ? 0.8 : 2);
  const explicitW = Number(node.w);
  const explicitH = Number(node.h);
  if (!count) {
    const pending = Number(node.pending) > 0 || Boolean(node.queued);
    return { cols: 1, rows: 1, thumb: Math.round(96 * scale), width: Number.isFinite(explicitW) && explicitW > 24 ? explicitW : Math.round(pending ? 260 * scale : 316), height: Number.isFinite(explicitH) && explicitH > 24 ? explicitH : Math.round(pending ? 180 * scale : 194) };
  }
  if (count === 1) {
    if (Number.isFinite(explicitW) && explicitW > 24 && Number.isFinite(explicitH) && explicitH > 24) return { cols: 1, rows: 1, thumb: Math.round(96 * scale), width: Math.round(explicitW), height: Math.round(explicitH) };
    const natural = mediaSize(images[0]);
    if (natural.width > 0 && natural.height > 0) {
      const fit = Math.min(260 * scale / natural.width, 220 * scale / natural.height);
      return { cols: 1, rows: 1, thumb: Math.round(96 * scale), width: Math.max(72, Math.round(natural.width * fit)), height: Math.max(72, Math.round(natural.height * fit)) };
    }
    return { cols: 1, rows: 1, thumb: Math.round(96 * scale), width: Math.round(260 * scale), height: Math.round(180 * scale) };
  }
  const thumb = Math.round(224 * scale);
  const grid = images.find((item) => (item.grid as Record<string, unknown> | undefined)?.type === 'grid-split')?.grid as Record<string, unknown> | undefined;
  const cols = grid ? Math.max(1, Number(grid.cols || 1)) : Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
  const rows = grid ? Math.max(1, Number(grid.rows || 1)) : Math.ceil(count / cols);
  const visibleRows = Math.min(3, rows);
  if (Number.isFinite(explicitW) && explicitW > 40 && Number.isFinite(explicitH) && explicitH > 40) {
    const fitted = fitGroupLayout(count, explicitW, explicitH, thumb, grid ? cols : undefined);
    return { cols: fitted.cols, rows: fitted.rows, visibleRows: fitted.visibleRows, thumb: fitted.thumb, width: Math.round(explicitW), height: fitted.visibleRows * (fitted.thumb + 8) - 8 + 32 };
  }
  return { cols, rows, visibleRows, thumb, width: Number.isFinite(explicitW) && explicitW > 40 ? explicitW : Math.max(Math.round(226 * scale), cols * (thumb + 8) + 24), height: visibleRows * (thumb + 8) - 8 + 32 };
}

function fitGroupLayout(count: number, width: number, height: number, maxThumb: number, fixedCols?: number): { cols: number; rows: number; thumb: number; visibleRows: number } {
  let best: { cols: number; rows: number; score: number[]; thumb: number; visibleRows: number } | null = null;
  const start = fixedCols || 1;
  const end = fixedCols || count;
  for (let cols = start; cols <= end; cols += 1) {
    const rows = Math.ceil(count / cols);
    const visibleRows = Math.min(3, rows);
    const rawThumb = Math.floor(Math.min((width - 32 - (cols - 1) * 8) / cols, (height - 32 - (visibleRows - 1) * 8) / visibleRows));
    const thumb = Math.max(28, Math.min(maxThumb, rawThumb));
    const usedW = cols * thumb + (cols - 1) * 8 + 32;
    const usedH = visibleRows * thumb + (visibleRows - 1) * 8 + 32;
    const score = [rawThumb >= 28 ? 1 : 0, thumb, thumb >= maxThumb ? cols : 0, -(Math.max(0, width - usedW) + Math.max(0, height - usedH) * 0.35), -rows];
    if (!best || score.some((value, index) => value !== best!.score[index] && value > best!.score[index] && score.slice(0, index).every((entry, previous) => entry === best!.score[previous]))) best = { cols, rows, score, thumb, visibleRows };
  }
  return best || { cols: Math.min(count, 2), rows: Math.ceil(count / Math.min(count, 2)), thumb: 28, visibleRows: Math.min(3, Math.ceil(count / Math.min(count, 2))) };
}

export function smartImageItems(node: CanvasNode): SmartImageItem[] {
  const source = Array.isArray(node.images) ? node.images : node.url ? [{ url: node.url, name: node.name, kind: node.kind }] : [];
  return source.flatMap((item) => {
    if (typeof item === 'string') return [{ url: item, name: 'Image', kind: smartImageMediaKind({ url: item }) }];
    if (!item || typeof item !== 'object') return [];
    const value = item as SmartImageItem;
    const url = String(value.originalLocalUrl || value.localUrl || value.sourceUrl || value.local_url || value.source_url || value.url || '');
    return url ? [{ ...value, url, kind: value.kind || smartImageMediaKind({ ...value, url }) }] : [];
  });
}

export function smartImageDragPayload(item: SmartImageItem): Record<string, unknown> {
  return {
    asset_item_id: item.asset_item_id,
    asset_uris: item.asset_uris,
    kind: smartImageMediaKind(item),
    name: String(item.name || 'asset'),
    url: String(item.url || ''),
  };
}

function startSmartImageDrag(event: ReactDragEvent<HTMLElement>, item: SmartImageItem) {
  event.stopPropagation();
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-smart-canvas-image', JSON.stringify(smartImageDragPayload(item)));
  event.dataTransfer.setData('text/plain', String(item.url || ''));
}

export function smartImagePendingTasks(node: CanvasNode): SmartImagePendingTask[] {
  return Array.isArray(node.pendingTasks) ? node.pendingTasks.filter((task): task is SmartImagePendingTask => Boolean(task && typeof task === 'object' && String((task as Record<string, unknown>).taskId || ''))) : [];
}

export function smartImageTaskPatch(node: CanvasNode, taskId: string, result: Record<string, unknown>): Record<string, unknown> {
  const tasks = smartImagePendingTasks(node);
  const task = tasks.find((item) => item.taskId === taskId);
  const remaining = tasks.filter((item) => item.taskId !== taskId);
  const raw = Array.isArray(result.images) ? result.images : Array.isArray(result.outputs) ? result.outputs : [];
  const kind = String(task?.kind || 'image');
  const extension = kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : kind === 'text' ? 'txt' : 'png';
  const additions = raw.flatMap((item, index) => {
    const value = typeof item === 'string' ? { url: item } : item && typeof item === 'object' ? item as SmartImageItem : null;
    return value?.url ? [{ ...value, kind: value.kind || kind, name: value.name || `output-${index + 1}.${extension}`, generatedResult: true }] : [];
  });
  const images = [...smartImageItems(node), ...additions];
  const pending = Math.max(0, Number(node.pending || tasks.length) - 1);
  return {
    images,
    outputKind: additions.length ? kind : node.outputKind,
    pending,
    pendingTasks: remaining.length ? remaining : undefined,
    ...(pending || remaining.length ? {} : { h: undefined, queued: false, runElapsedMs: Math.max(0, Date.now() - Number(node.runStartedAt || Date.now())), runFinishedAt: Date.now(), runTimerHidden: false, running: false, title: images.length > 1 ? (kind === 'video' ? 'Videos' : kind === 'audio' ? 'Audios' : 'Group') : (kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'Image'), w: undefined }),
  };
}

async function pollTask(taskId: string): Promise<Record<string, unknown>> {
  const existing = activeTaskPolls.get(taskId);
  if (existing) return existing;
  const promise = (async () => {
    for (let attempt = 0; attempt < 900; attempt += 1) {
      const response = await fetch(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`);
      const task = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(task.detail || `任务查询失败 (${response.status})`));
      if (task.status === 'succeeded') return task.result && typeof task.result === 'object' ? task.result as Record<string, unknown> : {};
      if (task.status === 'failed') throw Object.assign(new Error(String(task.error || '任务失败')), { upstreamTaskId: String(task.upstream_task_id || '') });
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error('任务查询超时');
  })();
  activeTaskPolls.set(taskId, promise);
  try { return await promise; } finally { activeTaskPolls.delete(taskId); }
}

function previewUrl(item: SmartImageItem, size: number): string {
  const url = String(item.url || '');
  if (!url || url.startsWith('data:') || url.startsWith('blob:') || (!url.startsWith('/output/') && !url.startsWith('/assets/'))) return url;
  return /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|mp4|webm|mov|m4v)(\?|#|$)/i.test(url) ? `/api/media-preview?w=${size}&url=${encodeURIComponent(url)}` : url;
}

function resolution(item: SmartImageItem): string {
  const size = mediaSize(item);
  return size.width > 0 && size.height > 0 ? `${Math.round(size.width)} x ${Math.round(size.height)}` : '';
}

function SmartMedia({ active, group, item, onPlay }: { active: boolean; group: boolean; item: SmartImageItem; onPlay: () => void }) {
  const kind = smartImageMediaKind(item);
  const url = String(item.url || '');
  if (kind === 'audio') return group ? <div className="media-thumb audio-thumb" data-media-kind="audio" data-media-url={url}><i data-lucide="file-audio" /><span>{String(item.name || 'Audio')}</span></div> : <div className="node-img media-card media-audio-card"><div className="media-card-icon"><i data-lucide="file-audio" /></div><div className="media-card-title">{String(item.name || 'Audio')}</div><div className="media-card-sub">AUDIO</div><audio controls data-url={url} preload="metadata" src={url} /></div>;
  if (kind === 'file' || kind === 'text') return <div className={`${group ? 'media-thumb' : 'node-img media-card'} file-thumb media-file-card`} data-media-kind={kind} data-media-url={url}><div className="media-card-icon"><i data-lucide={kind === 'text' ? 'file-text' : 'file'} /></div><span className="media-card-title">{String(item.name || (kind === 'text' ? 'Text' : 'File'))}</span>{group ? null : <div className="media-card-sub">{kind.toUpperCase()}</div>}</div>;
  if (kind === 'video') return <div className={`${group ? 'media-thumb video-thumb' : 'node-img media-card media-video-card'}`}>{active ? <video autoPlay controls data-inline-video-active="1" data-url={url} playsInline preload="metadata" src={url} /> : <><img alt="" data-original-src={url} data-preview-kind="video" data-preview-src={previewUrl(item, group ? 512 : 768)} data-url={url} loading="lazy" src={previewUrl(item, group ? 512 : 768)} /><button className={`smart-video-play ${group ? 'thumb-video-play' : ''}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onPlay(); }} title="播放" type="button"><i data-lucide="play" /></button></>}</div>;
  return <img alt="" className={group ? undefined : 'node-img'} data-original-src={url} data-preview-src={previewUrl(item, group ? 512 : 768)} draggable={false} loading="lazy" src={previewUrl(item, group ? 512 : 768)} />;
}

export function SmartImageNode({ connecting, node, onAppendFiles, onConnectIn, onConnectOut, onDelete, onDeleteImage, onMoveStart, onPatch, onPreview, onSelect, readOnly, selected }: {
  connecting: boolean;
  node: CanvasNode;
  onAppendFiles: (files: File[]) => void;
  onConnectIn: () => void;
  onConnectOut: () => void;
  onDelete: () => void;
  onDeleteImage: (index: number) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPatch: (patch: SmartImagePatch, save?: boolean) => void;
  onPreview: (url: string) => void;
  onSelect: (event: ReactMouseEvent<HTMLDivElement>) => void;
  readOnly: boolean;
  selected: boolean;
}) {
  const images = useMemo(() => smartImageItems(node), [node]);
  const tasks = smartImagePendingTasks(node);
  const recoverTask = tasks.find((task) => task.failed && task.recoverTaskId);
  const layout = smartImageNodeLayout(node);
  const [selectedImage, setSelectedImage] = useState(0);
  const [activeVideos, setActiveVideos] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const isGroup = images.length > 1;
  const isQueued = Boolean(node.queued && !images.length && !node.pending);
  const isPending = Boolean((node.pending || isQueued) && !images.length);
  const isEmpty = !images.length && !node.pending && !isQueued && !recoverTask;
  const isHistory = Boolean(node.isHistoryGroup || node.historyFor);

  useEffect(() => {
    if (!node.running && !node.pending) return;
    const tick = () => setElapsed(Date.now());
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [node.pending, node.running]);

  useEffect(() => {
    tasks.filter((task) => !task.failed && !task.recoverTaskId).forEach((task) => {
      void pollTask(task.taskId).then((result) => onPatch((currentNode) => smartImageTaskPatch(currentNode, task.taskId, result), true)).catch((error: Error & { upstreamTaskId?: string }) => {
        if (error.upstreamTaskId) onPatch((currentNode) => { const current = smartImagePendingTasks(currentNode); return { pending: Math.max(1, current.length), running: false, pendingTasks: current.map((item) => item.taskId === task.taskId ? { ...item, error: error.message, failed: true, querying: false, recoverTaskId: error.upstreamTaskId } : item) }; }, true);
        else onPatch((currentNode) => { const current = smartImagePendingTasks(currentNode); return { pending: Math.max(0, Number(currentNode.pending || current.length) - 1), pendingTasks: current.filter((item) => item.taskId !== task.taskId), running: false }; }, true);
      });
    });
    // Task ids are the stable recovery identity; visual node updates must not restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.filter((task) => !task.failed).map((task) => task.taskId).join('|')]);

  useEffect(() => { requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons()); }, [activeVideos, images.length, isPending, recoverTask?.querying]);

  const upload = () => {
    if (readOnly) return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*,video/*,audio/*'; input.multiple = true;
    input.onchange = () => { if (input.files?.length) onAppendFiles([...input.files]); input.remove(); };
    input.click();
  };
  const queryRecoverTask = async () => {
    if (!recoverTask || recoverTask.querying) return;
    onPatch({ pendingTasks: tasks.map((task) => task.taskId === recoverTask.taskId ? { ...task, querying: true } : task) });
    try {
      const response = await fetch('/api/image-task-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider_id: recoverTask.providerId || '', task_id: recoverTask.recoverTaskId }) });
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.detail || '查询失败'));
      if (result.status === 'succeeded' || Array.isArray(result.images)) onPatch((currentNode) => smartImageTaskPatch(currentNode, recoverTask.taskId, result), true);
      else onPatch({ pendingTasks: tasks.map((task) => task.taskId === recoverTask.taskId ? { ...task, querying: false } : task) });
    } catch (error) { onPatch({ pendingTasks: tasks.map((task) => task.taskId === recoverTask.taskId ? { ...task, error: error instanceof Error ? error.message : String(error), querying: false } : task) }, true); }
  };
  const title = isGroup ? 'Group' : images.length ? 'Image' : '上传节点';
  const hint = isPending ? '生成中，请稍候' : isGroup ? '点击缩略图选择，拖拽节点移动' : images.length ? '点击选择，拖拽节点移动' : '双击画布创建，或拖入素材';
  const runStartedAt = Number(node.runStartedAt || 0);
  const runEnd = node.running || node.pending ? (elapsed || Date.now()) : Number(node.runFinishedAt || runStartedAt);
  const runMs = Number(node.runElapsedMs || (runStartedAt ? Math.max(0, runEnd - runStartedAt) : 0));

  return <div aria-label={`smart-image ${node.id}`} className={`image-node ${isEmpty ? 'empty-node' : ''} ${isGroup ? 'group-node' : ''} ${isHistory ? 'history-group-node' : ''} ${selected ? 'selected' : ''} ${node.running ? 'node-running' : ''} ${isPending || recoverTask ? 'node-pending' : ''}`.trim()} data-id={node.id} data-node-id={node.id} data-node-type="smart-image" onClick={(event) => { event.stopPropagation(); onSelect(event); }} onPointerDown={onMoveStart} role="button" style={{ height: layout.height, left: Number(node.x || 0), top: Number(node.y || 0), width: layout.width }} tabIndex={0}>
    <div className="node-head"><div className="node-title">{title}</div><div className="node-actions">{isGroup ? null : <button className="mini-x node-delete" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onDelete(); }} title="删除节点" type="button"><i data-lucide="trash-2" /></button>}</div></div>
    {!isEmpty && !isGroup ? <div className="floating-node-actions"><button className="mini-x node-delete" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onDelete(); }} title="删除节点" type="button"><i data-lucide="trash-2" /></button></div> : null}
    {images.length ? <div className="smart-node-floating-menu" data-smart-node-menu="1"><button disabled={!['image', 'video'].includes(smartImageMediaKind(images[selectedImage] || images[0]))} onClick={(event) => { event.stopPropagation(); onPreview(String((images[selectedImage] || images[0]).url || '')); }} title="预览" type="button"><i data-lucide="eye" /><span>预览</span></button><button onClick={(event) => { event.stopPropagation(); const anchor = document.createElement('a'); anchor.href = String((images[selectedImage] || images[0]).url || ''); anchor.download = String((images[selectedImage] || images[0]).name || 'media'); anchor.click(); }} title="下载" type="button"><i data-lucide="download" /><span>下载</span></button></div> : null}
    {runStartedAt && !node.runTimerHidden ? <span className={`run-time-pill ${!node.pending && !node.running && node.runFinishedAt ? 'done' : ''}`.trim()} data-run-timer={node.id}>{`${Math.floor(runMs / 60_000).toString().padStart(2, '0')}:${Math.floor(runMs % 60_000 / 1_000).toString().padStart(2, '0')}`}</span> : null}
    <div className="node-body">{recoverTask && !images.length ? <div className="image-task-pending-cell loading-cell single" style={{ height: layout.height, width: layout.width }}><div className="image-task-pending-overlay"><div className="image-task-pending-spinner"><i data-lucide={recoverTask.querying ? 'loader-2' : 'refresh-cw'} /></div><div className="image-task-pending-text">{recoverTask.querying ? '查询中' : '任务未丢失'}</div><div className="image-task-pending-sub">{`任务 ID：${recoverTask.recoverTaskId || ''}`}</div><button className="image-task-pending-query" disabled={Boolean(recoverTask.querying)} onClick={(event) => { event.stopPropagation(); void queryRecoverTask(); }} onPointerDown={(event) => event.stopPropagation()} type="button"><i data-lucide={recoverTask.querying ? 'loader-2' : 'refresh-cw'} /><span>{recoverTask.querying ? '查询中…' : '查询结果'}</span></button></div></div>
      : isQueued ? <div className="loading-cell single queued" style={{ height: layout.height, width: layout.width }} />
        : node.pending && !images.length ? Number(node.pending) <= 1 ? <div className="loading-cell single" style={{ height: layout.height, width: layout.width }} /> : <div className="loading-skeleton" style={{ boxSizing: 'border-box', gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Number(node.pending)))) )}, 1fr)`, gridTemplateRows: `repeat(${Math.ceil(Number(node.pending) / Math.min(4, Math.max(2, Math.ceil(Math.sqrt(Number(node.pending)))) ))}, 1fr)`, height: layout.height, padding: 8, width: layout.width }}>{Array.from({ length: Number(node.pending) }, (_, index) => <div className="loading-cell" key={index} />)}</div>
          : isGroup ? <div className="thumb-grid" data-thumb-scroll="1" style={{ '--thumb-cols': layout.cols, '--thumb-max-height': `${(layout.visibleRows || layout.rows) * layout.thumb + Math.max(0, (layout.visibleRows || layout.rows) - 1) * 8}px`, '--thumb-size': `${layout.thumb}px` } as React.CSSProperties}>{images.map((item, index) => <div className={`thumb-item ${selectedImage === index ? 'image-selected' : ''}`} data-image-index={index} data-media-signature={`${smartImageMediaKind(item)}:${item.url || ''}`} draggable key={`${item.url}-${index}`} onClick={(event) => { event.stopPropagation(); setSelectedImage(index); }} onDragStart={(event) => startSmartImageDrag(event, item)} onPointerDown={(event) => event.stopPropagation()}><SmartMedia active={activeVideos.includes(index)} group item={item} onPlay={() => setActiveVideos((current) => current.includes(index) ? current : [...current, index])} />{resolution(item) ? <span className="image-resolution-badge">{resolution(item)}</span> : null}<button className="mini-x image-delete" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onDeleteImage(index); }} title="删除图片" type="button"><i data-lucide="trash-2" /></button></div>)}</div>
            : images[0] ? <div className={`image-wrap ${selectedImage === 0 ? 'image-selected' : ''}`} data-image-index="0" data-media-signature={`${smartImageMediaKind(images[0])}:${images[0].url || ''}`} draggable onClick={(event) => { event.stopPropagation(); setSelectedImage(0); }} onDragStart={(event) => startSmartImageDrag(event, images[0])} onPointerDown={(event) => event.stopPropagation()} style={{ '--node-img-h': `${layout.height}px`, '--node-img-w': `${layout.width}px` } as React.CSSProperties}><SmartMedia active={activeVideos.includes(0)} group={false} item={images[0]} onPlay={() => setActiveVideos((current) => current.includes(0) ? current : [...current, 0])} />{resolution(images[0]) ? <span className="image-resolution-badge">{resolution(images[0])}</span> : null}<button className="mini-x image-delete" disabled={readOnly} onClick={(event) => { event.stopPropagation(); onDeleteImage(0); }} title="删除图片" type="button"><i data-lucide="trash-2" /></button></div>
              : <div className="node-drop" data-upload-action="files" onClick={(event) => { event.stopPropagation(); upload(); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onAppendFiles([...event.dataTransfer.files]); }}><span className="upload-node-main"><i data-lucide="upload-cloud" /></span><span className="upload-node-title">上传节点</span><span className="upload-node-sub">拖拽 / 粘贴 / 点击上传</span></div>}</div>
    <div className="node-hint">{hint}</div>
    {images.length || node.pending || isQueued ? <div className="node-resize-handle" data-resize="1" /> : null}
    <div className={`node-port port-in ${connecting ? 'port-hover' : ''}`} data-port="in" onClick={(event) => { event.stopPropagation(); onConnectIn(); }} title="input" />
    <div className="node-port port-out" data-port="out" onPointerDown={(event) => { event.stopPropagation(); onConnectOut(); }} title="output" />
  </div>;
}
