import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeStudioEvents } from '../../shared/studio-events';
import { createOnlineImageTask, deleteHistory, loadHistory, loadOnlineProviders, pollOnlineImageTask, uploadReference } from './client';
import type { StudioImageItem, StudioProvider, StudioReference } from './types';

interface ReferenceSlot {
  data: StudioReference;
  height: number;
  name: string;
  preview: string;
  width: number;
}

interface PendingTask {
  error?: string;
  id: string;
  prompt: string;
  status: 'failed' | 'queued' | 'running';
}

type IconName = 'alert' | 'copy' | 'download' | 'images' | 'layout' | 'plus' | 'ruler' | 'sliders' | 'terminal' | 'x' | 'zap';

const PAGE_SIZE = 24;

const SIZE_OPTIONS: Record<string, Record<string, [number, number]>> = {
  square: { '1k': [1024, 1024], '2k': [2048, 2048], '4k': [3840, 2160] },
  portrait: { '1k': [1024, 1536], '2k': [1360, 2048], '4k': [2352, 3520] },
  landscape: { '1k': [1536, 1024], '2k': [2048, 1360], '4k': [3520, 2352] },
  portrait43: { '1k': [1008, 1344], '2k': [1536, 2048], '4k': [2448, 3264] },
  landscape43: { '1k': [1344, 1008], '2k': [2048, 1536], '4k': [3264, 2448] },
  story: { '1k': [720, 1280], '2k': [1152, 2048], '4k': [2160, 3840] },
  wide: { '1k': [1280, 720], '2k': [2048, 1152], '4k': [3840, 2160] },
};

const RES_LONG_SIDE: Record<string, number> = { '1k': 1536, '2k': 2048, '4k': 3840 };
const RES_PIXEL_LIMIT: Record<string, number> = { '1k': 1_572_864, '2k': 4_194_304, '4k': 8_294_400 };

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';

function imageDimensions(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('无法读取图片尺寸'));
    image.src = source;
  });
}

function customRatioSize(resolution: string, width: string, height: string): [number, number] | null {
  const ratio = Number(width) / Number(height);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const longSide = RES_LONG_SIDE[resolution] || 1024;
  const pixelLimit = RES_PIXEL_LIMIT[resolution] || longSide * longSide;
  const rawWidth = ratio >= 1 ? longSide : Math.min(longSide * ratio, Math.sqrt(pixelLimit * ratio));
  const rawHeight = ratio >= 1 ? Math.min(longSide / ratio, Math.sqrt(pixelLimit / ratio)) : longSide;
  return [Math.max(64, Math.floor(rawWidth / 16) * 16), Math.max(64, Math.floor(rawHeight / 16) * 16)];
}

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    alert: <><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" /><path d="M12 9v4M12 17h.01" /></>,
    copy: <><rect width="13" height="13" x="9" y="9" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
    images: <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>,
    layout: <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    plus: <path d="M5 12h14M12 5v14" />,
    ruler: <><path d="m16 2 6 6L8 22l-6-6Z" /><path d="m14 4 6 6M13 7l-2-2M16 10l-2-2M10 10l-2-2M13 13l-2-2M7 13l-2-2M10 16l-2-2M4 16l-2-2" /></>,
    sliders: <><path d="M21 4H14M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" /><path d="M14 2v4M8 10v4M16 18v4" /></>,
    terminal: <><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></>,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    zap: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  };
  return <svg aria-hidden="true" className={className} fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24">{paths[name]}</svg>;
}

export function OnlineStudioApp() {
  const [prompt, setPrompt] = useState('');
  const [providers, setProviders] = useState<StudioProvider[]>([]);
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [quality, setQuality] = useState('auto');
  const [count, setCount] = useState(1);
  const [resolution, setResolution] = useState('1k');
  const [ratio, setRatio] = useState('square');
  const [customRatioWidth, setCustomRatioWidth] = useState('');
  const [customRatioHeight, setCustomRatioHeight] = useState('');
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [references, setReferences] = useState<Array<ReferenceSlot | null>>([null, null, null, null]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [items, setItems] = useState<StudioImageItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [selected, setSelected] = useState<StudioImageItem | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxItem, setLightboxItem] = useState<StudioImageItem | null>(null);
  const [lightboxResolution, setLightboxResolution] = useState('...');
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [previewPanning, setPreviewPanning] = useState(false);
  const [bulkSelecting, setBulkSelecting] = useState(false);
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [status, setStatus] = useState('正在加载归档…');
  const [creating, setCreating] = useState(false);
  const fileInputs = useRef<Array<HTMLInputElement | null>>([]);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const previewDrag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const referencesRef = useRef(references);
  referencesRef.current = references;

  const refreshProviders = async () => {
    const next = await loadOnlineProviders();
    setProviders(next);
    setProviderId(current => next.some(provider => provider.id === current) ? current : next[0]?.id ?? '');
  };

  useEffect(() => {
    Promise.all([loadHistory('online'), refreshProviders()])
      .then(([history]) => { setItems(history); setStatus('已就绪'); })
      .catch(error => setStatus(errorMessage(error)));
    const unsubscribe = subscribeStudioEvents(type => {
      if (type === 'providers-changed' || type === 'workflows-changed') void refreshProviders();
    });
    const visible = () => { if (!document.hidden) void refreshProviders(); };
    document.addEventListener('visibilitychange', visible);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', visible); };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('history-bulk-selecting', bulkSelecting);
    return () => document.body.classList.remove('history-bulk-selecting');
  }, [bulkSelecting]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || visibleCount >= items.length) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setVisibleCount(current => Math.min(items.length, current + PAGE_SIZE));
    }, { threshold: .1 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [items.length, visibleCount]);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items ?? [])]
        .find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
      if (!file) return;
      const index = referencesRef.current.findIndex(slot => !slot);
      void selectReference(file, index < 0 ? 0 : index);
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, []);

  const activeProvider = providers.find(provider => provider.id === providerId);
  const models = activeProvider?.image_models ?? [];
  useEffect(() => { if (!models.includes(model)) setModel(models[0] ?? ''); }, [providerId, models.join('|')]);

  const protocol = useMemo(() => {
    const value = `${activeProvider?.protocol ?? ''} ${activeProvider?.id ?? ''} ${activeProvider?.base_url ?? ''}`.toLowerCase();
    if (value.includes('modelscope')) return 'ModelScope';
    if (value.includes('volcengine')) return 'Volcengine';
    if (value.includes('gemini')) return 'Gemini';
    return 'API';
  }, [activeProvider]);
  const supportsQuality = protocol === 'API';

  const dimensions = useMemo<[number, number]>(() => {
    if (resolution === 'custom') {
      const width = Math.round(Number(customWidth));
      const height = Math.round(Number(customHeight));
      return [width > 0 ? width : 1024, height > 0 ? height : 1024];
    }
    if (ratio === 'custom') return customRatioSize(resolution, customRatioWidth, customRatioHeight) ?? [1024, 1024];
    return SIZE_OPTIONS[ratio]?.[resolution] ?? SIZE_OPTIONS.square['1k'];
  }, [resolution, ratio, customRatioWidth, customRatioHeight, customWidth, customHeight]);
  const [width, height] = dimensions;
  const currentImage = selected?.images[selectedImageIndex] ?? selected?.images[0];
  const lightboxImage = lightboxItem?.images[0];
  const visibleItems = items.slice(0, visibleCount);

  const selectReference = async (file: File | undefined, index: number) => {
    if (!file || !file.type.startsWith('image/')) return;
    const preview = URL.createObjectURL(file);
    const previous = referencesRef.current[index];
    const dimensions = await imageDimensions(preview).catch(() => ({ width: 0, height: 0 }));
    setReferences(current => current.map((slot, slotIndex) => slotIndex === index
      ? { data: {}, name: file.name, preview, ...dimensions }
      : slot));
    setStatus('正在上传参考图…');
    try {
      const data = await uploadReference(file);
      setReferences(current => current.map((slot, slotIndex) => {
        if (slotIndex !== index) return slot;
        if (previous && previous.preview !== preview) URL.revokeObjectURL(previous.preview);
        return { data, name: file.name, preview, ...dimensions };
      }));
      setStatus('参考图已上传');
    } catch (error) {
      URL.revokeObjectURL(preview);
      setStatus(errorMessage(error));
    }
  };

  const clearReference = (index: number) => setReferences(current => current.map((slot, slotIndex) => {
    if (slotIndex !== index) return slot;
    if (slot) URL.revokeObjectURL(slot.preview);
    return null;
  }));

  const setResolutionValue = (value: string) => {
    setResolution(value);
    if (value === 'custom') setRatio('');
    else if (!ratio) setRatio('square');
    if (value !== 'custom') { setCustomWidth(''); setCustomHeight(''); }
  };

  const setRatioValue = (value: string) => {
    setRatio(value);
    if (value !== 'custom') { setCustomRatioWidth(''); setCustomRatioHeight(''); }
  };

  const fitCustomSize = () => {
    const reference = references.find(slot => slot?.width && slot.height);
    if (!reference) return;
    setResolution('custom'); setRatio('');
    setCustomWidth(String(reference.width)); setCustomHeight(String(reference.height));
  };

  const generate = async () => {
    const value = prompt.trim();
    if (!value) { setStatus('请输入提示词'); return; }
    if (!providerId || !model) { setStatus('请先在 API 设置中配置可用的图片模型'); return; }
    setCreating(true); setStatus('正在创建生成任务…');
    try {
      const input = {
        prompt: value,
        mode: 'online',
        providerId,
        model,
        width,
        height,
        quality: supportsQuality ? quality : '',
        count,
        references: references.flatMap(slot => slot ? [slot.data] : []),
        extras: {},
      };
      const taskId = await createOnlineImageTask(input);
      setPendingTasks(current => [{ id: taskId, prompt: value, status: 'queued' }, ...current.filter(task => task.id !== taskId)]);
      void pollOnlineImageTask(taskId, value, setStatus, taskStatus => {
        if (taskStatus !== 'queued' && taskStatus !== 'running') return;
        setPendingTasks(current => current.map(task => task.id === taskId ? { ...task, status: taskStatus } : task));
      }).then(result => {
        setPendingTasks(current => current.filter(task => task.id !== taskId));
        setItems(current => [result, ...current.filter(item => String(item.timestamp) !== String(result.timestamp))]);
        setVisibleCount(current => Math.max(PAGE_SIZE, current + 1));
        setSelected(result); setSelectedImageIndex(0); setStatus(`生成完成，共 ${result.images.length} 张`);
      }).catch(error => {
        const message = errorMessage(error);
        setPendingTasks(current => current.map(task => task.id === taskId ? { ...task, error: message, status: 'failed' } : task));
        setStatus(message);
        window.alert(message);
      });
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const removeHistory = async (item: StudioImageItem) => {
    if (!confirm('删除这条记录？')) return;
    try {
      await deleteHistory(item.timestamp);
      setItems(current => current.filter(value => value !== item));
      if (selected === item) setSelected(null);
      setStatus('历史记录已删除');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const resetPreview = () => {
    previewDrag.current = null;
    setPreviewZoom(1); setPreviewPan({ x: 0, y: 0 }); setPreviewPanning(false);
  };

  const openItem = (item: StudioImageItem) => {
    if (bulkSelecting) {
      const key = String(item.timestamp);
      setBulkSelection(current => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
      return;
    }
    setLightboxResolution('...'); resetPreview();
    setLightboxItem(item); document.body.style.overflow = 'hidden';
  };
  const closeLightbox = () => { resetPreview(); setLightboxItem(null); document.body.style.overflow = ''; };

  const zoomPreview = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const imageX = (localX - previewPan.x) / previewZoom;
    const imageY = (localY - previewPan.y) / previewZoom;
    const nextZoom = Math.max(1, Math.min(6, previewZoom * (event.deltaY > 0 ? .9 : 1.1)));
    setPreviewZoom(nextZoom);
    setPreviewPan(nextZoom <= 1.001 ? { x: 0, y: 0 } : { x: localX - imageX * nextZoom, y: localY - imageY * nextZoom });
  };

  const beginPreviewPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || previewZoom <= 1.001 || (event.target as HTMLElement).closest('[data-no-pan],button,a,input,textarea')) return;
    previewDrag.current = { startX: event.clientX, startY: event.clientY, originX: previewPan.x, originY: previewPan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreviewPanning(true); event.preventDefault(); event.stopPropagation();
  };
  const movePreview = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = previewDrag.current;
    if (!drag) return;
    setPreviewPan({ x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY });
  };
  const endPreviewPan = () => { previewDrag.current = null; setPreviewPanning(false); };

  const applySameStyle = () => {
    if (!lightboxItem) return;
    setPrompt(lightboxItem.prompt || '');
    const params = lightboxItem.params && typeof lightboxItem.params === 'object' ? lightboxItem.params as Record<string, unknown> : {};
    const historyReferences = Array.isArray(params.reference_images)
      ? params.reference_images.filter((value): value is StudioReference => Boolean(value && typeof value === 'object')).slice(0, 4)
      : [];
    references.forEach(reference => { if (reference?.preview.startsWith('blob:')) URL.revokeObjectURL(reference.preview); });
    const restored = [0, 1, 2, 3].map(index => {
      const data = historyReferences[index];
      if (!data) return null;
      const preview = String(data.url || data.data_url || data.path || '');
      return preview ? { data, name: String(data.name || `reference-${index + 1}`), preview, width: 0, height: 0 } : null;
    });
    setReferences(restored);
    restored.forEach((reference, index) => {
      if (!reference) return;
      void imageDimensions(reference.preview).then(dimensions => setReferences(current => current.map((slot, slotIndex) => slotIndex === index && slot?.preview === reference.preview ? { ...slot, ...dimensions } : slot))).catch(() => undefined);
    });
    const size = typeof params.size === 'string' ? params.size : '1024x1024';
    const preset = Object.entries(SIZE_OPTIONS).flatMap(([ratioKey, resolutions]) => Object.entries(resolutions).map(([resolutionKey, dimensions]) => ({ ratioKey, resolutionKey, dimensions })))
      .find(value => `${value.dimensions[0]}x${value.dimensions[1]}` === size);
    if (preset) {
      setRatio(preset.ratioKey); setResolution(preset.resolutionKey);
      setCustomWidth(''); setCustomHeight('');
    } else {
      const match = size.match(/^(\d+)\s*[xX*]\s*(\d+)$/);
      setResolution('custom'); setRatio('');
      setCustomWidth(match?.[1] || ''); setCustomHeight(match?.[2] || '');
    }
    closeLightbox(); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const downloadLightboxImage = async () => {
    if (!lightboxImage) return;
    try {
      const response = await fetch(lightboxImage);
      if (!response.ok) throw new Error('下载失败');
      const blob = await response.blob();
      const clean = lightboxImage.split('?')[0];
      const extension = clean.includes('.') ? clean.split('.').pop() : 'png';
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob); anchor.download = `online-image-${Date.now()}.${extension || 'png'}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1_000);
    } catch (error) {
      window.alert(errorMessage(error));
    }
  };

  const enterBulk = () => { setBulkSelecting(true); setBulkSelection(new Set()); };
  const exitBulk = () => { setBulkSelecting(false); setBulkSelection(new Set()); };
  const toggleAllBulk = () => {
    const visibleKeys = visibleItems.map(item => String(item.timestamp));
    setBulkSelection(current => visibleKeys.length > 0 && visibleKeys.every(key => current.has(key)) ? new Set() : new Set(visibleKeys));
  };
  const deleteBulk = async () => {
    const timestamps = [...bulkSelection];
    if (!timestamps.length || !confirm(`确认删除选中的 ${timestamps.length} 张图片？此操作不可恢复。`)) return;
    setBulkDeleting(true);
    const results = await Promise.allSettled(timestamps.map(timestamp => deleteHistory(timestamp)));
    const deleted = new Set(timestamps.filter((_, index) => results[index]?.status === 'fulfilled'));
    const failed = results.length - deleted.size;
    setItems(current => current.filter(item => !deleted.has(String(item.timestamp))));
    setBulkSelection(current => new Set([...current].filter(timestamp => !deleted.has(timestamp))));
    if (selected && deleted.has(String(selected.timestamp))) setSelected(null);
    if (failed) window.alert(`${failed} / ${timestamps.length} ✗`);
    setBulkDeleting(false);
    if (!failed) exitBulk();
  };

  return <div className="online-studio container-box min-h-screen flex flex-col">
    <header className="flex justify-between items-end mb-16">
      <div className="space-y-1">
        <h1 className="text-4xl font-extrabold tracking-tighter italic">在线生图</h1>
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-gray-400">GPT / NANO BANANA IMAGE STUDIO</p>
      </div>
      <nav className="hidden md:flex gap-8 text-[11px] font-bold uppercase tracking-widest text-gray-400"><span className="text-black border-b-2 border-black pb-1">创建</span></nav>
    </header>

    <main className="grid grid-cols-1 lg:grid-cols-12 gap-12">
      <div className="lg:col-span-5 space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-gray-400"><Icon className="w-3.5 h-3.5" name="terminal" /><span className="text-[10px] font-black uppercase tracking-widest">Prompt</span></div>
          <textarea id="promptInput" rows={5} className="nano-input w-full p-6 rounded-3xl text-sm outline-none resize-none placeholder-gray-300" aria-label="提示词" placeholder="输入想生成或编辑的画面..." value={prompt} onChange={event => setPrompt(event.target.value)} />
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-gray-400"><Icon className="w-3.5 h-3.5" name="images" /><span className="text-[10px] font-black uppercase tracking-widest">参考图片</span></div>
          <div className="grid grid-cols-4 gap-4">
            {['Main', 'Aux A', 'Aux B', 'Aux C'].map((label, index) => {
              const slot = references[index];
              return <div id={`drop-zone-${index + 1}`} key={label} className={`upload-item group aspect-square rounded-2xl flex flex-col items-center justify-center cursor-pointer${draggingIndex === index ? ' drag-over' : ''}`} onClick={() => fileInputs.current[index]?.click()} onDragOver={event => { event.preventDefault(); setDraggingIndex(index); }} onDragLeave={() => setDraggingIndex(current => current === index ? null : current)} onDrop={event => { event.preventDefault(); setDraggingIndex(null); void selectReference(event.dataTransfer.files[0], index); }}>
                <input ref={element => { fileInputs.current[index] = element; }} type="file" id={`file${index + 1}`} accept="image/*" className="hidden" onChange={event => { void selectReference(event.target.files?.[0], index); event.target.value = ''; }} />
                <Icon className="w-5 h-5 text-gray-300 group-hover:text-black" name="plus" /><span className="text-[9px] mt-2 font-bold text-gray-400 uppercase">{label}</span>
                {slot && <><img id={`prev${index + 1}`} className="preview-img" src={slot.preview} alt={slot.name} /><button id={`del${index + 1}`} type="button" aria-label={`删除参考图 ${index + 1}`} className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full shadow-sm z-10" onClick={event => { event.stopPropagation(); clearReference(index); }}>×</button></>}
              </div>;
            })}
          </div>
        </section>

        <div className="tool-panel">
          <div className="control-label"><Icon className="w-3.5 h-3.5" name="sliders" /><span>模型</span><span id="providerModeBadge" className="mode-badge">{protocol}</span></div>
          <div className="size-row">
            <label className="size-field"><select id="providerSelect" aria-label="平台" className="size-select" value={providerId} onChange={event => setProviderId(event.target.value)}>{providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label>
            <label className="size-field"><select id="modelSelect" aria-label="模型" className="size-select" value={model} onChange={event => setModel(event.target.value)}>{models.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
          </div>
          <div id="adaptiveExtras" className="size-row online-adaptive-extras">
            {supportsQuality && <label id="qualityField" className="size-field"><select id="qualitySelect" aria-label="质量" className="size-select" value={quality} onChange={event => setQuality(event.target.value)}><option value="auto">自动</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>}
            <label id="countField" className="size-field"><select id="countSelect" aria-label="数量" className="size-select" value={count} onChange={event => setCount(Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option value={value} key={value}>×{value}</option>)}</select></label>
          </div>
          <div className="control-label mt-1"><Icon className="w-3.5 h-3.5" name="ruler" /><span>尺寸</span></div>
          <div className="size-row">
            <label id="resolutionField" className={`size-field${resolution === 'custom' ? ' custom' : ''}`}><select id="resolutionSelect" aria-label="分辨率" className="size-select" value={resolution} onChange={event => setResolutionValue(event.target.value)}><option value="1k">1K</option><option value="2k">2K</option><option value="4k">4K</option><option value="custom">自定义尺寸</option></select><span className="size-pair with-fit"><input id="sizeCustomWidth" aria-label="自定义宽度" className="size-custom" type="number" min="64" step="64" placeholder="宽度" value={customWidth} onChange={event => setCustomWidth(event.target.value)} /><input id="sizeCustomHeight" aria-label="自定义高度" className="size-custom" type="number" min="64" step="64" placeholder="高度" value={customHeight} onChange={event => setCustomHeight(event.target.value)} /><button id="fitImageSizeBtn" className="size-fit-btn" type="button" disabled={!references.some(slot => slot?.width && slot.height)} onClick={fitCustomSize}>适配图片</button></span></label>
            <label id="ratioField" className={`size-field${ratio === 'custom' ? ' custom' : ''}`}><select id="ratioSelect" aria-label="比例" className="size-select" disabled={resolution === 'custom'} value={ratio} onChange={event => setRatioValue(event.target.value)}><option value="">比例为空</option><option value="square">1:1 方图</option><option value="portrait">2:3 竖图</option><option value="landscape">3:2 横图</option><option value="portrait43">3:4 竖图</option><option value="landscape43">4:3 横图</option><option value="story">9:16 竖屏</option><option value="wide">16:9 宽屏</option><option value="custom">自定义比例</option></select><span className="size-pair"><input id="ratioCustomWidth" aria-label="自定义比例宽" className="size-custom" type="number" min="1" step="1" placeholder="宽" value={customRatioWidth} onChange={event => setCustomRatioWidth(event.target.value)} /><input id="ratioCustomHeight" aria-label="自定义比例高" className="size-custom" type="number" min="1" step="1" placeholder="高" value={customRatioHeight} onChange={event => setCustomRatioHeight(event.target.value)} /></span></label>
          </div>
        </div>

        <button id="genBtn" className="glass-btn w-full py-5 text-white rounded-3xl font-bold flex items-center justify-center gap-3 shadow-lg" type="button" disabled={creating} onClick={() => void generate()}><Icon className="w-4 h-4 text-yellow-400" name="zap" /><span className="tracking-[0.3em] text-[11px] uppercase">{creating ? '创建中' : '生成'}</span></button>
        <p className="online-status" role="status">{status}</p>
      </div>

      <div className="lg:col-span-7">
        <div id="resultBox" className="result-frame min-h-[500px] lg:h-full flex items-center justify-center relative overflow-hidden">
          {!currentImage && <div id="placeholder" className="text-center space-y-4 opacity-20"><Icon className="w-12 h-12 mx-auto stroke-[1px]" name="layout" /><p className="text-[10px] font-black tracking-[0.5em] uppercase">{pendingTasks.some(task => task.status !== 'failed') ? '图片生成中' : '画布就绪'}</p></div>}
          {currentImage && <><button className="online-result-open" type="button" onClick={() => selected && openItem({ ...selected, images: [currentImage] })}><img id="outputImg" className="w-full h-full object-contain p-8 cursor-zoom-in" src={currentImage} alt="生成结果" /></button><a id="downloadBtn" href={currentImage} download className="absolute top-8 right-8 w-12 h-12 bg-white/90 shadow-2xl rounded-2xl flex items-center justify-center hover:bg-black hover:text-white" aria-label="下载生成结果"><Icon className="w-4 h-4" name="download" /></a></>}
          {selected && selected.images.length > 1 && <div className="online-output-strip">{selected.images.map((image, index) => <button type="button" className={index === selectedImageIndex ? 'active' : ''} key={image} onClick={() => setSelectedImageIndex(index)}><img src={image} alt={`输出 ${index + 1}`} /></button>)}</div>}
        </div>
      </div>
    </main>

    <section className="mt-32">
      <div className="flex items-center gap-6 mb-12"><h2 className="text-[11px] font-black uppercase tracking-[0.5em]">归档</h2><div className="h-px flex-1 bg-gray-100" /></div>
      <div className="hbm-toolbar">
        {!bulkSelecting ? <button type="button" className="hbm-btn" onClick={enterBulk}>管理</button> : <><div className="hbm-spacer" /><span className="hbm-count">已选 {bulkSelection.size} 张</span><button type="button" className="hbm-btn" onClick={toggleAllBulk}>{visibleItems.length > 0 && visibleItems.every(item => bulkSelection.has(String(item.timestamp))) ? '取消全选' : '全选'}</button><button type="button" className="hbm-btn hbm-danger" disabled={!bulkSelection.size || bulkDeleting} onClick={() => void deleteBulk()}>{bulkDeleting ? '删除中…' : '删除所选'}</button><button type="button" className="hbm-btn hbm-primary" onClick={exitBulk}>完成</button></>}
      </div>
      <div id="masonry" className="masonry-grid">
        {pendingTasks.map(task => <article id={`pending-${task.id}`} className={`masonry-item relative online-task-card ${task.status === 'failed' ? 'failed' : 'pending'}`} key={task.id}>{task.status === 'failed' ? <div className="online-task-content"><Icon className="w-7 h-7 text-red-500 mb-4" name="alert" /><p className="online-task-label text-red-600">生成失败</p><p className="online-task-error">{task.error}</p><p className="online-task-prompt">{task.prompt}</p></div> : <div className="online-task-content"><div className="online-task-spinner" /><p data-task-status className="online-task-label">{task.status === 'queued' ? '排队中' : '生成中'}</p><p className="online-task-prompt">{task.prompt}</p></div>}</article>)}
        {visibleItems.map(item => {
          const selectedInBulk = bulkSelection.has(String(item.timestamp));
          return <article id={`history-${item.timestamp}`} data-history-ts={item.timestamp} className={`masonry-item group relative cursor-zoom-in${selectedInBulk ? ' hbm-selected' : ''}`} key={String(item.timestamp)}>
            <button className="history-open" type="button" onClick={() => openItem(item)}><img src={item.images[0]} className="w-full h-full object-cover block group-hover:scale-105 transition-transform duration-1000" loading="lazy" alt={item.prompt || '在线生图'} />{item.images.length > 1 && <span className="online-multi-count">×{item.images.length}</span>}<span className="online-history-caption">{item.prompt || '在线生图'}</span></button>
          </article>;
        })}
      </div>
      {visibleCount < items.length && <button ref={loadMoreRef} id="loadMoreTrigger" type="button" className="py-20 text-center text-gray-300 text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:text-black" onClick={() => setVisibleCount(current => Math.min(items.length, current + PAGE_SIZE))}>Load More Archive</button>}
    </section>

    {lightboxItem && lightboxImage && <div id="lightbox" className="fixed inset-0 z-50 gallery-lightbox flex flex-col items-center justify-center p-8" role="dialog" aria-modal="true" aria-label="图片预览" onMouseDown={event => { if (event.target === event.currentTarget) closeLightbox(); }}>
      <button type="button" aria-label="关闭预览" className="absolute top-10 right-10 text-gray-400 hover:text-black" onClick={closeLightbox}><Icon className="w-8 h-8" name="x" /></button>
      <div className="w-full flex flex-col items-center pointer-events-none online-lightbox-content">
        <div id="lightboxFrame" className={`studio-preview-frame pointer-events-auto${previewPanning ? ' panning' : ''}`} onWheel={zoomPreview} onPointerDown={beginPreviewPan} onPointerMove={movePreview} onPointerUp={endPreviewPan} onPointerCancel={endPreviewPan} onDoubleClick={event => { if (previewZoom > 1.001) { event.preventDefault(); event.stopPropagation(); resetPreview(); } }}><img id="lightboxImg" className="studio-preview-img" src={lightboxImage} alt="preview" draggable="false" style={{ transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`, transformOrigin: '0 0' }} onLoad={event => { const image = event.currentTarget; setLightboxResolution(image.naturalWidth && image.naturalHeight ? `${image.naturalWidth} x ${image.naturalHeight}` : String((lightboxItem.params as Record<string, unknown> | undefined)?.size || '--')); }} /><div data-no-pan className="online-lightbox-resolution"><span id="lightboxRes">{lightboxResolution}</span></div><button id="lightboxDownload" type="button" data-no-pan className="online-lightbox-download" aria-label="下载预览图片" onClick={() => void downloadLightboxImage()}><Icon className="w-5 h-5" name="download" /></button></div>
        <div id="lightboxCard" className="w-full mt-16 pointer-events-auto bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm flex justify-between items-center gap-8"><div className="flex-1"><span className="text-[9px] font-black text-gray-300 uppercase tracking-widest block mb-2">Prompt</span><p id="lightboxPrompt" className="text-gray-700 text-sm leading-relaxed max-h-32 overflow-y-auto pr-2">{lightboxItem.prompt || ''}</p></div><button id="sameStyleBtn" type="button" className="bg-black text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2" onClick={applySameStyle}><Icon className="w-4 h-4" name="copy" /><span>复用</span></button></div>
      </div>
    </div>}
  </div>;
}
