import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { CanvasDocument, CanvasNode } from '../domain/types';
import { createSmartVideoFrame, type SmartVideoFrameResult } from './smart-canvas-image-editor';
import { smartImageItems, smartImageMediaKind, type SmartImageItem } from './smart-image-node';

type EditMode = 'brush' | 'crop' | 'grid' | 'mask' | 'outpaint';
type PanoramaRatio = 'custom' | 'landscape' | 'landscape43' | 'portrait' | 'portrait43' | 'square' | 'story' | 'ultratall' | 'ultrawide' | 'wide';

interface PanoramaRuntime {
  camera?: any;
  renderer?: any;
  scene?: any;
  sphere?: any;
  texture?: any;
  three?: any;
}

export interface SmartCanvasPreviewProps {
  document: CanvasDocument;
  node: CanvasNode;
  onClose(): void;
  onEdit?(index: number, mode: EditMode): void;
  onExportVideoFrame?(result: SmartVideoFrameResult): Promise<void>;
  onNavigate(url: string): void;
  onRememberSize?(index: number, width: number, height: number): void;
  url: string;
}

const PANORAMA_RATIOS: Record<Exclude<PanoramaRatio, 'custom'>, { h: number; w: number }> = {
  square: { w: 1, h: 1 }, portrait: { w: 2, h: 3 }, landscape: { w: 3, h: 2 }, portrait43: { w: 3, h: 4 }, landscape43: { w: 4, h: 3 },
  story: { w: 9, h: 16 }, wide: { w: 16, h: 9 }, ultrawide: { w: 21, h: 9 }, ultratall: { w: 9, h: 21 },
};

export function smartPreviewCompareSources(document: CanvasDocument, node: CanvasNode, url = ''): SmartImageItem[] {
  const direct = (node.imageComparisons as Record<string, SmartImageItem> | undefined)?.[url];
  const saved = Array.isArray(node.runInputRefs) ? node.runInputRefs as SmartImageItem[] : [];
  const byId = new Map(document.nodes.map((item) => [item.id, item]));
  const upstream = saved.some((item) => item?.url) ? saved : document.connections
    .filter((edge) => edge.to === node.id && String(edge.kind || 'flow') !== 'history')
    .flatMap((edge) => smartImageItems(byId.get(edge.from) || ({ id: '', type: '' } as CanvasNode)));
  const fallback = node.sourceNodeId ? smartImageItems(byId.get(String(node.sourceNodeId)) || ({ id: '', type: '' } as CanvasNode)) : [];
  const seen = new Set<string>();
  return [direct, ...upstream, ...fallback].flatMap((item) => {
    if (!item?.url || smartImageMediaKind(item) !== 'image' || seen.has(item.url)) return [];
    seen.add(item.url);
    return [item];
  });
}

export function smartPreviewDownloadPayload(node: CanvasNode): { filename: string; items: Array<{ name: string; url: string }>; urls: string[] } {
  const ordered = smartImageItems(node).map((item, index) => ({ ...item, __index: index } as SmartImageItem & { __index: number })).sort((a, b) => {
    const ag = (a.grid || {}) as Record<string, unknown>;
    const bg = (b.grid || {}) as Record<string, unknown>;
    return Number(ag.row ?? a.__index) - Number(bg.row ?? b.__index)
      || Number(ag.col ?? a.__index) - Number(bg.col ?? b.__index)
      || a.__index - b.__index;
  });
  const items = ordered.map((item, index) => ({ url: String(item.url || ''), name: downloadName(item, `image-${String(index + 1).padStart(2, '0')}`) }));
  return { filename: safeFileName(`${String(node.title || 'image-group')}.zip`, 'image-group.zip'), items, urls: items.map((item) => item.url) };
}

export function isLikelyPanorama(node: CanvasNode, item: SmartImageItem, naturalWidth = 0, naturalHeight = 0): boolean {
  if (smartImageMediaKind(item) !== 'image') return false;
  const settings = itemRecord(node.runSettings);
  const text = [item.name, item.title, node.title, node.runPrompt, node.runModelPrompt, node.promptDraftText, settings.ratio, settings.msRatio, settings.size, settings.customSize].filter(Boolean).join(' ');
  if (/(?:360|全景|环景|panorama|equirect|spherical|vr\b)/i.test(text)) return true;
  const width = Number(naturalWidth || item.natural_w || item.width || item.w || 0);
  const height = Number(naturalHeight || item.natural_h || item.height || item.h || 0);
  const aspect = width > 0 && height > 0 ? width / height : 0;
  return aspect >= 1.9 && aspect <= 2.1;
}

export function SmartCanvasPreview({ document, node, onClose, onEdit, onExportVideoFrame, onNavigate, onRememberSize, url }: SmartCanvasPreviewProps) {
  const items = useMemo(() => smartImageItems(node), [node]);
  const initialIndex = Math.max(0, items.findIndex((item) => item.url === url));
  const [index, setIndex] = useState(initialIndex);
  const item = items[index] || items[0];
  const kind = item ? smartImageMediaKind(item) : 'image';
  const isVideo = kind === 'video';
  const compareSources = useMemo(() => smartPreviewCompareSources(document, node, String(item?.url || '')), [document, item?.url, node]);
  const [compareOn, setCompareOn] = useState(false);
  const [compareIndex, setCompareIndex] = useState(-1);
  const [comparePos, setComparePos] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [panorama, setPanorama] = useState(false);
  const [panoramaReady, setPanoramaReady] = useState(false);
  const [panoramaRatio, setPanoramaRatio] = useState<PanoramaRatio>('wide');
  const [customRatio, setCustomRatio] = useState({ w: 16, h: 9 });
  const [panoramaView, setPanoramaView] = useState({ fov: 75, pitch: 0, yaw: 0 });
  const [naturalSize, setNaturalSize] = useState({ height: Number(item?.natural_h || item?.height || 0), width: Number(item?.natural_w || item?.width || 0) });
  const [exportingFrame, setExportingFrame] = useState(false);
  const [frameStatus, setFrameStatus] = useState('');
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panoramaRuntime = useRef<PanoramaRuntime>({});
  const drag = useRef<{ mode: 'compare' | 'pan' | 'panorama'; pointerId: number; startClientX: number; startClientY: number; startPan: { x: number; y: number }; startPitch: number; startYaw: number } | null>(null);

  useEffect(() => {
    const next = Math.max(0, items.findIndex((entry) => entry.url === url));
    setIndex(next);
  }, [items, url]);

  useEffect(() => {
    setCompareOn(false); setCompareIndex(-1); setComparePos(50); setZoom(1); setPan({ x: 0, y: 0 }); setPanorama(false); setPanoramaReady(false); setPanoramaView({ fov: 75, pitch: 0, yaw: 0 });
    setNaturalSize({ height: Number(item?.natural_h || item?.height || 0), width: Number(item?.natural_w || item?.width || 0) });
  }, [item?.url]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      if (isVideo && seekVideo(videoRef.current, direction, item)) return;
      navigate(direction);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  useEffect(() => {
    requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
  }, [compareIndex, compareOn, index, panorama, panoramaRatio]);

  useEffect(() => {
    if (!panorama || !item?.url) return;
    let cancelled = false;
    setPanoramaReady(false);
    void loadPanorama(panoramaRuntime.current, canvasRef.current, displayMediaUrl(item), () => {
      if (!cancelled) setPanoramaReady(true);
    }).catch(() => { if (!cancelled) setPanoramaReady(true); });
    return () => { cancelled = true; disposePanoramaTexture(panoramaRuntime.current); };
  }, [item?.url, panorama]);

  useEffect(() => {
    if (!panorama) return;
    drawPanorama(panoramaRuntime.current, canvasRef.current, panoramaView);
  }, [panorama, panoramaReady, panoramaView]);

  useEffect(() => () => disposePanorama(panoramaRuntime.current), []);

  const ratio = panoramaRatio === 'custom' ? customRatio : PANORAMA_RATIOS[panoramaRatio];
  const panoramaSize = fitPanorama(ratio.w, ratio.h);
  const showNav = items.length > 1;
  const sliderActive = compareOn && compareIndex >= 0 && compareIndex < compareSources.length;
  const compareItem = sliderActive ? compareSources[compareIndex] : null;
  const promptHint = node.runPrompt ? `提示词：${String(node.runPrompt).slice(0, 60)}` : '';
  const meta = [`分辨率: ${Math.round(naturalSize.width)} x ${Math.round(naturalSize.height)}`.replace(/^分辨率: 0 x 0$/, ''), panorama ? '拖动查看全景，滚轮缩放视野' : compareOn && !sliderActive ? '请选择一张原图进行对比' : promptHint].filter(Boolean).join(' · ');

  const navigate = (delta: number) => {
    if (items.length <= 1) return;
    const next = (index + delta + items.length) % items.length;
    setIndex(next);
    onNavigate(String(items[next].url || ''));
  };
  const reset = () => {
    setComparePos(50); setPan({ x: 0, y: 0 }); setZoom(1); setPanoramaView({ fov: 75, pitch: 0, yaw: 0 });
  };
  const rememberSize = (width: number, height: number) => {
    if (!(width > 0 && height > 0)) return;
    setNaturalSize({ width, height });
    if (!item?.natural_w || !item?.natural_h) onRememberSize?.(index, width, height);
  };
  const setCompareFromClient = (clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setComparePos(Math.max(0, Math.min(100, (clientX - rect.left) / Math.max(1, rect.width) * 100)));
  };
  const beginDrag = (event: ReactPointerEvent<HTMLElement>, mode: 'compare' | 'pan' | 'panorama') => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startPan: pan, startPitch: panoramaView.pitch, startYaw: panoramaView.yaw };
    setDragging(true);
    if (mode === 'compare') setCompareFromClient(event.clientX);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    if (active.mode === 'compare') setCompareFromClient(event.clientX);
    else if (active.mode === 'panorama') setPanoramaView((current) => ({ ...current, yaw: active.startYaw - (event.clientX - active.startClientX) * .18, pitch: Math.max(-85, Math.min(85, active.startPitch + (event.clientY - active.startClientY) * .18)) }));
    else setPan({ x: active.startPan.x + event.clientX - active.startClientX, y: active.startPan.y + event.clientY - active.startClientY });
  };
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null; setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const wheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    if (isVideo && seekVideo(videoRef.current, event.deltaY > 0 ? 1 : -1, item)) return;
    if (panorama) {
      const factor = event.deltaY < 0 ? .92 : 1 / .92;
      setPanoramaView((current) => ({ ...current, fov: Math.max(35, Math.min(100, current.fov * factor)) }));
      return;
    }
    const oldZoom = zoom;
    const nextZoom = Math.max(.05, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
    const rect = frameRef.current?.getBoundingClientRect();
    setZoom(nextZoom);
    if (rect) {
      const originX = event.clientX - rect.left - rect.width / 2;
      const originY = event.clientY - rect.top - rect.height / 2;
      const scale = nextZoom / oldZoom;
      setPan((current) => ({ x: current.x - originX * (scale - 1), y: current.y - originY * (scale - 1) }));
    }
  };
  const toggleCompare = () => {
    if (!compareSources.length) return;
    setPanorama(false);
    setCompareOn((active) => {
      if (!active && (compareIndex < 0 || compareIndex >= compareSources.length)) setCompareIndex(0);
      if (active) setCompareIndex(-1);
      return !active;
    });
  };
  const togglePanorama = () => {
    setPanorama((active) => {
      if (!active) { setCompareOn(false); setCompareIndex(-1); setPan({ x: 0, y: 0 }); setZoom(1); }
      return !active;
    });
  };
  const exportFrame = async (which: 'current' | 'first' | 'last') => {
    const video = videoRef.current;
    if (!video || !item || !onExportVideoFrame || exportingFrame) return;
    setExportingFrame(true); setFrameStatus('正在导出视频帧…');
    try {
      const result = await createSmartVideoFrame(video, item, which);
      await onExportVideoFrame(result);
      setFrameStatus('已导出到画布');
    } catch (error) {
      setFrameStatus((error instanceof Error ? error.message : String(error)) || '导出帧失败');
    } finally { setExportingFrame(false); }
  };

  if (!item?.url || !['image', 'video'].includes(kind)) return null;
  const frameStyle = panorama ? { height: `${panoramaSize.height}px`, transform: '', width: `${panoramaSize.width}px` } : { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` };
  const stageStyle = { '--compare-pos': `${comparePos}%` } as CSSProperties;
  return <div aria-label={isVideo ? '预览视频' : '预览图片'} aria-modal="true" className="image-edit-modal open smart-canvas-preview" data-testid="smart-canvas-preview" id="imageEditModal" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onPointerDown={(event) => event.stopPropagation()} role="dialog">
    <div className={`image-edit-panel ${isVideo ? 'video-preview-mode' : ''}`} onClick={(event) => event.stopPropagation()}>
      <div className="image-edit-head">
        <div><div className="image-edit-title" id="imageEditTitle">{isVideo ? '预览视频' : '预览图片'}</div><div className="image-edit-sub" id="imageEditSub">{isVideo ? '' : '滚轮缩放 · 拖动平移 · 双击百分比复位'}</div></div>
        <div className="image-edit-mode" style={{ display: isVideo ? 'none' : undefined }}>
          <button className="active" data-image-edit-mode="preview" type="button"><i data-lucide="eye" /><span>预览</span></button>
          {([['crop', 'crop', '裁剪'], ['outpaint', 'expand', '扩图'], ['mask', 'brush', '遮罩'], ['brush', 'paintbrush', '画笔'], ['grid', 'grid-3x3', '宫格切分']] as const).map(([mode, icon, label]) => <button data-image-edit-mode={mode} key={mode} onClick={() => onEdit?.(index, mode)} type="button"><i data-lucide={icon} /><span>{label}</span></button>)}
        </div>
        <button aria-label="关闭预览" className="preview-icon-btn" onClick={onClose} title="关闭" type="button"><i data-lucide="x" /></button>
      </div>
      <div className={`image-edit-tools active ${panorama ? 'panorama-tools-on' : ''}`} id="imagePreviewTools">
        <span className="image-edit-sub" id="previewMetaHint" style={{ marginLeft: 'auto' }}>{meta}</span>
        <div className="panorama-controls" id="panoramaControls" style={{ display: panorama ? 'inline-flex' : 'none' }}>
          <div className="panorama-control-group"><div className="panorama-control-line"><span className="panorama-control-label">视窗比例</span>
            {(Object.entries(PANORAMA_RATIOS) as Array<[Exclude<PanoramaRatio, 'custom'>, { h: number; w: number }]>).map(([name, value]) => <button className={panoramaRatio === name ? 'active' : ''} data-panorama-ratio={name} key={name} onClick={() => setPanoramaRatio(name)} type="button">{value.w}:{value.h}</button>)}
            <button className={panoramaRatio === 'custom' ? 'active' : ''} data-panorama-ratio="custom" onClick={() => setPanoramaRatio('custom')} type="button">自定义</button>
            <label className="panorama-custom-ratio" id="panoramaCustomRatio" style={{ display: panoramaRatio === 'custom' ? 'inline-flex' : 'none' }}><input aria-label="ratio width" max="999" min="1" onChange={(event) => setCustomRatio((current) => ({ ...current, w: clampRatio(event.target.value) }))} type="number" value={customRatio.w} /><span>:</span><input aria-label="ratio height" max="999" min="1" onChange={(event) => setCustomRatio((current) => ({ ...current, h: clampRatio(event.target.value) }))} type="number" value={customRatio.h} /></label>
          </div></div>
        </div>
      </div>
      <div className="image-edit-stage preview-mode" id="imageEditStage" onWheel={wheel}>
        <button className={`preview-nav-btn prev ${showNav ? 'visible' : ''}`} id="previewPrevBtn" onClick={() => navigate(-1)} title="上一张" type="button"><i data-lucide="chevron-left" /></button>
        <button className={`preview-nav-btn next ${showNav ? 'visible' : ''}`} id="previewNextBtn" onClick={() => navigate(1)} title="下一张" type="button"><i data-lucide="chevron-right" /></button>
        <div className="image-edit-stage-inner">
          <div className={`preview-stage ${sliderActive ? 'compare-on' : ''} ${panorama ? 'panorama-on' : ''} ${dragging ? 'panning' : ''}`} id="previewStage" onPointerCancel={endDrag} onPointerDown={(event) => { if (!isVideo && (event.target === event.currentTarget || (event.target as HTMLElement).closest?.('#previewFrame'))) beginDrag(event, panorama ? 'panorama' : 'pan'); }} onPointerMove={moveDrag} onPointerUp={endDrag} style={stageStyle}>
            <div className="preview-frame" id="previewFrame" ref={frameRef} style={frameStyle}>
              {isVideo ? <video autoPlay controls controlsList="nodownload noplaybackrate noremoteplayback" crossOrigin="anonymous" disablePictureInPicture id="previewCurrentVideo" onLoadedMetadata={(event) => rememberSize(event.currentTarget.videoWidth, event.currentTarget.videoHeight)} playsInline preload="metadata" ref={videoRef} src={displayMediaUrl(item)} /> : <img alt="current" className="preview-current" crossOrigin="anonymous" id="previewCurrentImage" onLoad={(event) => rememberSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} ref={imageRef} src={displayMediaUrl(item)} style={{ display: panorama ? 'none' : 'block' }} />}
              {!isVideo ? <div className={`panorama-stage ${panoramaReady ? 'ready' : ''}`} id="panoramaStage" style={{ display: panorama ? 'block' : 'none', height: panoramaSize.height, width: panoramaSize.width }}><canvas height={panoramaResolution(ratio).height} id="panoramaCanvas" ref={canvasRef} width={panoramaResolution(ratio).width} /><div className="panorama-loading" id="panoramaLoading">加载中...</div></div> : null}
              {!isVideo ? <div className="preview-compare-layer" id="previewCompareLayer" style={{ display: sliderActive && !panorama ? '' : 'none' }}>{compareItem ? <img alt="original" id="previewCompareImage" src={displayMediaUrl(compareItem)} /> : null}</div> : null}
              {!isVideo ? <div className="preview-compare-handle" id="previewCompareHandle" onPointerCancel={endDrag} onPointerDown={(event) => beginDrag(event, 'compare')} onPointerMove={moveDrag} onPointerUp={endDrag} style={{ display: sliderActive && !panorama ? '' : 'none' }} title="拖动对比" /> : null}
            </div>
          </div>
        </div>
        <div className="preview-download-overlay">
          <button className="compare-toggle" id="previewDownloadBtn" onClick={() => downloadItem(item)} type="button"><i data-lucide="download" /><span>下载</span></button>
          {!isVideo && items.length > 1 ? <button className="compare-toggle" id="previewDownloadAllBtn" onClick={() => void downloadGroup(node)} type="button"><i data-lucide="archive" /><span>下载全部</span></button> : null}
        </div>
        {!isVideo ? <div className="preview-tools-overlay"><div className="compare-thumbs" id="compareThumbs" style={{ display: compareOn && !panorama ? 'inline-flex' : 'none' }}>{compareSources.map((source, sourceIndex) => <button className={`compare-thumb ${sourceIndex === compareIndex ? 'active' : ''}`} data-compare-idx={sourceIndex} key={`${source.url}-${sourceIndex}`} onClick={() => setCompareIndex((active) => active === sourceIndex ? -1 : sourceIndex)} title={sourceIndex === compareIndex ? '取消当前对比' : '使用此原图对比'} type="button"><img alt="" src={previewThumbUrl(source)} /></button>)}</div><div className="preview-action-row">
          <button className={`compare-toggle ${panorama ? 'active' : ''}`} id="panoramaToggleBtn" onClick={togglePanorama} type="button"><i data-lucide="globe-2" /><span>360全景</span></button>
          <button className={`compare-toggle ${compareOn ? 'active' : ''}`} disabled={!compareSources.length || panorama} id="compareToggleBtn" onClick={toggleCompare} style={{ opacity: compareSources.length && !panorama ? 1 : .45 }} title={compareSources.length ? '对比原图' : '没有可用原图'} type="button"><i data-lucide="columns-2" /><span>对比原图</span></button>
        </div></div> : null}
      </div>
      <div className="image-edit-actions"><span id="imageEditZoomLabel" onDoubleClick={reset} style={{ color: '#94a3b8', cursor: 'pointer', display: isVideo ? 'none' : undefined, fontSize: 11, fontWeight: 800, marginRight: 'auto', padding: '0 4px', userSelect: 'none' }} title="双击重置缩放">{Math.round((panorama ? 75 / Math.max(1, panoramaView.fov) : zoom) * 100)}%</span>{isVideo ? <div className="video-frame-tools" id="videoFrameTools" style={{ display: 'flex', marginRight: 'auto' }}>
        <button className="image-edit-btn secondary" disabled={exportingFrame || !onExportVideoFrame} onClick={() => void exportFrame('first')} type="button"><i data-lucide="skip-back" /><span>导出首帧</span></button>
        <button className="image-edit-btn primary" disabled={exportingFrame || !onExportVideoFrame} onClick={() => void exportFrame('current')} type="button"><i data-lucide="image-down" /><span>{exportingFrame ? '正在导出…' : '导出当前帧'}</span></button>
        <button className="image-edit-btn secondary" disabled={exportingFrame || !onExportVideoFrame} onClick={() => void exportFrame('last')} type="button"><i data-lucide="skip-forward" /><span>导出尾帧</span></button>
      </div> : null}<button className="image-edit-btn secondary" id="imageEditCancelBtn" onClick={onClose} type="button">关闭</button></div>
      {frameStatus ? <div className="image-edit-sub" data-testid="video-frame-status">{frameStatus}</div> : null}
    </div>
  </div>;
}

function displayMediaUrl(item: SmartImageItem): string {
  const url = String(item.url || '');
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/download-output?inline=1&url=${encodeURIComponent(url)}&name=${encodeURIComponent(String(item.name || fileNameFromUrl(url) || 'preview'))}`;
}

function previewThumbUrl(item: SmartImageItem): string {
  const url = String(item.url || '');
  return url.startsWith('/assets/') || url.startsWith('/output/') ? `/api/media-preview?w=256&url=${encodeURIComponent(url)}` : displayMediaUrl(item);
}

function downloadItem(item: SmartImageItem): void {
  if (!item.url) return;
  const name = downloadName(item, 'image');
  const link = document.createElement('a');
  link.href = `/api/download-output?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(name)}`;
  link.download = name;
  document.body.append(link); link.click(); link.remove();
}

async function downloadGroup(node: CanvasNode): Promise<void> {
  const payload = smartPreviewDownloadPayload(node);
  const response = await fetch('/api/canvas-assets/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(await response.text() || '批量下载失败');
  const href = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = href; link.download = payload.filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1_200);
}

function downloadName(item: SmartImageItem, fallbackPrefix: string): string {
  const local = fileNameFromUrl(String(item.url || ''));
  const preferred = local || String(item.name || '');
  const extension = extensionFor(item);
  const fallback = `${fallbackPrefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}${extension}`;
  let name = safeFileName(preferred || fallback, fallback);
  if (!/\.[a-z0-9]{2,8}$/i.test(name)) name += extension;
  return name;
}

function extensionFor(item: SmartImageItem): string {
  const source = [item.name, item.url].map((value) => String(value || '').split(/[?#]/, 1)[0]).find((value) => /\.[a-z0-9]{2,8}$/i.test(value));
  if (source) return source.match(/(\.[a-z0-9]{2,8})$/i)?.[1] || '.png';
  return smartImageMediaKind(item) === 'video' ? '.mp4' : smartImageMediaKind(item) === 'audio' ? '.mp3' : smartImageMediaKind(item) === 'text' ? '.txt' : '.png';
}

function fileNameFromUrl(url: string): string { return decodeURIComponent(url.split(/[?#]/, 1)[0].split('/').pop() || '').replace(/[\\/:*?"<>|]/g, '_'); }
function safeFileName(name: string, fallback: string): string { const value = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim(); return value || fallback; }
function itemRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function clampRatio(value: string): number { return Math.max(1, Math.min(999, Number(value) || 1)); }

function seekVideo(video: HTMLVideoElement | null, direction: number, item: SmartImageItem): boolean {
  if (!video || video.readyState < 1) return false;
  video.pause();
  const fps = Number(item.fps || item.frameRate || item.frame_rate || item.framespersecond || item.frames_per_second || 0);
  const step = 1 / Math.max(1, Math.min(120, Number.isFinite(fps) && fps > 0 ? fps : 30));
  const max = Number.isFinite(video.duration) && video.duration > 0 ? Math.max(0, video.duration - step / 2) : Number.MAX_SAFE_INTEGER;
  video.currentTime = Math.max(0, Math.min(max, Number(video.currentTime || 0) + direction * step));
  return true;
}

function fitPanorama(width: number, height: number): { height: number; width: number } {
  const aspect = Math.max(.08, Math.min(12, width / Math.max(1, height)));
  const maxWidth = Math.max(260, Math.min(1180, window.innerWidth - 116));
  const maxHeight = Math.max(220, Math.min(780, window.innerHeight - 220));
  let fittedWidth = maxWidth; let fittedHeight = fittedWidth / aspect;
  if (fittedHeight > maxHeight) { fittedHeight = maxHeight; fittedWidth = fittedHeight * aspect; }
  return { width: Math.max(160, Math.round(fittedWidth)), height: Math.max(160, Math.round(fittedHeight)) };
}

function panoramaResolution(ratio: { h: number; w: number }): { height: number; width: number } {
  const aspect = ratio.w / Math.max(1, ratio.h);
  return aspect >= 1 ? { width: 1536, height: Math.max(1, Math.round(1536 / aspect)) } : { width: Math.max(1, Math.round(1536 * aspect)), height: 1536 };
}

async function loadPanorama(runtime: PanoramaRuntime, canvas: HTMLCanvasElement | null, src: string, ready: () => void): Promise<void> {
  if (!canvas || !src) return;
  if (!runtime.three) {
    const modulePath = '/static/vendor/js/three-0.160.0.module.js?v=2026.05.30';
    runtime.three = await import(/* @vite-ignore */ modulePath);
  }
  const THREE = runtime.three;
  if (!runtime.renderer) {
    runtime.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    runtime.renderer.setPixelRatio(1); runtime.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  if (!runtime.scene) {
    runtime.scene = new THREE.Scene(); runtime.camera = new THREE.PerspectiveCamera(75, 16 / 9, 1, 1200);
    const geometry = new THREE.SphereGeometry(500, 96, 64); geometry.scale(-1, 1, 1);
    runtime.sphere = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff })); runtime.scene.add(runtime.sphere);
  }
  const image = new Image(); image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('全景图片加载失败')); image.src = src; });
  disposePanoramaTexture(runtime);
  runtime.texture = new THREE.Texture(image); runtime.texture.colorSpace = THREE.SRGBColorSpace; runtime.texture.needsUpdate = true;
  runtime.sphere.material.map = runtime.texture; runtime.sphere.material.needsUpdate = true; ready();
}

function drawPanorama(runtime: PanoramaRuntime, canvas: HTMLCanvasElement | null, view: { fov: number; pitch: number; yaw: number }): void {
  const { renderer, scene, camera, sphere, three: THREE } = runtime;
  if (!canvas || !renderer || !scene || !camera || !sphere || !THREE || !runtime.texture) return;
  renderer.setSize(Math.max(1, canvas.width), Math.max(1, canvas.height), false);
  camera.fov = Math.max(35, Math.min(100, view.fov)); camera.aspect = canvas.width / Math.max(1, canvas.height); camera.updateProjectionMatrix();
  const phi = THREE.MathUtils.degToRad(90 - Math.max(-85, Math.min(85, view.pitch))); const theta = THREE.MathUtils.degToRad(view.yaw);
  camera.position.set(0, 0, 0); camera.lookAt(new THREE.Vector3(500 * Math.sin(phi) * Math.cos(theta), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(theta))); renderer.render(scene, camera);
}

function disposePanoramaTexture(runtime: PanoramaRuntime): void {
  runtime.texture?.dispose?.(); runtime.texture = undefined;
  if (runtime.sphere?.material) { runtime.sphere.material.map = null; runtime.sphere.material.needsUpdate = true; }
}

function disposePanorama(runtime: PanoramaRuntime): void {
  disposePanoramaTexture(runtime); runtime.renderer?.dispose?.(); runtime.sphere?.geometry?.dispose?.(); runtime.sphere?.material?.dispose?.();
}
