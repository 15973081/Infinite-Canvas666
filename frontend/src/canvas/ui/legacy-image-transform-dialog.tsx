import { useEffect, useMemo, useRef, useState } from 'react';
import { binaryMaskPixels, circledNumber, gridSplitRects, transformedImageName, type CropRegion, type GridLine, type GridRect, type ImageSize, type OutpaintRegion } from '../domain/image-transform';

type LegacyImageEditMode = 'brush' | 'grid' | 'mask' | 'preview' | 'crop' | 'outpaint';
type BrushTool = 'ellipse' | 'free' | 'label' | 'rect' | 'text';
type DrawSnapshot = { imageData: ImageData; labelCounter: number; textItems: TextItem[] };
type TextItem = { color: string; id: string; size: number; text: string; x: number; y: number };

export interface LegacyImageTransformResult {
  blob: Blob;
  height: number;
  mode: 'brush' | 'crop' | 'outpaint';
  name: string;
  width: number;
}

export interface LegacyMaskResult {
  blob: Blob;
  height: number;
  name: string;
  width: number;
}

export interface LegacyGridResult {
  items: Array<{ blob: Blob; name: string; rect: GridRect }>;
  layout: { cols: number; groupId: string; rows: number; type: 'grid-split' };
}

type DragState = {
  mode: 'crop-move' | 'crop-resize' | 'image' | 'outpaint-bottom' | 'outpaint-corner' | 'outpaint-left' | 'outpaint-right' | 'outpaint-top';
  startCrop: CropRegion;
  startOutpaint: OutpaintRegion;
  startX: number;
  startY: number;
};

export function LegacyImageTransformDialog({ name, onApply, onClose, onCreateMask, onGridSplit, url }: {
  name: string;
  onApply(result: LegacyImageTransformResult): Promise<void>;
  onClose(): void;
  onCreateMask(result: LegacyMaskResult): Promise<void>;
  onGridSplit(result: LegacyGridResult): Promise<void>;
  url: string;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const drawStateRef = useRef<{ imageData?: ImageData; lastX: number; lastY: number; pointerId: number; startX: number; startY: number } | null>(null);
  const undoRef = useRef<DrawSnapshot[]>([]);
  const redoRef = useRef<DrawSnapshot[]>([]);
  const labelCounterRef = useRef(1);
  const gridDragRef = useRef<{ index: number; pointerId: number } | null>(null);
  const gridHistoryRef = useRef<GridLine[][]>([]);
  const [mode, setMode] = useState<LegacyImageEditMode>('crop');
  const [source, setSource] = useState<ImageSize | null>(null);
  const [baseDisplay, setBaseDisplay] = useState<ImageSize>({ width: 1, height: 1 });
  const [stageSize, setStageSize] = useState<ImageSize>({ width: 1, height: 1 });
  const [crop, setCrop] = useState<CropRegion>({ x: 0, y: 0, width: 1, height: 1 });
  const [outpaint, setOutpaint] = useState<OutpaintRegion>({ offsetX: 0, offsetY: 0, width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [brushTool, setBrushTool] = useState<BrushTool>('free');
  const [brushColor, setBrushColor] = useState('#ff2d55');
  const [maskBrushSize, setMaskBrushSize] = useState(42);
  const [paintBrushSize, setPaintBrushSize] = useState(14);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [textEditorId, setTextEditorId] = useState('');
  const [gridRows, setGridRows] = useState(3);
  const [gridCols, setGridCols] = useState(3);
  const [gridGap, setGridGap] = useState(0);
  const [gridCustom, setGridCustom] = useState(false);
  const [gridOrientation, setGridOrientation] = useState<'h' | 'v'>('h');
  const [gridLines, setGridLines] = useState<GridLine[]>([]);
  const [gridVersion, setGridVersion] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
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
    drawStateRef.current = null;
    undoRef.current = [];
    redoRef.current = [];
    labelCounterRef.current = 1;
    setTextItems([]);
    setTextEditorId('');
    gridDragRef.current = null;
    gridHistoryRef.current = [];
    setGridRows(3);
    setGridCols(3);
    setGridGap(0);
    setGridCustom(false);
    setGridOrientation('h');
    setGridLines([]);
    setGridVersion((value) => value + 1);
    setHistoryVersion((value) => value + 1);
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
    const canvas = textCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    textItems.forEach((item) => {
      context.save();
      context.font = `800 ${item.size}px Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineWidth = Math.max(2, item.size / 10);
      context.strokeStyle = 'rgba(255,255,255,0.92)';
      context.strokeText(item.text, item.x, item.y);
      context.fillStyle = item.color;
      context.fillText(item.text, item.x, item.y);
      context.restore();
    });
  }, [textItems, source]);

  useEffect(() => {
    if (!source) return;
    const draw = drawCanvasRef.current;
    const text = textCanvasRef.current;
    if (!draw || !text) return;
    draw.width = source.width;
    draw.height = source.height;
    text.width = source.width;
    text.height = source.height;
    undoRef.current = [];
    redoRef.current = [];
    labelCounterRef.current = 1;
    setTextItems([]);
    setHistoryVersion((version) => version + 1);
  }, [source]);

  useEffect(() => {
    if (mode !== 'grid' || !source) return;
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.strokeStyle = 'rgba(248,250,252,.96)';
    context.lineWidth = Math.max(1, Math.min(canvas.width, canvas.height) / 420);
    context.setLineDash([8, 6]);
    const lines = gridCustom ? gridLines : [
      ...Array.from({ length: gridRows - 1 }, (_, index) => ({ type: 'h' as const, pos: (index + 1) / gridRows })),
      ...Array.from({ length: gridCols - 1 }, (_, index) => ({ type: 'v' as const, pos: (index + 1) / gridCols })),
    ];
    lines.forEach((line) => {
      const position = line.pos * (line.type === 'h' ? canvas.height : canvas.width);
      const draw = (offset: number) => {
        context.beginPath();
        if (line.type === 'h') { context.moveTo(0, position + offset); context.lineTo(canvas.width, position + offset); }
        else { context.moveTo(position + offset, 0); context.lineTo(position + offset, canvas.height); }
        context.stroke();
      };
      if (gridGap > 0) { draw(-gridGap / 2); draw(gridGap / 2); } else draw(0);
    });
    context.restore();
  }, [gridCols, gridCustom, gridGap, gridLines, gridRows, gridVersion, mode, source]);

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
    if (mode === 'grid' && next !== 'grid') clearDrawing(true);
    setMode(next);
    reset(next);
    setTextEditorId('');
    if (next === 'preview' || next === 'crop' || next === 'grid') clearDrawing(true);
  };

  const startDrag = (event: React.PointerEvent, dragMode: DragState['mode']) => {
    if (!source || saving) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { mode: dragMode, startCrop: crop, startOutpaint: outpaint, startX: event.clientX, startY: event.clientY };
  };

  const snapshot = (): DrawSnapshot | null => {
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return null;
    return { imageData: context.getImageData(0, 0, canvas.width, canvas.height), labelCounter: labelCounterRef.current, textItems: textItems.map((item) => ({ ...item })) };
  };

  const restoreSnapshot = (value: DrawSnapshot | undefined) => {
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !value) return;
    context.putImageData(value.imageData, 0, 0);
    labelCounterRef.current = value.labelCounter;
    setTextItems(value.textItems.map((item) => ({ ...item })));
    setTextEditorId('');
  };

  const pushHistory = () => {
    const value = snapshot();
    if (!value) return;
    undoRef.current = [...undoRef.current.slice(-19), value];
    redoRef.current = [];
    setHistoryVersion((version) => version + 1);
  };

  const undoDrawing = () => {
    const value = undoRef.current.pop();
    const current = snapshot();
    if (!value || !current) return;
    redoRef.current.push(current);
    restoreSnapshot(value);
    setHistoryVersion((version) => version + 1);
  };

  const redoDrawing = () => {
    const value = redoRef.current.pop();
    const current = snapshot();
    if (!value || !current) return;
    undoRef.current.push(current);
    restoreSnapshot(value);
    setHistoryVersion((version) => version + 1);
  };

  const clearDrawing = (silent = false) => {
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    if (!silent && (canvasHasPixels(canvas) || textItems.length)) pushHistory();
    context.clearRect(0, 0, canvas.width, canvas.height);
    labelCounterRef.current = 1;
    setTextItems([]);
    setTextEditorId('');
    setHistoryVersion((version) => version + 1);
  };

  const drawPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvas.width / Math.max(1, bounds.width),
      y: (event.clientY - bounds.top) * canvas.height / Math.max(1, bounds.height),
    };
  };

  const configureDrawing = (context: CanvasRenderingContext2D) => {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = mode === 'mask' ? maskBrushSize : paintBrushSize;
    context.strokeStyle = mode === 'mask' ? 'rgba(255,255,255,0.451)' : brushColor;
    context.fillStyle = context.strokeStyle;
    context.globalCompositeOperation = 'source-over';
  };

  const beginDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'grid') {
      if (!gridCustom || saving) return;
      event.preventDefault();
      event.stopPropagation();
      const canvas = event.currentTarget;
      const point = drawPoint(event);
      const threshold = Math.max(8, Math.min(canvas.width, canvas.height) / 80);
      let hitIndex = -1;
      let distance = Number.POSITIVE_INFINITY;
      gridLines.forEach((line, index) => {
        const next = line.type === 'h' ? Math.abs(point.y - line.pos * canvas.height) : Math.abs(point.x - line.pos * canvas.width);
        if (next <= threshold && next < distance) { hitIndex = index; distance = next; }
      });
      gridHistoryRef.current.push(gridLines.map((line) => ({ ...line })));
      const nextLine = { type: gridOrientation, pos: gridOrientation === 'h' ? point.y / canvas.height : point.x / canvas.width } as GridLine;
      const index = hitIndex >= 0 ? hitIndex : gridLines.length;
      setGridLines((lines) => hitIndex >= 0 ? lines.map((line, itemIndex) => itemIndex === hitIndex ? { ...line, pos: nextLine.pos } : line) : [...lines, nextLine]);
      gridDragRef.current = { index, pointerId: event.pointerId };
      canvas.setPointerCapture(event.pointerId);
      setGridVersion((value) => value + 1);
      return;
    }
    if (!['brush', 'mask'].includes(mode) || saving || (mode === 'brush' && brushTool === 'text')) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget;
    const context = canvas.getContext('2d');
    if (!context) return;
    const point = drawPoint(event);
    pushHistory();
    canvas.setPointerCapture(event.pointerId);
    configureDrawing(context);
    if (mode === 'brush' && brushTool === 'label') {
      const size = Math.max(18, paintBrushSize * 2.2);
      const label = circledNumber(labelCounterRef.current++);
      context.save();
      context.font = `900 ${size}px Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineWidth = Math.max(3, size / 8);
      context.strokeStyle = 'rgba(255,255,255,0.92)';
      context.strokeText(label, point.x, point.y);
      context.fillStyle = brushColor;
      context.fillText(label, point.x, point.y);
      context.restore();
      canvas.releasePointerCapture(event.pointerId);
      setHistoryVersion((version) => version + 1);
      return;
    }
    const imageData = brushTool === 'rect' || brushTool === 'ellipse' ? context.getImageData(0, 0, canvas.width, canvas.height) : undefined;
    drawStateRef.current = { imageData, lastX: point.x, lastY: point.y, pointerId: event.pointerId, startX: point.x, startY: point.y };
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    if (mode === 'mask' || brushTool === 'free') context.stroke();
    if (mode === 'mask') normalizeMaskPreview(canvas);
  };

  const moveDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const gridDrag = gridDragRef.current;
    if (mode === 'grid' && gridCustom && gridDrag?.pointerId === event.pointerId) {
      event.preventDefault();
      const point = drawPoint(event);
      setGridLines((lines) => lines.map((line, index) => index === gridDrag.index ? {
        ...line,
        pos: Math.max(0.001, Math.min(0.999, line.type === 'h' ? point.y / event.currentTarget.height : point.x / event.currentTarget.width)),
      } : line));
      return;
    }
    const state = drawStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    const context = canvas.getContext('2d');
    if (!context) return;
    const point = drawPoint(event);
    if (mode === 'brush' && brushTool !== 'free' && state.imageData) {
      context.putImageData(state.imageData, 0, 0);
      configureDrawing(context);
      const x = Math.min(state.startX, point.x);
      const y = Math.min(state.startY, point.y);
      const width = Math.abs(point.x - state.startX);
      const height = Math.abs(point.y - state.startY);
      if (brushTool === 'rect') context.strokeRect(x, y, width, height);
      else if (brushTool === 'ellipse') {
        context.beginPath();
        context.ellipse(x + width / 2, y + height / 2, Math.max(1, width / 2), Math.max(1, height / 2), 0, 0, Math.PI * 2);
        context.stroke();
      }
      return;
    }
    configureDrawing(context);
    context.beginPath();
    context.moveTo(state.lastX, state.lastY);
    context.lineTo(point.x, point.y);
    context.stroke();
    state.lastX = point.x;
    state.lastY = point.y;
    if (mode === 'mask') normalizeMaskPreview(canvas);
  };

  const endDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (gridDragRef.current?.pointerId === event.pointerId) {
      gridDragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setGridVersion((value) => value + 1);
    }
    if (drawStateRef.current?.pointerId === event.pointerId) {
      drawStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setHistoryVersion((version) => version + 1);
    }
  };

  const beginText = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'brush' || brushTool !== 'text' || saving) return;
    event.preventDefault();
    event.stopPropagation();
    const point = drawPoint(event);
    const hit = [...textItems].reverse().find((item) => Math.abs(item.x - point.x) <= Math.max(30, item.text.length * item.size * 0.35) && Math.abs(item.y - point.y) <= item.size);
    if (hit) { setTextEditorId(hit.id); return; }
    pushHistory();
    const item: TextItem = { color: brushColor, id: `text_${crypto.randomUUID?.() || Date.now()}`, size: Math.max(12, paintBrushSize * 2), text: '文字', x: point.x, y: point.y };
    setTextItems((items) => [...items, item]);
    setTextEditorId(item.id);
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
      } else if (mode === 'outpaint') {
        const region = clampLegacyOutpaint(outpaint, source);
        canvas.width = Math.max(1, Math.round(region.width));
        canvas.height = Math.max(1, Math.round(region.height));
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, Math.round(region.offsetX), Math.round(region.offsetY), source.width, source.height);
      } else if (mode === 'grid') {
        const rects = gridSplitRects(source.width, source.height, gridCustom ? { gap: gridGap, lines: gridLines } : { cols: gridCols, gap: gridGap, rows: gridRows });
        if (!rects.length) throw new Error('当前切割线没有产生有效图片');
        const base = String(name || 'image').replace(/\.[^.]+$/, '') || 'image';
        const items: LegacyGridResult['items'] = [];
        for (const rect of rects) {
          const part = document.createElement('canvas');
          part.width = rect.w;
          part.height = rect.h;
          part.getContext('2d')?.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
          items.push({ blob: await canvasBlob(part), name: `${base}_r${rect.row + 1}_c${rect.col + 1}.png`, rect });
        }
        setStatus(`正在上传 ${items.length} 张切分图片…`);
        await onGridSplit({
          items,
          layout: {
            cols: Math.max(1, ...rects.map((rect) => rect.col + 1)),
            groupId: `grid_${crypto.randomUUID?.() || Date.now()}`,
            rows: Math.max(1, ...rects.map((rect) => rect.row + 1)),
            type: 'grid-split',
          },
        });
        onClose();
        return;
      } else if (mode === 'mask') {
        const drawCanvas = drawCanvasRef.current;
        const drawContext = drawCanvas?.getContext('2d');
        if (!drawCanvas || !drawContext || !canvasHasPixels(drawCanvas)) throw new Error('请先绘制遮罩区域');
        const sourcePixels = drawContext.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
        const maskPixels = binaryMaskPixels(sourcePixels.data);
        canvas.width = drawCanvas.width;
        canvas.height = drawCanvas.height;
        const maskImage = context.createImageData(canvas.width, canvas.height);
        maskImage.data.set(maskPixels);
        context.putImageData(maskImage, 0, 0);
        const blob = await canvasBlob(canvas);
        setStatus('正在上传遮罩…');
        await onCreateMask({ blob, height: canvas.height, name: legacyImageName(name, 'mask'), width: canvas.width });
        onClose();
        return;
      } else {
        const drawCanvas = drawCanvasRef.current;
        const textCanvas = textCanvasRef.current;
        if (!drawCanvas || !textCanvas || (!canvasHasPixels(drawCanvas) && !textItems.length)) throw new Error('请先绘制图片内容');
        canvas.width = source.width;
        canvas.height = source.height;
        context.drawImage(image, 0, 0, source.width, source.height);
        context.drawImage(drawCanvas, 0, 0);
        context.drawImage(textCanvas, 0, 0);
      }
      const blob = await canvasBlob(canvas);
      setStatus('正在上传编辑结果…');
      await onApply({ blob, height: canvas.height, mode, name: mode === 'brush' ? legacyImageName(name, 'paint') : transformedImageName(name, mode), width: canvas.width });
      onClose();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message || cause.name || '图片转换失败' : String(cause) || '图片转换失败');
    } finally {
      setSaving(false);
    }
  };

  const applyGridPreset = (rows: number, cols: number) => {
    setGridCustom(false);
    setGridRows(rows);
    setGridCols(cols);
    setGridLines([]);
    gridHistoryRef.current = [];
    setGridVersion((value) => value + 1);
  };
  const undoGridLine = () => {
    const previous = gridHistoryRef.current.pop();
    if (!previous) return;
    setGridLines(previous);
    setGridVersion((value) => value + 1);
  };
  const canUndo = historyVersion >= 0 && undoRef.current.length > 0;
  const canRedo = historyVersion >= 0 && redoRef.current.length > 0;
  const activeText = textItems.find((item) => item.id === textEditorId);

  return <div aria-label="编辑图片" aria-modal="true" className="image-edit-modal open canvas-modern-image-edit" onClick={onClose} role="dialog" style={{ zIndex: 1100 }}>
    <div className="image-edit-panel" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <div className="image-edit-head">
        <div className="image-edit-headline"><div className="image-edit-title">{modeTitle(mode)}</div><div className="image-edit-sub">{modeHint(mode)}</div></div>
        <div className="image-edit-mode">
          <ModeButton active={mode === 'preview'} icon="eye" label="预览" onClick={() => chooseMode('preview')} />
          <ModeButton active={mode === 'crop'} icon="crop" label="裁剪" onClick={() => chooseMode('crop')} />
          <ModeButton active={mode === 'outpaint'} icon="expand" label="扩图" onClick={() => chooseMode('outpaint')} />
          <ModeButton active={mode === 'mask'} icon="brush" label="遮罩" onClick={() => chooseMode('mask')} />
          <ModeButton active={mode === 'brush'} icon="paintbrush" label="画笔" onClick={() => chooseMode('brush')} />
          <ModeButton active={mode === 'grid'} icon="grid-3x3" label="宫格切分" onClick={() => chooseMode('grid')} />
        </div>
        <div className="image-edit-head-end"><button aria-label="关闭" className="preview-icon-btn" disabled={saving} onClick={onClose} title="关闭" type="button"><i className="w-4 h-4" data-lucide="x" /></button></div>
      </div>
      <div className={`image-edit-tools ${mode === 'mask' ? 'active' : ''}`}>
        <label><span>笔刷</span><input aria-label="遮罩笔刷大小" max="160" min="4" onChange={(event) => setMaskBrushSize(Number(event.target.value))} type="range" value={maskBrushSize} /></label>
        <HistoryButton disabled={!canUndo} icon="undo-2" label="撤销遮罩" onClick={undoDrawing} />
        <HistoryButton disabled={!canRedo} icon="redo-2" label="恢复遮罩" onClick={redoDrawing} />
        <button className="image-edit-btn secondary" onClick={() => clearDrawing()} type="button"><i className="w-4 h-4" data-lucide="eraser" /><span>清空</span></button>
        <span className="image-edit-sub">白色区域为要编辑的遮罩</span>
      </div>
      <div className={`image-edit-tools ${mode === 'brush' ? 'active' : ''}`}>
        {([['free', 'paintbrush', '自由画笔'], ['rect', 'square', '矩形'], ['ellipse', 'circle', '椭圆'], ['label', 'list-ordered', '数字标签'], ['text', 'type', '文字标签']] as const).map(([tool, icon, label]) => <button aria-label={label} className={`image-edit-btn ${brushTool === tool ? 'primary' : 'secondary'}`} key={tool} onClick={() => { setBrushTool(tool); setTextEditorId(''); }} title={label} type="button"><i className="w-4 h-4" data-lucide={icon} /></button>)}
        <label><span>颜色</span><input aria-label="画笔颜色" onChange={(event) => setBrushColor(event.target.value)} type="color" value={brushColor} /></label>
        <label><span>笔刷</span><input aria-label="画笔大小" max="80" min="2" onChange={(event) => setPaintBrushSize(Number(event.target.value))} type="range" value={paintBrushSize} /></label>
        <HistoryButton disabled={!canUndo} icon="undo-2" label="撤销画笔" onClick={undoDrawing} />
        <HistoryButton disabled={!canRedo} icon="redo-2" label="恢复画笔" onClick={redoDrawing} />
        <button className="image-edit-btn secondary" onClick={() => clearDrawing()} type="button"><i className="w-4 h-4" data-lucide="eraser" /><span>清空</span></button>
      </div>
      <div className={`image-edit-tools ${mode === 'grid' ? 'active' : ''}`}>
        <button className={`image-edit-btn ${gridCustom ? 'primary' : 'secondary'}`} onClick={() => { setGridCustom((value) => !value); setGridLines([]); gridHistoryRef.current = []; setGridVersion((value) => value + 1); }} title="自由放置切割线" type="button">自定义</button>
        <div className="grid-preset-row"><span className="image-edit-sub">预设</span>{([[1, 2], [2, 1], [2, 2], [2, 3], [3, 2], [3, 3]] as const).map(([rows, cols]) => <button className="grid-preset-btn" key={`${rows}x${cols}`} onClick={() => applyGridPreset(rows, cols)} type="button">{rows}×{cols}</button>)}</div>
        {!gridCustom ? <span style={{ display: 'contents' }}><label><span>横向线</span><input aria-label="横向线" max="20" min="0" onChange={(event) => setGridRows(Math.max(1, Math.min(21, Number(event.target.value) + 1)))} type="number" value={gridRows - 1} /></label><label><span>竖向线</span><input aria-label="竖向线" max="20" min="0" onChange={(event) => setGridCols(Math.max(1, Math.min(21, Number(event.target.value) + 1)))} type="number" value={gridCols - 1} /></label></span> : <div style={{ alignItems: 'center', display: 'flex', gap: 6 }}>
          <button className={`image-edit-btn ${gridOrientation === 'h' ? 'primary' : 'secondary'}`} onClick={() => setGridOrientation('h')} title="点击图片放置水平线" type="button">水平</button>
          <button className={`image-edit-btn ${gridOrientation === 'v' ? 'primary' : 'secondary'}`} onClick={() => setGridOrientation('v')} title="点击图片放置竖直线" type="button">垂直</button>
          <button aria-label="撤销切割线" className="image-edit-btn secondary" disabled={!gridHistoryRef.current.length} onClick={undoGridLine} style={{ opacity: gridHistoryRef.current.length ? 1 : 0.4 }} title="撤销上一条线" type="button"><i className="w-3.5 h-3.5" data-lucide="undo-2" /></button>
          <button aria-label="清除自定义线" className="image-edit-btn secondary" onClick={() => { gridHistoryRef.current = []; setGridLines([]); setGridVersion((value) => value + 1); }} title="清除所有自定义线" type="button"><i className="w-3.5 h-3.5" data-lucide="eraser" /></button>
        </div>}
        <label className="grid-gap-control"><span>间隔(px)</span><input aria-label="宫格间隔" max="240" min="0" onChange={(event) => setGridGap(Math.max(0, Math.min(240, Number(event.target.value))))} step="1" type="range" value={gridGap} /><span className="grid-gap-value">{gridGap}</span></label>
        <span className="image-edit-sub">将输出 {gridCustom ? (gridLines.filter((line) => line.type === 'h').length + 1) * (gridLines.filter((line) => line.type === 'v').length + 1) : gridRows * gridCols} 张图片</span>
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
          <div className={`crop-canvas ${mode === 'preview' ? 'preview-mode' : mode === 'outpaint' ? `outpaint-mode ${outpaint.width > 4096 || outpaint.height > 4096 ? 'outpaint-warning' : ''}` : mode === 'mask' ? 'mask-mode' : mode === 'brush' ? `brush-mode ${brushTool === 'text' ? 'text-mode' : ''}` : mode === 'grid' ? `grid-mode ${gridCustom ? `grid-custom-${gridOrientation}` : ''}` : ''}`} style={source ? { height: canvasSize.height, width: canvasSize.width } : undefined}>
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
            <canvas className="edit-draw-canvas" height={source?.height || 1} onPointerCancel={endDrawing} onPointerDown={beginDrawing} onPointerLeave={endDrawing} onPointerMove={moveDrawing} onPointerUp={endDrawing} ref={drawCanvasRef} style={{ height: display.height, left: mode === 'outpaint' ? outpaint.offsetX * scaleX : undefined, top: mode === 'outpaint' ? outpaint.offsetY * scaleY : undefined, width: display.width }} width={source?.width || 1} />
            <canvas className="edit-text-canvas" height={source?.height || 1} onDoubleClick={beginText} onPointerDown={beginText} ref={textCanvasRef} style={{ height: display.height, left: mode === 'outpaint' ? outpaint.offsetX * scaleX : undefined, top: mode === 'outpaint' ? outpaint.offsetY * scaleY : undefined, width: display.width }} width={source?.width || 1} />
            {activeText ? <div className="edit-text-inline" contentEditable onBlur={(event) => {
              const next = event.currentTarget.textContent?.trim() || '';
              setTextItems((items) => next ? items.map((item) => item.id === activeText.id ? { ...item, text: next } : item) : items.filter((item) => item.id !== activeText.id));
              setTextEditorId('');
            }} onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); }
              if (event.key === 'Escape') { event.preventDefault(); setTextEditorId(''); }
            }} ref={(element) => { if (element && document.activeElement !== element) { element.textContent = activeText.text; window.requestAnimationFrame(() => element.focus()); } }} style={{ color: activeText.color, fontSize: activeText.size * scaleY, left: activeText.x * scaleX, top: activeText.y * scaleY, transform: 'translate(-50%, -50%)' }} suppressContentEditableWarning /> : null}
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
        {mode !== 'preview' ? <button className="image-edit-btn primary" disabled={!source || saving} onClick={() => void apply()} type="button"><i className="w-4 h-4" data-lucide={modeIcon(mode)} /><span>{saving ? '正在上传…' : applyLabel(mode)}</span></button> : null}
      </div>
      {status ? <div className="image-edit-sub" data-testid="image-transform-status">{status}</div> : null}
    </div>
  </div>;
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick(): void }) {
  return <button className={active ? 'active' : ''} onClick={onClick} type="button"><i className="w-3.5 h-3.5" data-lucide={icon} /><span>{label}</span></button>;
}

function HistoryButton({ disabled, icon, label, onClick }: { disabled: boolean; icon: string; label: string; onClick(): void }) {
  return <button aria-label={label} className="image-edit-btn secondary" disabled={disabled} onClick={onClick} style={{ opacity: disabled ? 0.42 : 1 }} title={label} type="button"><i className="w-4 h-4" data-lucide={icon} /></button>;
}

function modeTitle(mode: LegacyImageEditMode): string {
  return mode === 'preview' ? '预览图片' : mode === 'crop' ? '裁剪图片' : mode === 'outpaint' ? '扩图' : mode === 'mask' ? '遮罩编辑' : mode === 'brush' ? '画笔编辑' : '宫格切分';
}

function modeHint(mode: LegacyImageEditMode): string {
  return mode === 'preview' ? '滚轮缩放查看图片'
    : mode === 'crop' ? '拖动裁剪区域并调整右下角控制点'
      : mode === 'outpaint' ? '拖动原图或边缘控制点调整画布'
          : mode === 'mask' ? '白色绘制区域将生成黑白遮罩图'
            : mode === 'brush' ? '使用画笔、图形、数字或文字标记图片'
              : '使用预设或自定义切割线批量拆分图片';
}

function modeIcon(mode: Exclude<LegacyImageEditMode, 'preview'>): string {
  return mode === 'crop' ? 'crop' : mode === 'outpaint' ? 'expand' : mode === 'mask' ? 'brush' : mode === 'brush' ? 'paintbrush' : 'grid-3x3';
}

function applyLabel(mode: Exclude<LegacyImageEditMode, 'preview'>): string {
  return mode === 'crop' ? '应用裁剪' : mode === 'outpaint' ? '应用扩图' : mode === 'mask' ? '应用遮罩' : mode === 'brush' ? '应用画笔' : '应用切分';
}

function canvasHasPixels(canvas: HTMLCanvasElement): boolean {
  const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
  if (!data) return false;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
  return false;
}

function normalizeMaskPreview(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  let changed = false;
  for (let index = 0; index < image.data.length; index += 4) {
    if (!image.data[index + 3]) continue;
    image.data[index] = 255;
    image.data[index + 1] = 255;
    image.data[index + 2] = 255;
    if (image.data[index + 3] > 115) image.data[index + 3] = 115;
    changed = true;
  }
  if (changed) context.putImageData(image, 0, 0);
}

function legacyImageName(name: string, suffix: 'mask' | 'paint'): string {
  const base = String(name || 'image').replace(/\.[^.]+$/, '') || 'image';
  return `${base}_${suffix}.png`;
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
