import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  normalizeCrop,
  normalizeOutpaint,
  transformedImageName,
  type CropRegion,
  type ImageSize,
  type OutpaintRegion,
} from '../domain/image-transform';

export interface ImageTransformResult {
  blob: Blob;
  height: number;
  mode: 'crop' | 'outpaint';
  name: string;
  width: number;
}

export function ImageTransformDialog({ name, onApply, onClose, url }: {
  name: string;
  onApply(result: ImageTransformResult): Promise<void>;
  onClose(): void;
  url: string;
}) {
  const [source, setSource] = useState<ImageSize | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<'crop' | 'outpaint'>('crop');
  const [crop, setCrop] = useState<CropRegion>({ x: 0, y: 0, width: 1, height: 1 });
  const [outpaint, setOutpaint] = useState<OutpaintRegion>({ offsetX: 0, offsetY: 0, width: 1, height: 1 });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let disposed = false;
    const next = new Image();
    if (/^https?:/i.test(url)) next.crossOrigin = 'anonymous';
    next.onload = () => {
      if (disposed) return;
      const dimensions = { width: next.naturalWidth, height: next.naturalHeight };
      imageRef.current = next;
      setSource(dimensions);
      setCrop({ x: 0, y: 0, ...dimensions });
      setOutpaint({ offsetX: 0, offsetY: 0, ...dimensions });
    };
    next.onerror = () => { if (!disposed) setStatus('无法读取图片，远程图片可能不允许跨域编辑'); };
    next.src = url;
    return () => { disposed = true; imageRef.current = null; next.src = ''; };
  }, [url]);

  const apply = async () => {
    const image = imageRef.current;
    if (!image || !source) {
      setStatus('图片尚未加载完成');
      return;
    }
    setSaving(true);
    setStatus('正在生成 PNG…');
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('当前浏览器无法创建图片编辑画布');
      if (mode === 'crop') {
        const region = normalizeCrop(crop, source);
        canvas.width = region.width;
        canvas.height = region.height;
        context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
      } else {
        const region = normalizeOutpaint(outpaint, source);
        canvas.width = region.width;
        canvas.height = region.height;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, region.width, region.height);
        context.drawImage(image, region.offsetX, region.offsetY, source.width, source.height);
      }
      const blob = await canvasBlob(canvas);
      setStatus('正在上传编辑结果…');
      await onApply({ blob, height: canvas.height, mode, name: transformedImageName(name, mode), width: canvas.width });
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message || cause.name || '图片转换失败' : String(cause) || '图片转换失败';
      setStatus(message);
    } finally {
      setSaving(false);
    }
  };

  const numberField = (label: string, value: number, update: (value: number) => void, min = 0) => <label className="field"><span>{label}</span><input aria-label={label} className="setting-input" min={min} onChange={(event) => update(Number(event.target.value))} type="number" value={value} /></label>;
  return createPortal(<div className="modal open canvas-image-transform" onClick={onClose} onPointerDown={(event) => event.stopPropagation()} role="dialog">
    <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
      <header><strong>编辑图片</strong><button disabled={saving} onClick={onClose} type="button">关闭</button></header>
      <div className="mode-tabs"><button className={mode === 'crop' ? 'active' : ''} onClick={() => setMode('crop')} type="button">裁剪</button><button className={mode === 'outpaint' ? 'active' : ''} onClick={() => setMode('outpaint')} type="button">扩图</button></div>
      <img alt="图片编辑预览" className="canvas-image-transform-preview" src={url} />
      {source ? <p>{source.width} × {source.height}px</p> : <p>正在读取图片…</p>}
      {mode === 'crop' ? <div className="canvas-image-transform-fields">
        {numberField('裁剪 X', crop.x, (x) => setCrop((value) => ({ ...value, x })))}
        {numberField('裁剪 Y', crop.y, (y) => setCrop((value) => ({ ...value, y })))}
        {numberField('裁剪宽度', crop.width, (width) => setCrop((value) => ({ ...value, width })), 1)}
        {numberField('裁剪高度', crop.height, (height) => setCrop((value) => ({ ...value, height })), 1)}
      </div> : <div className="canvas-image-transform-fields">
        {numberField('扩图宽度', outpaint.width, (width) => setOutpaint((value) => ({ ...value, width })), source?.width || 1)}
        {numberField('扩图高度', outpaint.height, (height) => setOutpaint((value) => ({ ...value, height })), source?.height || 1)}
        {numberField('原图 X 偏移', outpaint.offsetX, (offsetX) => setOutpaint((value) => ({ ...value, offsetX })))}
        {numberField('原图 Y 偏移', outpaint.offsetY, (offsetY) => setOutpaint((value) => ({ ...value, offsetY })))}
      </div>}
      {status ? <small data-testid="image-transform-status">{status}</small> : null}
      <button className="primary-btn" disabled={!source || saving} onClick={() => void apply()} type="button">{saving ? '正在上传…' : mode === 'crop' ? '应用裁剪' : '应用扩图'}</button>
    </section>
  </div>, document.body);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成编辑后的 PNG 图片')), 'image/png'));
}
