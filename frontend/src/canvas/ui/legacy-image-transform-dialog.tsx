import { useEffect, useMemo, useRef, useState } from 'react';
import { transformedImageName, type CropRegion, type ImageSize, type OutpaintRegion } from '../domain/image-transform';

type LegacyImageEditMode = 'preview' | 'crop' | 'outpaint';

export interface LegacyImageTransformResult {
  blob: Blob;
  height: number;
  mode: 'crop' | 'outpaint';
  name: string;
  width: number;
}

type DragState = {
  mode: 'crop-move' | 'crop-resize' | 'image' | 'outpaint-bottom' | 'outpaint-corner' | 'outpaint-left' | 'outpaint-right' | 'outpaint-top';
  startCrop: CropRegion;
  startOutpaint: OutpaintRegion;
  startX: number;
  startY: number;
};

export function LegacyImageTransformDialog({ name, onApply, onClose, url }: {
  name: string;
  onApply(result: LegacyImageTransformResult): Promise<void>;
  onClose(): void;
  url: string;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [mode, setMode] = useState<LegacyImageEditMode>('crop');
  const [source, setSource] = useState<ImageSize | null>(null);
  const [baseDisplay, setBaseDisplay] = useState<ImageSize>({ width: 1, height: 1 });
  const [stageSize, setStageSize] = useState<ImageSize>({ width: 1, height: 1 });
  const [crop, setCrop] = useState<CropRegion>({ x: 0, y: 0, width: 1, height: 1 });
  const [outpaint, setOutpaint] = useState<OutpaintRegion>({ offsetX: 0, offsetY: 0, width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const display = useMemo(() => ({ width: Math.max(1, baseDisplay.width * zoom), height: Math.max(1, baseDisplay.height * zoom) }), [baseDisplay, zoom]);
  const scaleX = source ? display.width / source.width : 1;
  const scaleY = source ? display.height / source.height : 1;
  const canvasSize = mode === 'outpaint'
    ? { width: outpaint.width * scaleX, height: outpaint.height * scaleY }
    : display;

  useEffect(() => {
    setStatus('');
    setSource(null);
    setZoom(1);
    dragRef.current = null;
  }, [url]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
  }, [mode, saving]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !source) return;
      const dx = (event.clientX - drag.startX) / Math.max(scaleX, 0.0001);
      const dy = (event.clientY - drag.startY) / Math.max(scaleY, 0.0001);
      if (drag.mode === 'crop-move') {
        setCrop(clampCrop({ ...drag.startCrop, x: drag.startCrop.x + dx, y: drag.startCrop.y + dy }, source));
      } else if (drag.mode === 'crop-resize') {
        setCrop(clampCrop({ ...drag.startCrop, width: drag.startCrop.width + dx, height: drag.startCrop.height + dy }, source));
      } else if (drag.mode === 'image') {
        setOutpaint(clampLegacyOutpaint({ ...drag.startOutpaint, offsetX: drag.startOutpaint.offsetX + dx, offsetY: drag.startOutpaint.offsetY + dy }, source));
      } else {
        const horizontal = drag.mode === 'outpaint-left' ? -dx : drag.mode === 'outpaint-right' || drag.mode === 'outpaint-corner' ? dx : 0;
        const vertical = drag.mode === 'outpaint-top' ? -dy : drag.mode === 'outpaint-bottom' || drag.mode === 'outpaint-corner' ? dy : 0;
        const width = Math.max(source.width, drag.startOutpaint.width + horizontal * 2);
        const height = Math.max(source.height, drag.startOutpaint.height + vertical * 2);
        setOutpaint(clampLegacyOutpaint({
          width,
          height,
          offsetX: drag.startOutpaint.offsetX + (width - drag.startOutpaint.width) / 2,
          offsetY: drag.startOutpaint.offsetY + (height - drag.startOutpaint.height) / 2,
        }, source));
      }
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [scaleX, scaleY, source]);

  const reset = (nextMode = mode) => {
    if (!source) return;
    if (nextMode === 'outpaint') setOutpaint({ offsetX: 0, offsetY: 0, width: source.width, height: source.height });
    else setCrop({ x: source.width * 0.08, y: source.height * 0.08, width: source.width * 0.84, height: source.height * 0.84 });
  };

  const chooseMode = (next: LegacyImageEditMode) => {
    setMode(next);
    reset(next);
  };

  const startDrag = (event: React.PointerEvent, dragMode: DragState['mode']) => {
    if (!source || saving) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { mode: dragMode, startCrop: crop, startOutpaint: outpaint, startX: event.clientX, startY: event.clientY };
  };

  const apply = async () => {
    const image = imageRef.current;
    if (!image || !source || mode === 'preview') return;
    setSaving(true);
    setStatus('正在生成 PNG…');
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('当前浏览器无法创建图片编辑画布');
      if (mode === 'crop') {
        const region = clampCrop(crop, source);
        canvas.width = Math.max(1, Math.round(region.width));
        canvas.height = Math.max(1, Math.round(region.height));
        context.drawImage(image, Math.round(region.x), Math.round(region.y), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      } else {
        const region = clampLegacyOutpaint(outpaint, source);
        canvas.width = Math.max(1, Math.round(region.width));
        canvas.height = Math.max(1, Math.round(region.height));
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, Math.round(region.offsetX), Math.round(region.offsetY), source.width, source.height);
      }
      const blob = await canvasBlob(canvas);
      setStatus('正在上传编辑结果…');
      await onApply({ blob, height: canvas.height, mode, name: transformedImageName(name, mode), width: canvas.width });
      onClose();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message || cause.name || '图片转换失败' : String(cause) || '图片转换失败');
    } finally {
      setSaving(false);
    }
  };

  return <div aria-label="编辑图片" aria-modal="true" className="image-edit-modal open canvas-modern-image-edit" onClick={onClose} role="dialog" style={{ zIndex: 1100 }}>
    <div className="image-edit-panel" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <div className="image-edit-head">
        <div className="image-edit-headline"><div className="image-edit-title">{mode === 'preview' ? '预览图片' : mode === 'crop' ? '裁剪图片' : '扩图'}</div><div className="image-edit-sub">{mode === 'preview' ? '滚轮缩放查看图片' : mode === 'crop' ? '拖动裁剪区域并调整右下角控制点' : '拖动原图或边缘控制点调整画布'}</div></div>
        <div className="image-edit-mode">
          <ModeButton active={mode === 'preview'} icon="eye" label="预览" onClick={() => chooseMode('preview')} />
          <ModeButton active={mode === 'crop'} icon="crop" label="裁剪" onClick={() => chooseMode('crop')} />
          <ModeButton active={mode === 'outpaint'} icon="expand" label="扩图" onClick={() => chooseMode('outpaint')} />
        </div>
        <div className="image-edit-head-end"><button aria-label="关闭" className="preview-icon-btn" disabled={saving} onClick={onClose} title="关闭" type="button"><i className="w-4 h-4" data-lucide="x" /></button></div>
      </div>
      <div className={`image-edit-stage ${canvasSize.width + 36 > stageSize.width ? 'overflow-x' : ''} ${canvasSize.height + 36 > stageSize.height ? 'overflow-y' : ''}`.trim()} onWheel={(event) => {
        if (!source) return;
        event.preventDefault();
        event.stopPropagation();
        const stage = stageRef.current;
        const previous = zoom;
        const next = Math.max(0.15, Math.min(6, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
        if (stage) {
          const rect = stage.getBoundingClientRect();
          const mouseX = event.clientX - rect.left;
          const mouseY = event.clientY - rect.top;
          const contentX = stage.scrollLeft + mouseX;
          const contentY = stage.scrollTop + mouseY;
          window.requestAnimationFrame(() => {
            const ratio = next / previous;
            stage.scrollLeft = contentX * ratio - mouseX;
            stage.scrollTop = contentY * ratio - mouseY;
          });
        }
        setZoom(next);
      }} ref={stageRef}>
        <div className="image-edit-stage-inner">
          <div className={`crop-canvas ${mode === 'preview' ? 'preview-mode' : mode === 'outpaint' ? `outpaint-mode ${outpaint.width > 4096 || outpaint.height > 4096 ? 'outpaint-warning' : ''}` : ''}`} style={source ? { height: canvasSize.height, width: canvasSize.width } : undefined}>
            <img alt="crop source" crossOrigin={/^https?:/i.test(url) ? 'anonymous' : undefined} onLoad={(event) => {
              const image = event.currentTarget;
              const nextSource = { width: image.naturalWidth, height: image.naturalHeight };
              imageRef.current = image;
              const measured = { width: image.clientWidth || nextSource.width, height: image.clientHeight || nextSource.height };
              setBaseDisplay(measured);
              setSource(nextSource);
              setCrop({ x: nextSource.width * 0.08, y: nextSource.height * 0.08, width: nextSource.width * 0.84, height: nextSource.height * 0.84 });
              setOutpaint({ offsetX: 0, offsetY: 0, width: nextSource.width, height: nextSource.height });
            }} onError={() => setStatus('无法读取图片，远程图片可能不允许跨域编辑')} onPointerDown={(event) => { if (mode === 'outpaint') startDrag(event, 'image'); }} src={url} style={!source ? undefined : mode === 'outpaint' ? { height: display.height, left: outpaint.offsetX * scaleX, maxHeight: 'none', maxWidth: 'none', top: outpaint.offsetY * scaleY, width: display.width } : { height: display.height, maxHeight: 'none', maxWidth: 'none', width: display.width }} />
            <canvas className="edit-draw-canvas" height={source?.height || 1} style={{ height: display.height, width: display.width }} width={source?.width || 1} />
            <canvas className="edit-text-canvas" height={source?.height || 1} style={{ height: display.height, width: display.width }} width={source?.width || 1} />
            <div className="crop-box" onPointerDown={(event) => startDrag(event, 'crop-move')} style={{ height: crop.height * scaleY, left: crop.x * scaleX, top: crop.y * scaleY, width: crop.width * scaleX }}><div className="crop-handle" onPointerDown={(event) => startDrag(event, 'crop-resize')} /></div>
            <div className="outpaint-frame" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('[data-outpaint-handle]')) startDrag(event, 'image'); }} style={{ height: canvasSize.height, width: canvasSize.width }}>
              {(['top', 'right', 'bottom', 'left', 'corner'] as const).map((handle) => <div className="outpaint-handle" data-outpaint-handle={handle} key={handle} onPointerDown={(event) => startDrag(event, `outpaint-${handle}`)} />)}
            </div>
            <div className="outpaint-resolution">{Math.round(outpaint.width)} x {Math.round(outpaint.height)}</div>
          </div>
        </div>
      </div>
      <div className="image-edit-actions">
        <span onDoubleClick={() => { setZoom(1); if (stageRef.current) { stageRef.current.scrollLeft = 0; stageRef.current.scrollTop = 0; } }} style={{ color: '#94a3b8', cursor: 'pointer', fontSize: 11, fontWeight: 800, marginRight: 'auto', padding: '0 4px', userSelect: 'none' }} title="双击重置缩放">{Math.round(zoom * 100)}%</span>
        <button className="image-edit-btn secondary" disabled={!source || saving} onClick={() => reset()} type="button"><i className="w-4 h-4" data-lucide="rotate-ccw" /><span>重置</span></button>
        <button className="image-edit-btn secondary" disabled={saving} onClick={onClose} type="button">取消</button>
        {mode !== 'preview' ? <button className="image-edit-btn primary" disabled={!source || saving} onClick={() => void apply()} type="button"><i className="w-4 h-4" data-lucide={mode === 'crop' ? 'crop' : 'expand'} /><span>{saving ? '正在上传…' : mode === 'crop' ? '应用裁剪' : '应用扩图'}</span></button> : null}
      </div>
      {status ? <div className="image-edit-sub" data-testid="image-transform-status">{status}</div> : null}
    </div>
  </div>;
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick(): void }) {
  return <button className={active ? 'active' : ''} onClick={onClick} type="button"><i className="w-3.5 h-3.5" data-lucide={icon} /><span>{label}</span></button>;
}

function clampCrop(region: CropRegion, source: ImageSize): CropRegion {
  const width = Math.max(24, Math.min(source.width, Number(region.width) || 24));
  const height = Math.max(24, Math.min(source.height, Number(region.height) || 24));
  return {
    width,
    height,
    x: Math.max(0, Math.min(source.width - width, Number(region.x) || 0)),
    y: Math.max(0, Math.min(source.height - height, Number(region.y) || 0)),
  };
}

function clampLegacyOutpaint(region: OutpaintRegion, source: ImageSize): OutpaintRegion {
  const width = Math.max(source.width, Number(region.width) || source.width);
  const height = Math.max(source.height, Number(region.height) || source.height);
  return {
    width,
    height,
    offsetX: Math.max(0, Math.min(width - source.width, Number(region.offsetX) || 0)),
    offsetY: Math.max(0, Math.min(height - source.height, Number(region.offsetY) || 0)),
  };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成编辑后的 PNG 图片')), 'image/png'));
}
