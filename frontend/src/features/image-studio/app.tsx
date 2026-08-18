import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, StudioPage } from '../../shared/page-root';
import { subscribeStudioEvents } from '../../shared/studio-events';
import { boundedDimension } from './domain';
import { deleteHistory, loadHistory, uploadReference } from './client';
import type { ImageStudioAdapter, StudioImageItem, StudioProvider, StudioReference } from './types';

interface ReferenceState { data: StudioReference; preview: string; name: string }
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败';

export function ImageStudioApp({ adapter }: { adapter: ImageStudioAdapter }) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState(adapter.defaultMode);
  const [providers, setProviders] = useState<StudioProvider[]>([]);
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [quality, setQuality] = useState('auto');
  const [count, setCount] = useState(1);
  const [references, setReferences] = useState<ReferenceState[]>([]);
  const [items, setItems] = useState<StudioImageItem[]>([]);
  const [selected, setSelected] = useState<StudioImageItem | null>(null);
  const [status, setStatus] = useState('正在加载历史记录…');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshProviders = async () => {
    if (!adapter.loadProviders) return;
    const next = await adapter.loadProviders(); setProviders(next);
    setProviderId(current => next.some(provider => provider.id === current) ? current : next[0]?.id ?? '');
  };
  useEffect(() => {
    Promise.all([loadHistory(adapter.historyType), refreshProviders()])
      .then(async ([history]) => {
        const recovered = await adapter.resume?.(setStatus);
        setItems(recovered ? [recovered, ...history.filter(item => String(item.timestamp) !== String(recovered.timestamp))] : history);
        if (recovered) setSelected(recovered);
        setStatus(recovered ? '未完成任务已恢复' : '已就绪');
      })
      .catch(error => setStatus(errorMessage(error)));
    const unsubscribe = subscribeStudioEvents(type => { if (type === 'providers-changed') void refreshProviders(); });
    const visible = () => { if (!document.hidden) void refreshProviders(); };
    document.addEventListener('visibilitychange', visible);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', visible); };
  }, [adapter]);

  useEffect(() => { localStorage.setItem(`${adapter.id}_engine`, mode); }, [adapter.id, mode]);

  const activeProvider = providers.find(provider => provider.id === providerId);
  const models = activeProvider?.image_models ?? [];
  useEffect(() => { if (!models.includes(model)) setModel(models[0] ?? ''); }, [providerId, models.join('|')]);

  const uploadFiles = async (files: FileList | File[]) => {
    const available = Math.max(0, adapter.maxReferences - references.length);
    const selectedFiles = [...files].filter(file => file.type.startsWith('image/')).slice(0, available);
    if (!selectedFiles.length) return;
    setStatus('正在上传参考图…');
    try {
      const uploaded = await Promise.all(selectedFiles.map(async file => ({ data: await uploadReference(file), preview: URL.createObjectURL(file), name: file.name })));
      setReferences(current => [...current, ...uploaded]); setStatus('参考图已上传');
    } catch (error) { setStatus(errorMessage(error)); }
  };

  const removeReference = (index: number) => setReferences(current => {
    const target = current[index]; if (target) URL.revokeObjectURL(target.preview);
    return current.filter((_, itemIndex) => itemIndex !== index);
  });

  const generate = async () => {
    const value = prompt.trim(); if (!value) { setStatus('请输入提示词'); return; }
    if (adapter.supportsProviders && (!providerId || !model)) { setStatus('请先在 API 设置中配置可用的图片模型'); return; }
    setBusy(true); setStatus('正在创建生成任务…');
    try {
      const result = await adapter.generate({
        prompt: value, mode, providerId, model, width: boundedDimension(width), height: boundedDimension(height), quality, count,
        references: references.map(reference => reference.data),
      }, setStatus);
      setItems(current => [result, ...current.filter(item => String(item.timestamp) !== String(result.timestamp))]);
      setSelected(result); setStatus(`生成完成，共 ${result.images.length} 张`);
    } catch (error) { setStatus(errorMessage(error)); } finally { setBusy(false); }
  };

  const removeHistory = async (item: StudioImageItem) => {
    if (!confirm('删除这条生成记录和本地输出文件？')) return;
    try { await deleteHistory(item.timestamp); setItems(current => current.filter(value => value !== item)); if (selected === item) setSelected(null); setStatus('历史记录已删除'); }
    catch (error) { setStatus(errorMessage(error)); }
  };

  const currentImage = selected?.images[0];
  const providerControls = useMemo(() => adapter.supportsProviders && <>
    <label className="studio-label">平台<select className="studio-input" aria-label="平台" value={providerId} onChange={event => setProviderId(event.target.value)}>{providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label>
    <label className="studio-label">模型<select className="studio-input" aria-label="模型" value={model} onChange={event => setModel(event.target.value)}>{models.map(value => <option key={value}>{value}</option>)}</select></label>
  </>, [adapter.supportsProviders, providerId, model, providers, models]);

  return <StudioPage title={adapter.title} subtitle={adapter.subtitle} status={status}>
    <div className="image-studio-layout">
      <aside className="studio-card image-studio-controls">
        {adapter.modes.length > 1 && <div className="studio-tabs">{adapter.modes.map(item => <button type="button" key={item.id} className={mode === item.id ? 'active' : ''} onClick={() => setMode(item.id)}>{item.label}</button>)}</div>}
        {adapter.maxReferences > 0 && <div><div className="image-studio-section-title">参考图片 · 最多 {adapter.maxReferences} 张</div><div className="reference-grid">{references.map((reference, index) => <div className="reference-card" key={`${reference.name}-${index}`}><img src={reference.preview} alt={reference.name} /><button type="button" aria-label={`删除参考图 ${index + 1}`} onClick={() => removeReference(index)}>×</button></div>)}{references.length < adapter.maxReferences && <button type="button" className="reference-add" onClick={() => fileRef.current?.click()}>＋<span>添加图片</span></button>}</div><input hidden multiple ref={fileRef} type="file" accept="image/*" onChange={event => { if (event.target.files) void uploadFiles(event.target.files); event.target.value = ''; }} /></div>}
        <label className="studio-label">提示词<textarea className="studio-input" aria-label="提示词" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="描述希望生成的画面、风格和细节…" /></label>
        {providerControls}
        <div className="dimension-grid"><label className="studio-label">宽度<input className="studio-input" aria-label="宽度" type="number" min="64" max="8192" step="16" value={width} onChange={event => setWidth(Number(event.target.value))} /></label><label className="studio-label">高度<input className="studio-input" aria-label="高度" type="number" min="64" max="8192" step="16" value={height} onChange={event => setHeight(Number(event.target.value))} /></label></div>
        {(adapter.supportsQuality || adapter.supportsCount) && <div className="dimension-grid">{adapter.supportsQuality && <label className="studio-label">质量<select className="studio-input" aria-label="质量" value={quality} onChange={event => setQuality(event.target.value)}><option value="auto">自动</option><option value="low">快速</option><option value="medium">标准</option><option value="high">高质量</option></select></label>}{adapter.supportsCount && <label className="studio-label">数量<select className="studio-input" aria-label="数量" value={count} onChange={event => setCount(Number(event.target.value))}>{[1,2,3,4].map(value => <option key={value}>{value}</option>)}</select></label>}</div>}
        <button className="studio-button primary image-generate" type="button" disabled={busy} onClick={generate}>{busy ? '生成中…' : mode === 'cloud' ? '云端生成' : '开始生成'}</button>
      </aside>
      <main className="image-studio-main">
        <section className="studio-card image-output">{currentImage ? <>{selected.images.length > 1 && <div className="image-output-strip">{selected.images.map(image => <button type="button" key={image} onClick={() => setSelected({ ...selected, images: [image, ...selected.images.filter(value => value !== image)] })}><img src={image} alt="输出缩略图" /></button>)}</div>}<img className="image-output-main" src={currentImage} alt="生成结果" /><div className="image-output-actions"><a className="studio-button primary" href={`/api/download-output?url=${encodeURIComponent(currentImage)}`} download>下载</a><button className="studio-button" type="button" onClick={() => setPrompt(selected.prompt)}>复用提示词</button></div></> : <EmptyState title={busy ? '图片生成中' : '等待生成'}>结果会显示在这里，并自动加入下方历史记录。</EmptyState>}</section>
        <section><div className="image-history-title"><h2>生成历史</h2><span>{items.length} 条</span></div>{items.length ? <div className="image-history-grid">{items.map(item => <article className="history-card" key={String(item.timestamp)}><button type="button" className="history-open" onClick={() => setSelected(item)}><img src={item.images[0]} alt={item.prompt || '历史图片'} /><span>{item.prompt || '未命名生成'}</span></button><button type="button" className="history-delete" aria-label="删除历史记录" onClick={() => void removeHistory(item)}>×</button></article>)}</div> : <EmptyState title="暂无历史记录" />}</section>
      </main>
    </div>
  </StudioPage>;
}
