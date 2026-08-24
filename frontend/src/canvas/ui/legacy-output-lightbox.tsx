import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import type { CanvasNode } from '../domain/types';
import { formatOutputRunDuration, outputComparisonUrl, outputDownloadName, outputPreviewItems, outputPreviewMeta } from '../domain/output-preview';

interface LegacyOutputLightboxProps {
  node: CanvasNode;
  onClose: () => void;
  onNavigate: (url: string) => void;
  onRerun: (meta: Record<string, unknown>) => void;
  onViewed: (url: string) => void;
  url: string;
}

type Point = { x: number; y: number };
type DragState = { origin: Point; start: Point };

export function LegacyOutputLightbox({ node, onClose, onNavigate, onRerun, onViewed, url }: LegacyOutputLightboxProps) {
  const items = useMemo(() => outputPreviewItems(node), [node]);
  const meta = outputPreviewMeta(node, url);
  const run = valueRecord(meta.run);
  const prompt = String(run.prompt || '');
  const comparison = outputComparisonUrl(node, url);
  const current = items.find((item) => item.url === url);
  const video = current?.kind === 'video';
  const [compareMode, setCompareMode] = useState(false);
  const [comparePercent, setComparePercent] = useState(50);
  const [copied, setCopied] = useState(false);
  const [panning, setPanning] = useState(false);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [resolution, setResolution] = useState('--');
  const [zoom, setZoom] = useState(1);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const panDrag = useRef<DragState | null>(null);
  const compareDrag = useRef(false);
  const viewed = useRef(onViewed);

  useEffect(() => { viewed.current = onViewed; }, [onViewed]);

  useEffect(() => {
    setCompareMode(false);
    setComparePercent(50);
    setPan({ x: 0, y: 0 });
    setPanning(false);
    setResolution('--');
    setZoom(1);
    viewed.current(url);
  }, [url]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
    return () => window.cancelAnimationFrame(frame);
  }, [compareMode, copied, url]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (items.length < 2) return;
      const index = Math.max(0, items.findIndex((item) => item.url === url));
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      event.preventDefault();
      event.stopImmediatePropagation();
      onNavigate(items[(index + direction + items.length) % items.length].url);
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [items, onClose, onNavigate, url]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (compareDrag.current) updateCompare(event.clientX, compareRef.current, setComparePercent);
      if (!panDrag.current) return;
      setPan({
        x: panDrag.current.origin.x + event.clientX - panDrag.current.start.x,
        y: panDrag.current.origin.y + event.clientY - panDrag.current.start.y,
      });
    };
    const up = () => {
      compareDrag.current = false;
      panDrag.current = null;
      setPanning(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const duration = meta.runMs ? formatOutputRunDuration(meta.runMs) : '';
  const promptOpen = Boolean(prompt || meta.run);
  const beginCompare = (event: ReactPointerEvent) => {
    compareDrag.current = true;
    updateCompare(event.clientX, compareRef.current, setComparePercent);
    event.preventDefault();
    event.stopPropagation();
  };
  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (video || event.button !== 0 || zoom <= 1.001 || target.closest('.output-preview-actions, .output-resolution, .output-compare-slider')) return;
    panDrag.current = { origin: pan, start: { x: event.clientX, y: event.clientY } };
    setPanning(true);
    event.preventDefault();
    event.stopPropagation();
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    if (video) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const before = { x: (local.x - pan.x) / zoom, y: (local.y - pan.y) / zoom };
    const nextZoom = Math.max(1, Math.min(6, zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
    setZoom(nextZoom);
    setPan(nextZoom <= 1.001 ? { x: 0, y: 0 } : { x: local.x - before.x * nextZoom, y: local.y - before.y * nextZoom });
  };
  const copyPrompt = async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return createPortal(<div aria-label="输出预览" className="output-lightbox open canvas-v2-lightbox" onClick={onClose} role="dialog" style={{ zIndex: 1100 }}>
    <div className="output-lightbox-shell" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <div
        className={`output-preview ${compareMode ? 'compare-mode' : ''} ${panning ? 'panning' : ''} ${zoom > 1.001 ? 'zoomed' : ''}`.trim()}
        data-preview-url={url}
        data-preview-zoom={zoom.toFixed(3)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (!video && comparison) setCompareMode((value) => !value);
        }}
        onPointerDown={beginPan}
        onWheel={wheel}
        ref={previewRef}
      >
        <div className="output-compare" onPointerDown={beginCompare} ref={compareRef}>
          <img alt="result image" draggable={false} src={video ? '' : url} style={{ transform, transformOrigin: '0 0' }} />
          <div className="output-compare-original-wrap" style={{ clipPath: `inset(0 ${100 - comparePercent}% 0 0)` }}>
            <img alt="input image" draggable={false} src={comparison} style={{ transform, transformOrigin: '0 0' }} />
          </div>
          <div className="output-compare-slider" onPointerDown={beginCompare} style={{ left: `${comparePercent}%` }}>
            <div className="output-compare-handle"><i className="w-4 h-4" data-lucide="move-horizontal" /></div>
          </div>
        </div>
        {!video ? <img alt="output preview" className="output-single-img" draggable={false} onLoad={(event) => setResolution(`${event.currentTarget.naturalWidth} x ${event.currentTarget.naturalHeight}`)} src={url} style={{ transform, transformOrigin: '0 0' }} /> : null}
        {video ? <video className="output-single-video" controls controlsList="nodownload noplaybackrate noremoteplayback" disablePictureInPicture onLoadedMetadata={(event) => setResolution(event.currentTarget.videoWidth && event.currentTarget.videoHeight ? `${event.currentTarget.videoWidth} x ${event.currentTarget.videoHeight}` : 'Video')} playsInline src={url} /> : null}
        <div className="output-preview-bar">
          <div className="output-resolution">{resolution}{duration ? <><span style={{ opacity: .38 }}>|</span><span>{duration}</span></> : null}</div>
          <div className="output-preview-actions">
            <a aria-label="下载" className="preview-icon-btn" download={outputDownloadName(url)} href={url} onClick={(event) => event.stopPropagation()} title="下载"><i className="w-4 h-4" data-lucide="download" /></a>
            <button aria-label="关闭" className="preview-icon-btn" onClick={onClose} title="关闭" type="button"><i className="w-4 h-4" data-lucide="x" /></button>
          </div>
        </div>
      </div>
      <div className={`output-prompt-panel ${promptOpen ? 'open' : ''}`}>
        <div className="output-prompt-text">{prompt || '暂无提示词元数据'}</div>
        <div className="output-prompt-actions">
          <button className={`preview-text-btn secondary ${copied ? 'copied' : ''}`} disabled={!prompt} onClick={() => void copyPrompt()} type="button"><i className="w-3.5 h-3.5" data-lucide="copy" /><span>{copied ? '已复制' : '复制提示词'}</span></button>
          <button className="preview-text-btn" onClick={() => onRerun(meta)} type="button"><i className="w-3.5 h-3.5" data-lucide="refresh-cw" /><span>再次运行</span></button>
        </div>
      </div>
    </div>
  </div>, document.querySelector('.shell') || document.body);
}

function updateCompare(clientX: number, element: HTMLDivElement | null, apply: (value: number) => void) {
  const rect = element?.getBoundingClientRect();
  if (!rect?.width) return;
  apply(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
}

function valueRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}
