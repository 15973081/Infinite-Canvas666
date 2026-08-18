import { useEffect, useMemo, useState } from 'react';
import type { CanvasRuntime, RuntimeOption } from '../../canvas/application/modern-canvas-runtime';

type SmartEngine = 'comfy' | 'generator' | 'msgen' | 'video';

interface SmartComposerSettings {
  comfyWorkflow: string;
  count: number;
  duration: number;
  engine: SmartEngine;
  model: string;
  msCustomModel: string;
  msgenModel: string;
  provider: string;
  ratio: string;
  resolution: string;
}

interface SmartComposerMedia {
  kind: string;
  name: string;
  url: string;
}

const storageKey = 'smart_canvas_v2_composer';
const defaults: SmartComposerSettings = {
  comfyWorkflow: '', count: 1, duration: 5, engine: 'generator', model: '', msCustomModel: 'Tongyi-MAI/Z-Image-Turbo',
  msgenModel: 'zimage', provider: '', ratio: 'square', resolution: '1k',
};

const engineLabels: Record<SmartEngine, string> = {
  comfy: 'ComfyUI', generator: 'API 图片', msgen: 'ModelScope', video: 'API 视频',
};

export function SmartCanvasComposer({ runtime }: { runtime: CanvasRuntime }) {
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState<SmartComposerSettings>(readSettings);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [references, setReferences] = useState<SmartComposerMedia[]>([]);
  const type = settings.engine;
  const providerOptions = useMemo(() => runtime.getNodeOptions(type, 'provider'), [runtime, type]);
  const modelOptions = useMemo(() => runtime.getNodeOptions(type, 'model', {
    id: 'smart-composer', type, apiProvider: settings.provider,
  }), [runtime, settings.provider, type]);
  const msModelOptions = useMemo(() => runtime.getNodeOptions('msgen', 'model'), [runtime]);
  const workflowOptions = useMemo(() => runtime.getNodeOptions('comfy', 'workflow'), [runtime]);

  useEffect(() => {
    setSettings((current) => {
      if (!['generator', 'video'].includes(current.engine)) return current;
      const provider = optionValue(providerOptions, current.provider);
      const models = runtime.getNodeOptions(current.engine, 'model', { id: 'smart-composer', type: current.engine, apiProvider: provider });
      const model = optionValue(models, current.model);
      return provider === current.provider && model === current.model ? current : { ...current, provider, model };
    });
  }, [providerOptions, runtime, type]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);

  const update = (patch: Partial<SmartComposerSettings>) => setSettings((current) => ({ ...current, ...patch }));
  const create = async (run: boolean) => {
    const text = prompt.trim();
    if (!text) { setStatus('请先输入提示词'); return; }
    const validation = validateSettings(settings);
    if (validation) { setStatus(validation); return; }
    if (!window.CanvasBoardV2) { setStatus('画布仍在初始化，请稍后重试'); return; }
    setBusy(true);
    setStatus('正在创建智能工作流…');
    try {
      const flow = smartComposerWorkflow(text, settings, references);
      const ids = window.CanvasBoardV2.importWorkflow(flow);
      const generatorId = ids[1];
      if (!generatorId) throw new Error('未能创建生成节点');
      setPrompt('');
      setReferences([]);
      if (run) {
        setStatus('工作流已创建，正在生成…');
        await window.CanvasBoardV2.runNode(generatorId);
        setStatus('生成完成，结果已写入 Output');
      } else {
        setStatus('工作流已创建，可继续连接素材或调整参数');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const uploadReferences = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setStatus('正在上传参考媒体…');
    try {
      const uploaded = await runtime.uploadMedia(files);
      const items = (uploaded.files || []).flatMap((file) => file.url ? [{
        kind: String(file.kind || mediaKind(String(file.url))), name: String(file.name || '参考媒体'), url: String(file.url),
      }] : []);
      setReferences((current) => dedupeReferences([...current, ...items]).slice(0, 8));
      setStatus(items.length ? `已添加 ${items.length} 个参考媒体` : '没有上传成功的媒体');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return <section className="smart-canvas-composer" data-testid="smart-canvas-composer">
    <div className="smart-composer-main">
      <textarea aria-label="智能画布提示词" disabled={busy} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void create(true); }
      }} placeholder="描述你想生成的内容，Ctrl/⌘ + Enter 直接生成" value={prompt} />
      <div className="smart-composer-actions">
        <button disabled={busy} onClick={() => window.openCanvasPromptLibrary?.({ initialText: prompt, onApply: setPrompt })} type="button">提示词库</button>
        <label className="tool-btn smart-composer-upload">添加参考<input accept="image/*,video/*,audio/*" disabled={busy} hidden multiple onChange={(event) => {
          void uploadReferences([...(event.target.files || [])]); event.target.value = '';
        }} type="file" /></label>
        <button disabled={busy} onClick={() => void create(false)} type="button">仅创建工作流</button>
        <button className="primary-btn" disabled={busy} onClick={() => void create(true)} type="button">{busy ? '处理中…' : '创建并生成'}</button>
      </div>
    </div>
    {references.length ? <div className="smart-composer-references">{references.map((item) => <span key={item.url} title={item.url}>{item.kind === 'video' ? '视频' : item.kind === 'audio' ? '音频' : '图片'} · {item.name}<button aria-label={`移除参考 ${item.name}`} disabled={busy} onClick={() => setReferences((current) => current.filter((candidate) => candidate.url !== item.url))} type="button">×</button></span>)}</div> : null}
    <div className="smart-composer-settings">
      <label>模式<select aria-label="智能生成模式" disabled={busy} onChange={(event) => update({ engine: event.target.value as SmartEngine, model: '', provider: '' })} value={settings.engine}>
        {(Object.keys(engineLabels) as SmartEngine[]).map((engine) => <option key={engine} value={engine}>{engineLabels[engine]}</option>)}
      </select></label>
      {['generator', 'video'].includes(settings.engine) ? <>
        <OptionSelect label="平台" onChange={(provider) => update({ provider, model: '' })} options={providerOptions} value={settings.provider} />
        <OptionSelect label="模型" onChange={(model) => update({ model })} options={modelOptions} value={settings.model} />
      </> : null}
      {settings.engine === 'msgen' ? <>
        <OptionSelect label="模型" onChange={(msgenModel) => update({ msgenModel })} options={msModelOptions} value={settings.msgenModel} />
        {settings.msgenModel === 'custom' ? <label>模型 ID<input aria-label="ModelScope 模型 ID" onChange={(event) => update({ msCustomModel: event.target.value })} value={settings.msCustomModel} /></label> : null}
      </> : null}
      {settings.engine === 'comfy' ? <OptionSelect label="工作流" onChange={(comfyWorkflow) => update({ comfyWorkflow })} options={[{ label: '默认文生图', value: '' }, ...workflowOptions]} value={settings.comfyWorkflow} /> : null}
      {settings.engine !== 'video' ? <>
        <label>比例<select aria-label="智能生成比例" onChange={(event) => update({ ratio: event.target.value })} value={settings.ratio}><option value="square">1:1</option><option value="portrait">2:3</option><option value="landscape">3:2</option><option value="story">9:16</option><option value="wide">16:9</option></select></label>
        <label>清晰度<select aria-label="智能生成清晰度" onChange={(event) => update({ resolution: event.target.value })} value={settings.resolution}><option value="1k">1K</option><option value="2k">2K</option><option value="4k">4K</option></select></label>
        <label>数量<input aria-label="智能生成数量" max="8" min="1" onChange={(event) => update({ count: Math.max(1, Math.min(8, Number(event.target.value) || 1)) })} type="number" value={settings.count} /></label>
      </> : <label>时长<input aria-label="智能视频时长" max="60" min="1" onChange={(event) => update({ duration: Math.max(1, Math.min(60, Number(event.target.value) || 5)) })} type="number" value={settings.duration} /></label>}
    </div>
    {status ? <div className="smart-composer-status" role="status">{status}</div> : null}
  </section>;
}

function OptionSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: RuntimeOption[]; value: string }) {
  return <label>{label}<select aria-label={`智能生成${label}`} onChange={(event) => onChange(event.target.value)} value={value}>{options.length
    ? options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)
    : <option value="">暂无可用项</option>}</select></label>;
}

export function smartComposerWorkflow(prompt: string, settings: SmartComposerSettings, references: SmartComposerMedia[] = []) {
  const generator = generatorSettings(settings);
  return {
    connections: [
      { from: 'smart_prompt', to: 'smart_generator' },
      ...references.map((_, index) => ({ from: `smart_reference_${index}`, to: 'smart_generator' })),
      { from: 'smart_generator', to: 'smart_output' },
    ],
    nodes: [
      { id: 'smart_prompt', type: 'prompt', x: 0, y: 0, text: prompt },
      { id: 'smart_generator', type: settings.engine, x: 380, y: 0, ...generator },
      { id: 'smart_output', type: 'output', x: 860, y: 0, images: [], imageComparisons: {} },
      ...references.map((item, index) => ({ id: `smart_reference_${index}`, type: 'image', x: 0, y: 140 + index * 120, mediaKind: item.kind, name: item.name, url: item.url })),
    ],
  };
}

function generatorSettings(settings: SmartComposerSettings): Record<string, unknown> {
  if (settings.engine === 'generator') return { apiProvider: settings.provider, model: settings.model, ratio: settings.ratio, resolution: settings.resolution, quality: 'auto', count: settings.count, smartComposer: true };
  if (settings.engine === 'video') return { apiProvider: settings.provider, model: settings.model, duration: settings.duration, aspectRatio: settings.ratio === 'story' ? '9:16' : settings.ratio === 'square' ? '1:1' : '16:9', resolution: '', smartComposer: true };
  if (settings.engine === 'msgen') return { msgenModel: settings.msgenModel, msCustomModel: settings.msCustomModel, msRatio: settings.ratio, msResolution: settings.resolution, count: settings.count, smartComposer: true };
  return { mode: settings.comfyWorkflow ? 'custom' : 'text', comfyWorkflow: settings.comfyWorkflow, width: resolutionPixels(settings.resolution), height: resolutionPixels(settings.resolution), count: settings.count, smartComposer: true };
}

function validateSettings(settings: SmartComposerSettings): string {
  if (['generator', 'video'].includes(settings.engine) && (!settings.provider || !settings.model)) return '当前模式没有可用的平台或模型，请先检查 API 设置';
  if (settings.engine === 'msgen' && settings.msgenModel === 'custom' && !settings.msCustomModel.trim()) return '请输入 ModelScope 模型 ID';
  return '';
}

function optionValue(options: RuntimeOption[], current: string): string {
  return options.some((option) => option.value === current) ? current : options[0]?.value || '';
}

function resolutionPixels(resolution: string): number {
  return resolution === '4k' ? 4096 : resolution === '2k' ? 2048 : 1024;
}

function readSettings(): SmartComposerSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}') as Partial<SmartComposerSettings>;
    const engine = ['comfy', 'generator', 'msgen', 'video'].includes(String(saved.engine)) ? saved.engine as SmartEngine : defaults.engine;
    return { ...defaults, ...saved, engine, count: Math.max(1, Math.min(8, Number(saved.count) || 1)), duration: Math.max(1, Math.min(60, Number(saved.duration) || 5)) };
  } catch {
    return { ...defaults };
  }
}

function dedupeReferences(items: SmartComposerMedia[]): SmartComposerMedia[] {
  return [...new Map(items.filter((item) => item.url).map((item) => [item.url, item])).values()];
}

function mediaKind(url: string): string {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  if (/\.(mp3|wav|m4a|ogg)(\?|$)/i.test(url)) return 'audio';
  return 'image';
}
