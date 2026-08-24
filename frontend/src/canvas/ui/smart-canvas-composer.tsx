import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { CanvasRuntime, RuntimeOption } from '../application/modern-canvas-runtime';
import type { CanvasDocument, CanvasNode } from '../domain/types';
import { SmartCanvasMentionPicker, snapshotPrompt, type SmartCanvasPromptSnapshot } from './smart-canvas-mention-picker';
import { movedReferenceOrder, promptHtmlWithMentionTokens, promptReferencesFor, smartCanvasComposerReferences, smartCanvasMentionCandidates, smartCanvasReferenceKey } from './smart-canvas-mention-picker-state';

type ComposerEngine = 'api' | 'comfy' | 'modelscope' | 'volcengine';
type ComposerKind = 'image' | 'video';
type ComfyField = { default?: unknown; id?: string; max?: number; min?: number; name?: string; options?: string[]; step?: number; type?: string };

interface SmartCanvasComposerProps {
  canvasRuntime: CanvasRuntime;
  document: CanvasDocument | null;
  generator: CanvasNode | null;
  onPatchGenerator(patch: Record<string, unknown>, type?: 'comfy' | 'generator' | 'msgen' | 'video'): string;
  onPatchOutput(patch: Record<string, unknown>, save?: boolean): void;
  onRun(mode: 'cascade' | 'node'): void;
  output: CanvasNode | null;
  readOnly: boolean;
}

const imageResolutions = [['1k', '1K'], ['2k', '2K'], ['4k', '4K'], ['custom', '自定义']] as const;
const imageRatios = [['square', '1:1'], ['portrait', '2:3'], ['landscape', '3:2'], ['portrait43', '3:4'], ['landscape43', '4:3'], ['story', '9:16'], ['wide', '16:9'], ['ultrawide', '21:9'], ['tall', '9:21'], ['source', '自适应'], ['custom', '自定义']] as const;

export function SmartCanvasComposer({ canvasRuntime, document, generator, onPatchGenerator, onPatchOutput, onRun, output, readOnly }: SmartCanvasComposerProps) {
  const [engine, setEngine] = useState<ComposerEngine>(() => engineFor(generator));
  const [kind, setKind] = useState<ComposerKind>(() => generator?.type === 'video' ? 'video' : 'image');
  const [prompt, setPrompt] = useState(() => promptFor(output));
  const [promptHeight, setPromptHeight] = useState(() => promptHeightFor(output));
  const [comfyFields, setComfyFields] = useState<ComfyField[]>([]);
  const [draggedReference, setDraggedReference] = useState(-1);
  const [dropReference, setDropReference] = useState<{ index: number; placement: 'after' | 'before' } | null>(null);
  const promptInputRef = useRef<HTMLDivElement>(null);
  const activeGenerator = generator ?? virtualGenerator(engine, kind);
  const mentionCandidates = useMemo(() => smartCanvasMentionCandidates(document, output, generator), [document, generator, output]);
  const references = useMemo(() => smartCanvasComposerReferences(document, output, generator), [document, generator, output]);
  const blockedReferences = useMemo(() => new Set(Array.isArray(output?.blockedInputRefs) ? output.blockedInputRefs.map(String) : []), [output?.blockedInputRefs]);
  const upstreamPrompt = useMemo(() => composerUpstreamPrompt(document, generator), [document, generator]);
  const hasCascadeInputs = Boolean(generator && document?.connections.some((edge) => edge.to === generator.id));

  useEffect(() => {
    setEngine(engineFor(generator));
    setKind(generator?.type === 'video' ? 'video' : 'image');
    setPrompt(promptFor(output));
    setPromptHeight(promptHeightFor(output));
  }, [generator?.id, output?.id]);

  useLayoutEffect(() => {
    const input = promptInputRef.current;
    if (!input) return;
    input.innerHTML = promptHtmlFor(output);
  }, [output?.id]);

  useEffect(() => {
    let active = true;
    const workflow = String(activeGenerator.comfyWorkflow || '');
    if (engine !== 'comfy' || activeGenerator.mode !== 'custom' || !workflow) {
      setComfyFields([]);
      return;
    }
    void canvasRuntime.getComfyFields(workflow).then((fields) => { if (active) setComfyFields(fields as ComfyField[]); });
    return () => { active = false; };
  }, [activeGenerator.comfyWorkflow, activeGenerator.mode, canvasRuntime, engine]);

  useEffect(() => {
    window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
  }, [engine, generator, kind, output, references.length, upstreamPrompt]);

  const changeEngine = (next: ComposerEngine) => {
    setEngine(next);
    if (next === 'modelscope') onPatchGenerator({ count: Number(activeGenerator.count || 1), msRatio: activeGenerator.msRatio || 'square', msResolution: activeGenerator.msResolution || '1k', msgenModel: activeGenerator.msgenModel || 'zimage' }, 'msgen');
    else if (next === 'comfy') onPatchGenerator({ comfyParams: activeGenerator.comfyParams || {}, comfyRandomActive: activeGenerator.comfyRandomActive || {}, height: Number(activeGenerator.height || 1024), mode: activeGenerator.mode || 'text', width: Number(activeGenerator.width || 1024) }, 'comfy');
    else if (kind === 'video') onPatchGenerator({ apiProvider: next === 'volcengine' ? 'volcengine' : activeGenerator.apiProvider || '', aspectRatio: activeGenerator.aspectRatio || '16:9', duration: Number(activeGenerator.duration || 5), resolution: activeGenerator.resolution || '' }, 'video');
    else onPatchGenerator({ apiProvider: next === 'volcengine' ? 'volcengine' : activeGenerator.apiProvider === 'volcengine' ? '' : activeGenerator.apiProvider || '', count: Number(activeGenerator.count || 1), quality: activeGenerator.quality || 'auto', ratio: activeGenerator.ratio || 'square', resolution: activeGenerator.resolution || '1k' }, 'generator');
  };
  const changeKind = (next: ComposerKind) => {
    setKind(next);
    if (next === 'video') onPatchGenerator({ apiProvider: engine === 'volcengine' ? 'volcengine' : activeGenerator.apiProvider || '', aspectRatio: activeGenerator.aspectRatio || '16:9', duration: Number(activeGenerator.duration || 5), resolution: activeGenerator.resolution || '' }, 'video');
    else onPatchGenerator({ apiProvider: engine === 'volcengine' ? 'volcengine' : activeGenerator.apiProvider === 'volcengine' ? '' : activeGenerator.apiProvider || '', count: Number(activeGenerator.count || 1), quality: activeGenerator.quality || 'auto', ratio: activeGenerator.ratio || 'square', resolution: activeGenerator.resolution || '1k' }, 'generator');
  };
  const patchPrompt = (snapshot: SmartCanvasPromptSnapshot, save: boolean) => {
    setPrompt(snapshot.text);
    onPatchOutput({ promptDraftHtml: snapshot.html, promptDraftText: snapshot.text, promptDraftTouched: true, runPromptRefs: snapshot.refs }, save);
  };
  const savePrompt = (value = prompt) => {
    const input = promptInputRef.current;
    if (!input) return;
    input.textContent = value;
    patchPrompt(snapshotPrompt(input), true);
  };
  const toggleReference = (index: number) => {
    if (readOnly || !output) return;
    const item = references[index];
    if (!item) return;
    const key = smartCanvasReferenceKey(item);
    const next = new Set(blockedReferences);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onPatchOutput({ blockedInputRefs: [...next] }, true);
  };
  const dropReferenceAt = (event: ReactDragEvent<HTMLDivElement>, index: number) => {
    if (draggedReference < 0 || draggedReference === index || readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    setDropReference({ index, placement });
  };
  const reorderReference = (event: ReactDragEvent<HTMLDivElement>, index: number) => {
    if (draggedReference < 0 || draggedReference === index || readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    onPatchOutput({ inputRefOrder: movedReferenceOrder(references, draggedReference, index, placement) }, true);
    setDraggedReference(-1);
    setDropReference(null);
  };
  const startPromptResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const start = { height: promptHeight, y: event.clientY };
    let lastPointerY = event.clientY;
    const move = (next: PointerEvent) => {
      lastPointerY = next.clientY;
      setPromptHeight(Math.max(60, Math.min(380, start.height + next.clientY - start.y)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      const height = Math.max(60, Math.min(380, start.height + lastPointerY - start.y));
      setPromptHeight(height);
      onPatchOutput({ promptH: height }, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  const style = output ? {
    left: Number(output.x || 0) + composerNodeWidth(output) / 2 - 270,
    top: Number(output.y || 0) + composerNodeHeight(output) + 14,
    width: 540,
    '--prompt-h': `${promptHeight}px`,
  } as CSSProperties : { width: 540, '--prompt-h': `${promptHeight}px` } as CSSProperties;

  return <div className={`composer ${output ? 'open' : ''}`} id="composer" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} style={style}>
    <div className="composer-card">
      <div className="composer-head">
        <div className="composer-head-left">
          <select className="engine-select" disabled={!output || readOnly} id="engineSelect" onChange={(event) => changeEngine(event.target.value as ComposerEngine)} value={engine}>
            <option value="api">API生成</option>
            <option value="volcengine">火山引擎</option>
            <option value="modelscope">Modelscope生成</option>
            <option value="comfy">ComfyUI生成</option>
          </select>
          <div className="kind-toggle" id="apiKindToggle" style={{ display: engine === 'api' || engine === 'volcengine' ? 'inline-flex' : 'none' }}>
            <button className={kind === 'image' ? 'active' : ''} data-kind="image" disabled={!output || readOnly} onClick={() => changeKind('image')} type="button"><i data-lucide="image" /><span>图片</span></button>
            <button className={kind === 'video' ? 'active' : ''} data-kind="video" disabled={!output || readOnly} onClick={() => changeKind('video')} type="button"><i data-lucide="film" /><span>视频</span></button>
          </div>
        </div>
      </div>
      <div className={`input-thumbs-row ${references.length ? 'has-items' : ''}`} id="inputThumbsRow">
        {references.length ? <div className="input-thumb-list">{references.map((item, index) => {
          const blocked = blockedReferences.has(smartCanvasReferenceKey(item));
          const dropClass = dropReference?.index === index ? (dropReference.placement === 'before' ? 'drop-before' : 'drop-after') : '';
          return <div className={`input-thumb ${blocked ? 'input-blocked' : ''} ${draggedReference === index ? 'dragging' : ''} ${dropClass}`.trim()} data-blocked-label={blocked ? '已阻止' : undefined} data-node-id={item.nodeId} data-url={item.url} draggable={!readOnly && references.length > 1} key={`${item.url}-${index}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleReference(index); }} onDragEnd={() => { setDraggedReference(-1); setDropReference(null); }} onDragOver={(event) => dropReferenceAt(event, index)} onDragStart={(event) => { event.stopPropagation(); setDraggedReference(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-smart-input-thumb', String(index)); }} onDrop={(event) => reorderReference(event, index)} title={`${item.name} · ${blocked ? '点击恢复引用' : '点击阻止引用'}`}>
          {item.kind === 'video' ? <video muted preload="metadata" src={item.url} /> : <img alt="" draggable={false} src={item.url} />}
          <span className="input-thumb-label">图{index + 1}</span>
        </div>})}{references.length > 1 ? <span className="input-thumb-count">共 {references.length} 个输入</span> : null}</div> : null}
      </div>
      <div className={`input-prompt-preview ${upstreamPrompt ? 'has-text' : ''}`} id="inputPromptPreview">{upstreamPrompt ? <><div className="input-prompt-preview-label">上游提示词</div><div className="input-prompt-preview-text">{upstreamPrompt}</div></> : null}</div>
      <div className="prompt-row">
        <div className="prompt-input" contentEditable={!readOnly} data-placeholder={kind === 'video' ? '描述你想生成或编辑的视频...' : '描述你想生成或编辑的图片...'} id="promptInput" onBlur={(event) => patchPrompt(snapshotPrompt(event.currentTarget), true)} onInput={(event) => patchPrompt(snapshotPrompt(event.currentTarget), false)} ref={promptInputRef} suppressContentEditableWarning />
        <button aria-label="模板库" className="composer-template-btn" disabled={!output || readOnly} id="composerTemplateBtn" onClick={() => window.openCanvasPromptLibrary?.({ initialText: prompt, onApply: savePrompt })} title="模板库" type="button"><i data-lucide="library" /><span>模板库</span></button>
        <SmartCanvasMentionPicker inputItems={mentionCandidates} inputRef={promptInputRef} onPromptChange={patchPrompt} outputId={output?.id || ''} readOnly={readOnly} />
        <div className="prompt-resize" id="promptResize" onPointerDown={startPromptResize} title="拖拽调整文本框高度" />
      </div>
      <div className="param-row"><div className="dynamic-params" id="dynamicParams">
        <ComposerDynamicParams canvasRuntime={canvasRuntime} comfyFields={comfyFields} engine={engine} generator={activeGenerator} kind={kind} onPatch={onPatchGenerator} readOnly={!output || readOnly} />
      </div></div>
      <div className="composer-actions">
        <button className="run-btn cascade-run-btn" disabled={!output || readOnly || Boolean(activeGenerator.running)} id="cascadeRunBtn" onClick={() => onRun('cascade')} style={{ display: hasCascadeInputs ? 'inline-flex' : 'none' }} type="button"><i data-lucide="workflow" /><span>一键运行</span></button>
        <button className="run-btn" disabled={!output || readOnly || Boolean(activeGenerator.running)} id="runBtn" onClick={() => onRun('node')} type="button"><i data-lucide="sparkles" /><span>{activeGenerator.running ? '运行中…' : '运行'}</span></button>
      </div>
    </div>
  </div>;
}

function ComposerDynamicParams({ canvasRuntime, comfyFields, engine, generator, kind, onPatch, readOnly }: { canvasRuntime: CanvasRuntime; comfyFields: ComfyField[]; engine: ComposerEngine; generator: CanvasNode; kind: ComposerKind; onPatch(patch: Record<string, unknown>, type?: 'comfy' | 'generator' | 'msgen' | 'video'): string; readOnly: boolean }) {
  if (engine === 'modelscope') {
    const models = canvasRuntime.getNodeOptions('msgen', 'model', generator);
    return <>
      <ComposerChoice icon="sparkles" label="功能" onChange={(msgenModel) => onPatch({ msgenModel }, 'msgen')} options={models} value={String(generator.msgenModel || 'zimage')} />
      <ComposerChoice label="分辨率" onChange={(msResolution) => onPatch({ msResolution }, 'msgen')} options={imageResolutions.map(([value, label]) => ({ value, label }))} value={String(generator.msResolution || '1k')} />
      <ComposerChoice label="比例" onChange={(msRatio) => onPatch({ msRatio }, 'msgen')} options={imageRatios.filter(([value]) => value !== 'source').map(([value, label]) => ({ value, label }))} value={String(generator.msRatio || 'square')} />
      <ComposerCount disabled={readOnly} onChange={(count) => onPatch({ count }, 'msgen')} value={Number(generator.count || 1)} />
    </>;
  }
  if (engine === 'comfy') {
    const modes = [['text', '文生图'], ['enhance', '图片增强'], ['edit', '图片编辑'], ['custom', '自定义']] as const;
    const workflows = canvasRuntime.getNodeOptions('comfy', 'workflow', generator);
    const params = generator.comfyParams && typeof generator.comfyParams === 'object' ? generator.comfyParams as Record<string, unknown> : {};
    return <>
      <ComposerChoice icon="workflow" label="ComfyUI 模式" onChange={(mode) => onPatch({ mode }, 'comfy')} options={modes.map(([value, label]) => ({ value, label }))} value={String(generator.mode || 'text')} />
      {generator.mode === 'custom' ? <ComposerChoice label="工作流" onChange={(comfyWorkflow) => onPatch({ comfyParams: {}, comfyWorkflow }, 'comfy')} options={workflows} value={String(generator.comfyWorkflow || '')} /> : null}
      {generator.mode === 'text' ? <><ComposerNumber label="宽" onChange={(width) => onPatch({ width }, 'comfy')} value={Number(generator.width || 1024)} /><ComposerNumber label="高" onChange={(height) => onPatch({ height }, 'comfy')} value={Number(generator.height || 1024)} /></> : null}
      {comfyFields.map((field) => {
        const id = String(field.id || '');
        const value = params[id] ?? field.default ?? '';
        if (!id) return null;
        if (field.type === 'boolean') return <button className={`setting-check ${value ? 'active' : ''}`} key={id} onClick={() => onPatch({ comfyParams: { ...params, [id]: !value } }, 'comfy')} type="button"><span className="check-box" /><span>{field.name || id}</span></button>;
        if (field.type === 'dropdown') return <ComposerChoice key={id} label={field.name || id} onChange={(next) => onPatch({ comfyParams: { ...params, [id]: next } }, 'comfy')} options={(field.options || []).map((item) => ({ label: item, value: item }))} value={String(value)} />;
        return <ComposerNumber key={id} label={field.name || id} max={field.max} min={field.min} onChange={(next) => onPatch({ comfyParams: { ...params, [id]: next } }, 'comfy')} step={field.step} value={Number(value || 0)} />;
      })}
    </>;
  }
  if (kind === 'video') {
    const providers = filteredProviders(canvasRuntime.getNodeOptions('video', 'provider', generator), engine);
    const provider = String(generator.apiProvider || providers[0]?.value || (engine === 'volcengine' ? 'volcengine' : ''));
    const models = canvasRuntime.getNodeOptions('video', 'model', { ...generator, apiProvider: provider });
    return <>
      <ComposerChoice icon="server" label="平台" onChange={(apiProvider) => onPatch({ apiProvider, model: canvasRuntime.getNodeOptions('video', 'model', { ...generator, apiProvider })[0]?.value || '' }, 'video')} options={providers} value={provider} />
      <ComposerChoice label="模型" onChange={(model) => onPatch({ model }, 'video')} options={models} value={String(generator.model || models[0]?.value || '')} />
      <ComposerChoice label="分辨率" onChange={(resolution) => onPatch({ resolution }, 'video')} options={['', '480p', '720p', '1080p'].map((value) => ({ value, label: value || 'Auto' }))} value={String(generator.resolution || '')} />
      <ComposerChoice label="比例" onChange={(aspectRatio) => onPatch({ aspectRatio }, 'video')} options={['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21', 'keep_ratio', 'adaptive'].map((value) => ({ value, label: value }))} value={String(generator.aspectRatio || '16:9')} />
      <ComposerNumber label="时长" max={60} min={-1} onChange={(duration) => onPatch({ duration }, 'video')} value={Number(generator.duration || 5)} />
      {([['enhancePrompt', '增强提示词'], ['enableUpsample', '超分辨率'], ['generateAudio', '生成音频'], ['cameraFixed', '固定镜头'], ['watermark', '水印'], ['multimodal', '多模态']] as const).map(([field, label]) => <button className={`setting-check ${generator[field] ? 'active' : ''}`} key={field} onClick={() => onPatch({ [field]: !generator[field] }, 'video')} type="button"><span className="check-box" /><span>{label}</span></button>)}
    </>;
  }
  const providers = filteredProviders(canvasRuntime.getNodeOptions('generator', 'provider', generator), engine);
  const provider = String(generator.apiProvider || providers[0]?.value || (engine === 'volcengine' ? 'volcengine' : ''));
  const models = canvasRuntime.getNodeOptions('generator', 'model', { ...generator, apiProvider: provider });
  return <>
    <ComposerChoice icon="server" label="平台" onChange={(apiProvider) => onPatch({ apiProvider, model: canvasRuntime.getNodeOptions('generator', 'model', { ...generator, apiProvider })[0]?.value || '' }, 'generator')} options={providers} value={provider} />
    <ComposerChoice label="模型" onChange={(model) => onPatch({ model }, 'generator')} options={models} value={String(generator.model || models[0]?.value || '')} />
    <ComposerChoice label="分辨率" onChange={(resolution) => onPatch({ resolution }, 'generator')} options={imageResolutions.map(([value, label]) => ({ value, label }))} value={String(generator.resolution || '1k')} />
    <ComposerChoice label="比例" onChange={(ratio) => onPatch({ ratio }, 'generator')} options={imageRatios.map(([value, label]) => ({ value, label }))} value={String(generator.ratio || 'square')} />
    <ComposerChoice label="质量" onChange={(quality) => onPatch({ quality }, 'generator')} options={['auto', 'low', 'medium', 'high'].map((value) => ({ value, label: `Q ${value}` }))} value={String(generator.quality || 'auto')} />
    <ComposerCount disabled={readOnly} onChange={(count) => onPatch({ count }, 'generator')} value={Number(generator.count || 1)} />
    {generator.resolution === 'custom' ? <><ComposerNumber label="宽" min={64} onChange={(customWidth) => onPatch({ customWidth, customSize: `${customWidth}x${String(generator.customHeight || '')}` }, 'generator')} step={64} value={Number(generator.customWidth || 1024)} /><ComposerNumber label="高" min={64} onChange={(customHeight) => onPatch({ customHeight, customSize: `${String(generator.customWidth || '')}x${customHeight}` }, 'generator')} step={64} value={Number(generator.customHeight || 1024)} /></> : null}
  </>;
}

function ComposerChoice({ icon, label, onChange, options, value }: { icon?: string; label: string; onChange(value: string): void; options: RuntimeOption[]; value: string }) {
  const [pinned, setPinned] = useState(false);
  const selected = options.find((option) => option.value === value);
  return <div className={`smart-control ${pinned ? 'pinned' : ''}`}>
    <button aria-label={label} className="smart-pill" onClick={() => setPinned((open) => !open)} type="button">{icon ? <i data-lucide={icon} /> : null}<span className="sub">{selected?.label || value || label}</span><i className="pill-caret" data-lucide="chevron-down" /></button>
    <div className="smart-popover compact-popover"><div className="smart-popover-title">{label}</div><div className="model-list">{options.map((option) => <button className={`direct-option ${option.value === value ? 'active' : ''}`} data-param={label} data-value={option.value} key={option.value} onClick={() => { onChange(option.value); setPinned(false); }} type="button"><span>{option.label}</span></button>)}</div></div>
  </div>;
}

function ComposerCount({ disabled, onChange, value }: { disabled: boolean; onChange(value: number): void; value: number }) {
  return <div className="num-compact"><span className="num-label">数量</span><input aria-label="生成数量" disabled={disabled} max="8" min="1" onChange={(event) => onChange(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} type="number" value={Math.max(1, Math.min(8, value))} /></div>;
}

function ComposerNumber({ label, max, min, onChange, step, value }: { label: string; max?: number; min?: number; onChange(value: number): void; step?: number; value: number }) {
  return <div className="num-compact"><span className="num-label">{label}</span><input aria-label={label} max={max} min={min} onChange={(event) => onChange(Number(event.target.value) || 0)} step={step} type="number" value={value} /></div>;
}

function engineFor(generator: CanvasNode | null): ComposerEngine {
  if (generator?.type === 'msgen') return 'modelscope';
  if (generator?.type === 'comfy') return 'comfy';
  if (generator?.apiProvider === 'volcengine') return 'volcengine';
  return 'api';
}

function virtualGenerator(engine: ComposerEngine, kind: ComposerKind): CanvasNode {
  const type = engine === 'modelscope' ? 'msgen' : engine === 'comfy' ? 'comfy' : kind === 'video' ? 'video' : 'generator';
  return { id: '', type, apiProvider: engine === 'volcengine' ? 'volcengine' : '', count: 1, quality: 'auto', ratio: 'square', resolution: '1k' };
}

function filteredProviders(options: RuntimeOption[], engine: ComposerEngine) {
  if (engine === 'volcengine') return options.filter((option) => option.value === 'volcengine');
  return options.filter((option) => option.value !== 'volcengine');
}

function promptFor(output: CanvasNode | null) {
  return String(output?.promptDraftText || output?.runPrompt || '');
}

function promptHeightFor(output: CanvasNode | null) {
  return Math.max(60, Math.min(380, Number(output?.promptH || 124)));
}

function composerNodeWidth(node: CanvasNode) { return Number(node.w || 460); }
function composerNodeHeight(node: CanvasNode) { return Number(node.h || 320); }

function composerUpstreamPrompt(document: CanvasDocument | null, generator: CanvasNode | null) {
  if (!document || !generator) return '';
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  return document.connections.filter((edge) => edge.to === generator.id).map((edge) => byId.get(edge.from)).flatMap((node) => {
    if (!node) return [];
    if (node.type === 'prompt') return [String(node.text || '')];
    if (node.type === 'loop') return [String(node.fixedPrompt || node.variablePrompt || '')];
    if (node.type === 'llm') return [String(node.outputText || node.userInput || '')];
    if (node.type === 'promptGroup' && Array.isArray(node.items)) return node.items.map((id) => String(byId.get(String(id))?.text || ''));
    return [];
  }).map((text) => text.trim()).filter(Boolean).join('\n');
}

function promptHtmlFor(output: CanvasNode | null) {
  const stored = String(output?.promptDraftHtml || '');
  if (stored.includes('mention-image-token')) return stored;
  return promptHtmlWithMentionTokens(promptFor(output), promptReferencesFor(output)) || stored || escapeComposerText(promptFor(output));
}

function escapeComposerText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
