import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeStudioEvents } from '../../shared/studio-events';
import { deleteHistory, generateOnline, loadHistory, loadProviders, uploadReference } from './client';
import type { StudioImageItem, StudioProvider, StudioReference } from './types';

interface ReferenceSlot {
  data: StudioReference;
  name: string;
  preview: string;
}

type IconName = 'copy' | 'download' | 'images' | 'layout' | 'plus' | 'ruler' | 'sliders' | 'terminal' | 'x' | 'zap';

const SIZE_OPTIONS: Record<string, Record<string, [number, number]>> = {
  square: { '1k': [1024, 1024], '2k': [2048, 2048], '4k': [3840, 2160] },
  portrait: { '1k': [1024, 1536], '2k': [1360, 2048], '4k': [2352, 3520] },
  landscape: { '1k': [1536, 1024], '2k': [2048, 1360], '4k': [3520, 2352] },
  portrait43: { '1k': [1008, 1344], '2k': [1536, 2048], '4k': [2448, 3264] },
  landscape43: { '1k': [1344, 1008], '2k': [2048, 1536], '4k': [3264, 2448] },
  story: { '1k': [720, 1280], '2k': [1152, 2048], '4k': [2160, 3840] },
  wide: { '1k': [1280, 720], '2k': [2048, 1152], '4k': [3840, 2160] },
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
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
  const [references, setReferences] = useState<Array<ReferenceSlot | null>>([null, null, null, null]);
  const [items, setItems] = useState<StudioImageItem[]>([]);
  const [selected, setSelected] = useState<StudioImageItem | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [lightboxItem, setLightboxItem] = useState<StudioImageItem | null>(null);
  const [status, setStatus] = useState('正在加载归档…');
  const [busy, setBusy] = useState(false);
  const fileInputs = useRef<Array<HTMLInputElement | null>>([]);

  const refreshProviders = async () => {
    const next = await loadProviders();
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

  const [width, height] = SIZE_OPTIONS[ratio]?.[resolution] ?? SIZE_OPTIONS.square['1k'];
  const currentImage = selected?.images[selectedImageIndex] ?? selected?.images[0];
  const lightboxImage = lightboxItem?.images[0];

  const selectReference = async (file: File | undefined, index: number) => {
    if (!file || !file.type.startsWith('image/')) return;
    const preview = URL.createObjectURL(file);
    setStatus('正在上传参考图…');
    try {
      const data = await uploadReference(file);
      setReferences(current => current.map((slot, slotIndex) => {
        if (slotIndex !== index) return slot;
        if (slot) URL.revokeObjectURL(slot.preview);
        return { data, name: file.name, preview };
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

  const generate = async () => {
    const value = prompt.trim();
    if (!value) { setStatus('请输入提示词'); return; }
    if (!providerId || !model) { setStatus('请先在 API 设置中配置可用的图片模型'); return; }
    setBusy(true); setStatus('正在创建生成任务…');
    try {
      const result = await generateOnline({
        prompt: value,
        mode: 'online',
        providerId,
        model,
        width,
        height,
        quality,
        count,
        references: references.flatMap(slot => slot ? [slot.data] : []),
        extras: {},
      }, setStatus);
      setItems(current => [result, ...current.filter(item => String(item.timestamp) !== String(result.timestamp))]);
      setSelected(result); setSelectedImageIndex(0); setStatus(`生成完成，共 ${result.images.length} 张`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
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

  const openItem = (item: StudioImageItem) => { setLightboxItem(item); document.body.style.overflow = 'hidden'; };
  const closeLightbox = () => { setLightboxItem(null); document.body.style.overflow = ''; };

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
              return <div id={`drop-zone-${index + 1}`} key={label} className="upload-item group aspect-square rounded-2xl flex flex-col items-center justify-center cursor-pointer" onClick={() => fileInputs.current[index]?.click()}>
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
            <label id="resolutionField" className="size-field"><select id="resolutionSelect" aria-label="分辨率" className="size-select" value={resolution} onChange={event => setResolution(event.target.value)}><option value="1k">1K</option><option value="2k">2K</option><option value="4k">4K</option></select></label>
            <label id="ratioField" className="size-field"><select id="ratioSelect" aria-label="比例" className="size-select" value={ratio} onChange={event => setRatio(event.target.value)}><option value="square">1:1 方图</option><option value="portrait">2:3 竖图</option><option value="landscape">3:2 横图</option><option value="portrait43">3:4 竖图</option><option value="landscape43">4:3 横图</option><option value="story">9:16 竖屏</option><option value="wide">16:9 宽屏</option></select></label>
          </div>
        </div>

        <button id="genBtn" className="glass-btn w-full py-5 text-white rounded-3xl font-bold flex items-center justify-center gap-3 shadow-lg" type="button" disabled={busy} onClick={() => void generate()}><Icon className="w-4 h-4 text-yellow-400" name="zap" /><span className="tracking-[0.3em] text-[11px] uppercase">{busy ? '生成中' : '生成'}</span></button>
        <p className="online-status" role="status">{status}</p>
      </div>

      <div className="lg:col-span-7">
        <div id="resultBox" className="result-frame min-h-[500px] lg:h-full flex items-center justify-center relative overflow-hidden">
          {!currentImage && <div id="placeholder" className="text-center space-y-4 opacity-20"><Icon className="w-12 h-12 mx-auto stroke-[1px]" name="layout" /><p className="text-[10px] font-black tracking-[0.5em] uppercase">{busy ? '图片生成中' : '画布就绪'}</p></div>}
          {currentImage && <><button className="online-result-open" type="button" onClick={() => selected && openItem({ ...selected, images: [currentImage] })}><img id="outputImg" className="w-full h-full object-contain p-8 cursor-zoom-in" src={currentImage} alt="生成结果" /></button><a id="downloadBtn" href={currentImage} download className="absolute top-8 right-8 w-12 h-12 bg-white/90 shadow-2xl rounded-2xl flex items-center justify-center hover:bg-black hover:text-white" aria-label="下载生成结果"><Icon className="w-4 h-4" name="download" /></a></>}
          {selected && selected.images.length > 1 && <div className="online-output-strip">{selected.images.map((image, index) => <button type="button" className={index === selectedImageIndex ? 'active' : ''} key={image} onClick={() => setSelectedImageIndex(index)}><img src={image} alt={`输出 ${index + 1}`} /></button>)}</div>}
        </div>
      </div>
    </main>

    <section className="mt-32">
      <div className="flex items-center gap-6 mb-12"><h2 className="text-[11px] font-black uppercase tracking-[0.5em]">归档</h2><div className="h-px flex-1 bg-gray-100" /></div>
      <div id="masonry" className="masonry-grid">{items.map(item => <article id={`history-${item.timestamp}`} data-history-ts={item.timestamp} className="masonry-item group relative cursor-zoom-in" key={String(item.timestamp)}>
        <button className="history-open" type="button" onClick={() => openItem(item)}><img src={item.images[0]} className="w-full h-full object-cover block group-hover:scale-105 transition-transform duration-1000" loading="lazy" alt={item.prompt || '在线生图'} />{item.images.length > 1 && <span className="online-multi-count">×{item.images.length}</span>}<span className="online-history-caption">{item.prompt || '在线生图'}</span></button>
        <button className="history-delete" type="button" aria-label="删除历史记录" onClick={event => { event.stopPropagation(); void removeHistory(item); }}>×</button>
      </article>)}</div>
      <button id="loadMoreTrigger" type="button" className="py-20 text-center text-gray-300 text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:text-black">Load More Archive</button>
    </section>

    {lightboxItem && lightboxImage && <div id="lightbox" className="fixed inset-0 z-50 gallery-lightbox flex flex-col items-center justify-center p-8" role="dialog" aria-modal="true" aria-label="图片预览" onMouseDown={event => { if (event.target === event.currentTarget) closeLightbox(); }}>
      <button type="button" aria-label="关闭预览" className="absolute top-10 right-10 text-gray-400 hover:text-black" onClick={closeLightbox}><Icon className="w-8 h-8" name="x" /></button>
      <div className="w-full flex flex-col items-center pointer-events-none online-lightbox-content">
        <div id="lightboxFrame" className="studio-preview-frame pointer-events-auto"><img id="lightboxImg" className="studio-preview-img" src={lightboxImage} alt="preview" /><div data-no-pan className="online-lightbox-resolution"><span id="lightboxRes">图片预览</span></div><a id="lightboxDownload" href={lightboxImage} download data-no-pan className="online-lightbox-download" aria-label="下载预览图片"><Icon className="w-5 h-5" name="download" /></a></div>
        <div id="lightboxCard" className="w-full mt-16 pointer-events-auto bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm flex justify-between items-center gap-8"><div className="flex-1"><span className="text-[9px] font-black text-gray-300 uppercase tracking-widest block mb-2">Prompt</span><p id="lightboxPrompt" className="text-gray-700 text-sm leading-relaxed max-h-32 overflow-y-auto pr-2">{lightboxItem.prompt || ''}</p></div><button id="sameStyleBtn" type="button" className="bg-black text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2" onClick={() => { setPrompt(lightboxItem.prompt || ''); closeLightbox(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Icon className="w-4 h-4" name="copy" /><span>复用</span></button></div>
      </div>
    </div>}
  </div>;
}
