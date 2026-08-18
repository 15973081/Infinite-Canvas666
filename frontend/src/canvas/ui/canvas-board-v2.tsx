import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { mergeCanvasDocuments } from '../domain/document-merge';
import type { CanvasEdge, CanvasNode } from '../domain/types';
import { CanvasConflictError, canvasDocumentSavePayload } from '../infrastructure/canvas-repository';
import { createDocumentStore, type DocumentStore } from '../stores/document-store';

type Point = { x: number; y: number };
type Viewport = Point & { zoom: number };

const nodeRegistry: Record<string, string> = {
  comfy: 'ComfyUI', generator: 'API 生成', group: '分组', image: '上传', llm: 'LLM', loop: '循环',
  ltxDirector: 'LTX Director', msgen: 'ModelScope', output: 'Output', prompt: '提示词', promptGroup: '提示词组', video: '视频',
};

function nodePoint(node: CanvasNode): Point {
  return { x: Number(node.x || 0), y: Number(node.y || 0) };
}

function nodeSize(node: CanvasNode): { height: number; width: number } {
  const defaults = node.type === 'image' ? { height: 336, width: 260 }
    : node.type === 'prompt' ? { height: 230, width: 310 }
    : node.type === 'loop' ? { height: node.showPrompt || node.imageInput ? 390 : 180, width: 336 }
      : node.type === 'promptGroup' ? { height: 220, width: 260 }
        : node.type === 'generator' || node.type === 'msgen' ? { height: 340, width: 380 }
          : node.type === 'output' ? { height: 320, width: 460 }
            : node.type === 'video' ? { height: 410, width: 400 }
              : node.type === 'comfy' ? { height: 460, width: 420 }
                : node.type === 'llm' ? { height: 590, width: 420 }
                  : node.type === 'ltxDirector' ? { height: 800, width: 1000 }
                    : node.type === 'group' ? { height: 220, width: 300 }
        : { height: 110, width: 240 };
  return { height: Number(node.h || defaults.height), width: Number(node.w || defaults.width) };
}

function canInput(node: CanvasNode): boolean {
  return ['generator', 'comfy', 'ltxDirector', 'output', 'llm', 'msgen', 'video'].includes(node.type)
    || (node.type === 'loop' && (Boolean(node.imageInput) || Boolean(node.showPrompt)));
}

function canOutput(node: CanvasNode): boolean {
  return ['image', 'prompt', 'loop', 'group', 'promptGroup', 'generator', 'comfy', 'ltxDirector', 'llm', 'msgen', 'video', 'output'].includes(node.type);
}

function PromptBody({ commit, node, store }: { commit: () => void; node: CanvasNode; store: DocumentStore }) {
  const text = String(node.text || '');
  return <div className="prompt-editor" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <div className="prompt-toolbar">
      <button className="prompt-template-btn" onClick={() => window.CanvasBoardV2?.openPromptTemplates(node.id)} type="button">模板</button>
      <div className={`prompt-counter ${text.length > 20_000 ? 'over' : ''}`}><span>{text.length.toLocaleString()}</span><span>/ 20,000</span></div>
    </div>
    <textarea data-field="text" maxLength={20_000} onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { text: event.target.value })} placeholder="输入提示词" value={text} />
  </div>;
}

function PromptGroupBody({ node, nodesById }: { node: CanvasNode; nodesById: Map<string, CanvasNode> }) {
  const prompts = Array.isArray(node.items) ? node.items.map((id) => nodesById.get(String(id))).filter((item) => item?.type === 'prompt') : [];
  return <div className="text-[11px] text-gray-400" data-prompt-count={prompts.length}>{prompts.length} 个提示词已分组</div>;
}

function LoopBody({ commit, node, store }: { commit: () => void; node: CanvasNode; store: DocumentStore }) {
  const count = Math.max(1, Math.min(100, Number(node.count || 1)));
  const loopStart = Math.max(1, Number(node.loopStart || 1));
  const batchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize || 1)));
  const update = (patch: Record<string, unknown>, save = false) => {
    store.getState().updateNode(node.id, patch);
    if (save) commit();
  };
  const toggle = (field: 'imageInput' | 'showPrompt') => {
    const showPrompt = field === 'showPrompt' ? !node.showPrompt : Boolean(node.showPrompt);
    const imageInput = field === 'imageInput' ? !node.imageInput : Boolean(node.imageInput);
    const panels = Number(showPrompt) + Number(imageInput);
    update({ [field]: field === 'showPrompt' ? showPrompt : imageInput, w: Math.max(336, Number(node.w || 0)), h: panels === 0 ? undefined : panels === 1 ? (showPrompt ? 330 : 320) : 390 }, true);
  };
  return <div className="loop-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <div className="loop-count-row">
      <div className="loop-run-row">
        <div className="loop-count-group"><span className="loop-count-label">循环次数</span><input aria-label="循环次数" className="loop-count-input" max="100" min="1" onBlur={commit} onChange={(event) => update({ count: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} type="number" value={count} /></div>
        <div className="seg loop-mode">
          <button className={node.mode !== 'parallel' ? 'active' : ''} onClick={() => update({ mode: 'serial' }, true)} type="button">串行</button>
          <button className={node.mode === 'parallel' ? 'active' : ''} onClick={() => update({ mode: 'parallel' }, true)} type="button">并行</button>
        </div>
      </div>
      <div className="loop-toggle-row">
        <button className={`loop-toggle loop-image-toggle ${node.imageInput ? 'active' : ''}`} onClick={() => toggle('imageInput')} type="button">图片输入</button>
        <button className={`loop-toggle loop-prompt-toggle ${node.showPrompt ? 'active' : ''}`} onClick={() => toggle('showPrompt')} type="button">提示词输入</button>
      </div>
    </div>
    {node.imageInput ? <div className="loop-image-panel"><div className="loop-image-row">
      <span className="loop-count-label">起始</span><input aria-label="图片起始序号" className="loop-count-input" min="1" onBlur={commit} onChange={(event) => update({ loopStart: Math.max(1, Number(event.target.value) || 1) })} type="number" value={loopStart} />
      <span className="loop-count-label">批量</span><input aria-label="图片批量大小" className="loop-count-input" max="100" min="1" onBlur={commit} onChange={(event) => update({ imageBatchSize: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })} type="number" value={batchSize} />
    </div></div> : null}
    {node.showPrompt ? <div className="loop-prompt-panel"><div className="loop-field">
      <textarea aria-label="循环变量提示词" onBlur={commit} onChange={(event) => update({ variablePrompt: event.target.value })} placeholder="每轮变化的提示词" value={String(node.variablePrompt || '')} />
    </div><div className="loop-start-row"><button className="loop-token-btn loop-counter-token-btn" onClick={() => update({ variablePrompt: `${String(node.variablePrompt || '')}《计数》` }, true)} type="button">计数</button>
      <span className="loop-count-label">起始</span><input aria-label="提示词起始序号" className="loop-count-input" min="1" onBlur={commit} onChange={(event) => update({ loopStart: Math.max(1, Number(event.target.value) || 1) })} type="number" value={loopStart} />
    </div></div> : null}
  </div>;
}

const ratios = [['square', '1:1'], ['portrait', '2:3'], ['landscape', '3:2'], ['portrait43', '3:4'], ['landscape43', '4:3'], ['story', '9:16'], ['wide', '16:9'], ['ultrawide', '21:9'], ['ultratall', '9:21'], ['source', '自适应'], ['custom', '自定义']] as const;
const resolutions = [['1k', '1K'], ['2k', '2K'], ['4k', '4K'], ['custom', '自定义']] as const;

function SelectField({ ariaLabel, onChange, options, value }: { ariaLabel: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]>; value: string }) {
  return <select aria-label={ariaLabel} className="select-lite" onChange={(event) => onChange(event.target.value)} value={value}>
    {!options.some(([key]) => key === value) && value ? <option value={value}>{value}</option> : null}
    {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select>;
}

function RunButton({ label = '运行', mode, node }: { label?: string; mode?: 'cascade' | 'chat' | 'node'; node: CanvasNode }) {
  const [running, setRunning] = useState(false);
  return <button className={`gen-btn ${running || node.running ? 'running' : ''}`} disabled={running || Boolean(node.running)} onClick={async () => {
    setRunning(true);
    try { await window.CanvasBoardV2?.runNode(node.id, mode); }
    catch (error) { window.alert(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  }} type="button">{running || node.running ? '运行中…' : label}</button>;
}

const executableTypes = new Set(['generator', 'msgen', 'video', 'comfy', 'llm', 'ltxDirector']);

function hasExecutableUpstream(document: { connections: CanvasEdge[]; nodes: CanvasNode[] }, nodeId: string): boolean {
  const nodes = new Map(document.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const stack = document.connections.filter((edge) => edge.to === nodeId).map((edge) => edge.from);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (executableTypes.has(nodes.get(id)?.type || '')) return true;
    document.connections.filter((edge) => edge.to === id).forEach((edge) => stack.push(edge.from));
  }
  return false;
}

function ExecutionControls({ document, node }: { document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode }) {
  const cascade = hasExecutableUpstream(document, node.id);
  const failed = node.runStatus === 'failed' && Boolean(node._cascadeFailed);
  return <><div className="gen-run-row"><RunButton node={node} />{cascade ? <RunButton label="一键运行" mode="cascade" node={node} /> : null}{node.running ? <button className="node-stop-btn" onClick={() => void window.CanvasBoardV2?.controlExecution('stop-execution', node.id)} type="button">停止</button> : null}</div>
    {failed ? <div className="node-retry-bar"><span className="node-retry-msg" title={String(node.runError || '')}>{String(node.runError || '生成失败').slice(0, 60)}</span><button className="node-retry-btn" onClick={() => void window.CanvasBoardV2?.controlExecution('retry-execution', node.id)} type="button">重试</button><button className="node-stop-btn" onClick={() => void window.CanvasBoardV2?.controlExecution('stop-execution', node.id)} type="button">停止</button></div> : null}
  </>;
}

function connectedMedia(document: { connections: CanvasEdge[]; nodes: CanvasNode[] }, node: CanvasNode) {
  const byId = new Map(document.nodes.map((item) => [item.id, item]));
  const sources = document.connections.filter((edge) => edge.to === node.id).map((edge) => byId.get(edge.from)).filter(Boolean) as CanvasNode[];
  return sources.flatMap((source) => {
    if (source.type === 'image' && source.url) return [{ kind: String(source.mediaKind || 'image'), name: String(source.name || ''), url: String(source.url) }];
    if (source.type === 'output' && Array.isArray(source.images)) return source.images.map((item) => typeof item === 'string' ? { kind: 'image', name: '', url: item } : { kind: String((item as Record<string, unknown>).kind || 'image'), name: String((item as Record<string, unknown>).name || ''), url: String((item as Record<string, unknown>).url || '') }).filter((item) => item.url);
    if (source.type === 'group' && Array.isArray(source.items)) return source.items.map((id) => byId.get(String(id))).filter((item) => item?.type === 'image' && item.url).map((item) => ({ kind: String(item!.mediaKind || 'image'), name: String(item!.name || ''), url: String(item!.url) }));
    return [];
  });
}

async function mediaDimensions(url: string): Promise<{ height: number; width: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth });
    image.onerror = () => reject(new Error('无法读取参考图尺寸'));
    image.src = url;
  });
}

function InputSummary({ document, node }: { document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode }) {
  const sources = document.connections.filter((edge) => edge.to === node.id).map((edge) => document.nodes.find((item) => item.id === edge.from)).filter(Boolean) as CanvasNode[];
  const prompts = sources.filter((item) => ['prompt', 'promptGroup', 'loop', 'llm'].includes(item.type)).length;
  const media = connectedMedia(document, node);
  return <div><div className="text-[10px] text-gray-400">提示词 {prompts} · 图片/媒体 {media.length}</div>{media.length ? <div className="input-list mt-1">{media.slice(0, 8).map((item, index) => <div className="input-item" key={`${item.url}-${index}`}>{item.kind === 'video' ? <video muted preload="metadata" src={item.url} /> : <img alt={item.name || `参考 ${index + 1}`} src={item.url} />}<span className="input-index">{index + 1}</span></div>)}</div> : null}</div>;
}

function GeneratorBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const update = (patch: Record<string, unknown>) => { store.getState().updateNode(node.id, patch); commit(); };
  const bridge = window.CanvasLegacyBridge;
  const providerOptions = (bridge?.getNodeOptions('generator', 'provider', node) ?? []).map((item) => [item.value, item.label] as const);
  const modelOptions = (bridge?.getNodeOptions('generator', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
  const provider = String(node.apiProvider || providerOptions[0]?.[0] || '');
  const fitReference = async () => {
    const reference = connectedMedia(document, node).find((item) => item.kind !== 'video' && item.kind !== 'audio');
    if (!reference) throw new Error('请先连接一张参考图');
    const size = await mediaDimensions(reference.url);
    update({ fitImage: true, resolution: 'custom', customWidth: size.width, customHeight: size.height, customSize: `${size.width}x${size.height}` });
  };
  return <div className="generator-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <InputSummary document={document} node={node} />
    <div className="gen-settings"><div className="gen-settings-row">
      <SelectField ariaLabel="图片平台" onChange={(apiProvider) => {
        const models = bridge?.getNodeOptions('generator', 'model', { ...node, apiProvider }) ?? [];
        update({ apiProvider, model: models[0]?.value || '' });
      }} options={providerOptions} value={provider} />
      <SelectField ariaLabel="图片模型" onChange={(model) => update({ model })} options={modelOptions} value={String(node.model || '')} />
    </div><div className="gen-settings-row">
      <SelectField ariaLabel="分辨率" onChange={(resolution) => update({ resolution, ...(resolution === 'custom' ? { ratio: '' } : {}) })} options={resolutions} value={String(node.resolution || '1k')} />
      <SelectField ariaLabel="比例" onChange={(ratio) => update({ ratio })} options={ratios} value={String(node.ratio || 'square')} />
      <SelectField ariaLabel="质量" onChange={(quality) => update({ quality })} options={['auto', 'low', 'medium', 'high'].map((value) => [value, `Q ${value}`] as const)} value={String(node.quality || 'auto')} />
      <input aria-label="生成数量" className="gen-count-input" max="8" min="1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { count: Math.max(1, Math.min(8, Number(event.target.value) || 1)) })} type="number" value={Math.max(1, Math.min(8, Number(node.count || 1)))} />
    </div>
    {node.ratio === 'custom' ? <div className="gen-settings-row"><input aria-label="比例宽" className="setting-input" min="1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { customRatioWidth: event.target.value, customRatio: `${event.target.value}:${String(node.customRatioHeight || '')}` })} type="number" value={String(node.customRatioWidth || '')} /><input aria-label="比例高" className="setting-input" min="1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { customRatioHeight: event.target.value, customRatio: `${String(node.customRatioWidth || '')}:${event.target.value}` })} type="number" value={String(node.customRatioHeight || '')} /></div> : null}
    {node.resolution === 'custom' ? <div className="gen-settings-row"><input aria-label="自定义宽度" className="setting-input" min="64" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { customWidth: event.target.value, customSize: `${event.target.value}x${String(node.customHeight || '')}` })} step="64" type="number" value={String(node.customWidth || '')} /><input aria-label="自定义高度" className="setting-input" min="64" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { customHeight: event.target.value, customSize: `${String(node.customWidth || '')}x${event.target.value}` })} step="64" type="number" value={String(node.customHeight || '')} /><button className="secondary-btn" onClick={() => void fitReference().catch((error) => window.alert(error.message))} type="button">适配参考图</button></div> : null}
    </div><ExecutionControls document={document} node={node} />
  </div>;
}

function MsGenBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const update = (patch: Record<string, unknown>) => { store.getState().updateNode(node.id, patch); commit(); };
  const bridge = window.CanvasLegacyBridge;
  const models = (bridge?.getNodeOptions('msgen', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
  const customModels = (bridge?.getNodeOptions('msgen', 'custom-model', node) ?? []).map((item) => [item.value, item.label] as const);
  const loras = bridge?.getNodeOptions('msgen', 'lora', node) ?? [];
  const selectedLora = loras.find((item) => item.value === node.msLoraId) ?? loras[0];
  const fitReference = async () => {
    const reference = connectedMedia(document, node).find((item) => item.kind !== 'video' && item.kind !== 'audio');
    if (!reference) throw new Error('请先连接一张参考图');
    const size = await mediaDimensions(reference.url);
    update({ fitImage: true, msResolution: 'custom', msCustomWidth: size.width, msCustomHeight: size.height, msCustomSize: `${size.width}x${size.height}` });
  };
  return <div className="generator-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <InputSummary document={document} node={node} />
    <div className="ms-model-tabs">{models.map(([value, label]) => <button className={node.msgenModel === value ? 'active' : ''} key={value} onClick={() => update({ msgenModel: value, msLoraEnabled: false, msLoraId: '' })} type="button">{label}</button>)}</div>
    {node.msgenModel === 'custom' ? <SelectField ariaLabel="ModelScope 模型" onChange={(msCustomModel) => update({ msCustomModel, msLoraEnabled: false, msLoraId: '' })} options={customModels} value={String(node.msCustomModel || customModels[0]?.[0] || '')} /> : null}
    <div className="gen-settings"><div className="gen-settings-row">
      <SelectField ariaLabel="ModelScope 分辨率" onChange={(msResolution) => update({ msResolution, ...(msResolution === 'custom' ? { msRatio: '' } : {}) })} options={resolutions} value={String(node.msResolution || '1k')} />
      <SelectField ariaLabel="ModelScope 比例" onChange={(msRatio) => update({ msRatio })} options={ratios.filter(([value]) => value !== 'source')} value={String(node.msRatio || 'square')} />
      <input aria-label="ModelScope 生成数量" className="gen-count-input" max="8" min="1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { count: Math.max(1, Math.min(8, Number(event.target.value) || 1)) })} type="number" value={Math.max(1, Math.min(8, Number(node.count || 1)))} />
    </div>
    {node.msRatio === 'custom' ? <div className="gen-settings-row"><input aria-label="ModelScope 比例宽" className="setting-input" min="1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { msCustomRatioWidth: event.target.value, msCustomRatio: `${event.target.value}:${String(node.msCustomRatioHeight || '')}` })} type="number" value={String(node.msCustomRatioWidth || '')} /><input aria-label="ModelScope 比例高" className="setting-input" min="1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { msCustomRatioHeight: event.target.value, msCustomRatio: `${String(node.msCustomRatioWidth || '')}:${event.target.value}` })} type="number" value={String(node.msCustomRatioHeight || '')} /></div> : null}
    {node.msResolution === 'custom' ? <div className="gen-settings-row"><input aria-label="ModelScope 自定义宽度" className="setting-input" min="64" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { msCustomWidth: event.target.value, msCustomSize: `${event.target.value}x${String(node.msCustomHeight || '')}` })} step="64" type="number" value={String(node.msCustomWidth || '')} /><input aria-label="ModelScope 自定义高度" className="setting-input" min="64" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { msCustomHeight: event.target.value, msCustomSize: `${String(node.msCustomWidth || '')}x${event.target.value}` })} step="64" type="number" value={String(node.msCustomHeight || '')} /><button className="secondary-btn" onClick={() => void fitReference().catch((error) => window.alert(error.message))} type="button">适配参考图</button></div> : null}
    {loras.length ? <><button className={`setting-check ${node.msLoraEnabled ? 'active' : ''}`} onClick={() => update({ msLoraEnabled: !node.msLoraEnabled, ...(!node.msLoraEnabled ? { msLoraId: selectedLora?.value || '', msLoraStrength: Number(selectedLora?.meta?.strength ?? 0.8) } : {}) })} type="button">启用 LoRA</button>{node.msLoraEnabled ? <div className="gen-settings-row"><SelectField ariaLabel="ModelScope LoRA" onChange={(msLoraId) => { const picked = loras.find((item) => item.value === msLoraId); update({ msLoraId, msLoraStrength: Number(picked?.meta?.strength ?? node.msLoraStrength ?? 0.8) }); }} options={loras.map((item) => [item.value, item.label] as const)} value={String(node.msLoraId || selectedLora?.value || '')} /><label className="field"><span className="setting-title">LoRA 强度 {Number(node.msLoraStrength ?? 0.8).toFixed(2)}</span><input aria-label="LoRA 强度" className="canvas-range" max="1" min="0.1" onChange={(event) => store.getState().updateNode(node.id, { msLoraStrength: Number(event.target.value) })} onPointerUp={commit} step="0.05" type="range" value={Number(node.msLoraStrength ?? 0.8)} /></label></div> : null}</> : <div className="text-[11px] text-gray-400">当前模型没有绑定 LoRA</div>}
    </div><ExecutionControls document={document} node={node} />
  </div>;
}

function OutputBody({ commit, node, store }: { commit: () => void; node: CanvasNode; store: DocumentStore }) {
  const images = Array.isArray(node.images) ? node.images : [];
  const pending = Array.isArray(node._pending) ? node._pending as Array<Record<string, unknown>> : [];
  const urlOf = (item: unknown) => typeof item === 'string' ? item : String((item as { url?: unknown })?.url || '');
  const remove = (url: string) => { store.getState().updateNode(node.id, { images: images.filter((item) => urlOf(item) !== url) }); commit(); };
  const open = (url: string) => window.CanvasBoardV2?.openOutputLightbox(node, url);
  const retry = (item: Record<string, unknown>) => {
    const sourceId = String((item.run as Record<string, any> | undefined)?.node?.id || '');
    store.getState().updateNode(node.id, { _pending: pending.filter((candidate) => candidate !== item) });
    commit();
    if (sourceId) void window.CanvasBoardV2?.runNode(sourceId);
  };
  return <div className="output-grid" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>{images.map((item, index) => {
    const url = urlOf(item);
    const kind = String((item as { kind?: unknown })?.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|m4a)(\?|$)/i.test(url) ? 'audio' : 'image'));
    return <div className="output-img-wrap" data-output-url={url} key={`${url}-${index}`}>
      {kind === 'video' ? <video controls onDoubleClick={() => open(url)} preload="metadata" src={url} /> : kind === 'audio' ? <audio controls preload="metadata" src={url} /> : <img alt="generated output" draggable onClick={() => open(url)} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-canvas-output-image', JSON.stringify({ kind, name: String((item as Record<string, unknown>).name || ''), url })); event.dataTransfer.setData('text/uri-list', url); }} src={url} />}
      <a className="output-download" download href={url} onClick={(event) => event.stopPropagation()}>↓</a><button aria-label="删除输出" className="output-del" onClick={() => remove(url)} type="button">×</button>
    </div>;
  })}{pending.map((item, index) => <div className={`output-pending ${item.failed ? 'failed' : ''}`} data-pending-id={String(item.id || '')} key={String(item.id || index)}><span className="pending-spinner" /><span>{item.recoveryStatus === 'interrupted' ? '任务追踪已中断' : String(item.label || item.status || '正在生成…')}</span>{item.canvasTaskId ? <small>{String(item.canvasTaskId)}</small> : null}{item.recoveryStatus === 'interrupted' ? <button onClick={() => retry(item)} type="button">重新生成</button> : null}</div>)}</div>;
}

function VideoBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const [manualUrl, setManualUrl] = useState(String((Array.isArray(node.manualVideoUrls) ? node.manualVideoUrls[0] : '') || ''));
  const [preparing, setPreparing] = useState(false);
  const update = (patch: Record<string, unknown>) => { store.getState().updateNode(node.id, patch); commit(); };
  const bridge = window.CanvasLegacyBridge;
  const providers = (bridge?.getNodeOptions('video', 'provider', node) ?? []).map((item) => [item.value, item.label] as const);
  const models = (bridge?.getNodeOptions('video', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
  const toggles = [['enhancePrompt', '增强提示词'], ['enableUpsample', '超分辨率'], ['watermark', '水印'], ['cameraFixed', '固定镜头'], ['generateAudio', '生成音频'], ['multimodal', '多模态'], ['useFrameRoles', '首尾帧']] as const;
  return <div className="generator-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <InputSummary document={document} node={node} />
    <div className="video-input-actions"><input aria-label="视频手动 URL" className="setting-input" onChange={(event) => setManualUrl(event.target.value)} placeholder="https://… 或 asset://…" value={manualUrl} /><button className="tool-btn" disabled={preparing} onClick={async () => { setPreparing(true); try { await window.CanvasBoardV2?.prepareVideoMedia(node.id, 'manual', manualUrl); } catch (error) { window.alert(error instanceof Error ? error.message : String(error)); } finally { setPreparing(false); } }} type="button">应用网址</button><button className="tool-btn" disabled={preparing} onClick={async () => { setPreparing(true); try { await window.CanvasBoardV2?.prepareVideoMedia(node.id, 'cloud'); } catch (error) { window.alert(error instanceof Error ? error.message : String(error)); } finally { setPreparing(false); } }} type="button">{preparing ? '处理中…' : '上传云端'}</button></div>
    <div className="gen-settings"><div className="gen-settings-row">
      <SelectField ariaLabel="视频平台" onChange={(apiProvider) => {
        const next = bridge?.getNodeOptions('video', 'model', { ...node, apiProvider }) ?? [];
        update({ apiProvider, model: next[0]?.value || '' });
      }} options={providers} value={String(node.apiProvider || providers[0]?.[0] || '')} />
      <SelectField ariaLabel="视频模型" onChange={(model) => update({ model })} options={models} value={String(node.model || '')} />
    </div><div className="gen-settings-row">
      <input aria-label="视频时长" className="setting-input" max="60" min="-1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { duration: Math.max(-1, Math.min(60, Number(event.target.value) || 5)) })} type="number" value={Number(node.duration ?? 5)} />
      <SelectField ariaLabel="视频比例" onChange={(aspectRatio) => update({ aspectRatio })} options={['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21', 'keep_ratio', 'adaptive'].map((value) => [value, value] as const)} value={String(node.aspectRatio || '16:9')} />
      <SelectField ariaLabel="视频分辨率" onChange={(resolution) => update({ resolution })} options={['', '480p', '720p', '1080p', '780P'].map((value) => [value, value || 'Auto'] as const)} value={String(node.resolution || '')} />
      <SelectField ariaLabel="视频任务模式" onChange={(taskMode) => update({ taskMode })} options={[['auto', '自动'], ['edit', '编辑'], ['extend_backward', '向后延长'], ['extend_forward', '向前延长']]} value={String(node.taskMode || 'auto')} />
    </div><div className="gen-settings-row" style={{ flexWrap: 'wrap' }}>{toggles.map(([field, label]) => <button className={`setting-check ${node[field] ? 'active' : ''}`} key={field} onClick={() => update({ [field]: !node[field], ...(field === 'multimodal' && !node[field] ? { useFrameRoles: false } : field === 'useFrameRoles' && !node[field] ? { multimodal: false } : {}) })} type="button"><span className="check-dot" />{label}</button>)}</div>
    </div><ExecutionControls document={document} node={node} />
  </div>;
}

function LLMBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const update = (patch: Record<string, unknown>) => { store.getState().updateNode(node.id, patch); commit(); };
  const bridge = window.CanvasLegacyBridge;
  const providers = (bridge?.getNodeOptions('llm', 'provider', node) ?? []).map((item) => [item.value, item.label] as const);
  const models = (bridge?.getNodeOptions('llm', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
  const messages = Array.isArray(node.messages) ? node.messages as Array<{ content?: string; role?: string }> : [];
  return <div className="llm-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <div className="llm-row"><SelectField ariaLabel="LLM 平台" onChange={(llmProvider) => {
      const next = bridge?.getNodeOptions('llm', 'model', { ...node, llmProvider }) ?? [];
      update({ llmProvider, model: next[0]?.value || '' });
    }} options={providers} value={String(node.llmProvider || providers[0]?.[0] || '')} /><SelectField ariaLabel="LLM 模型" onChange={(model) => update({ model, ...(node.llmProvider === 'modelscope' ? { llmMsModel: model } : {}) })} options={models} value={String(node.model || '')} />
      <div className="llm-mode"><button className={node.mode !== 'chat' ? 'active' : ''} onClick={() => update({ mode: 'node' })} type="button">节点</button><button className={node.mode === 'chat' ? 'active' : ''} onClick={() => update({ mode: 'chat' })} type="button">聊天</button></div>
      <button className={`llm-sys-toggle ${node.showSystem ? 'active' : ''}`} onClick={() => update({ showSystem: !node.showSystem })} type="button">System</button>
    </div><InputSummary document={document} node={node} />
    {node.showSystem ? <textarea aria-label="系统提示词" className="llm-system" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { systemPrompt: event.target.value })} value={String(node.systemPrompt || '')} /> : null}
    {node.mode === 'chat' ? <div className="llm-chat-pane"><div className="llm-chat-log">{messages.map((message, index) => <div className={`llm-bubble ${message.role === 'user' ? 'user' : 'assistant'}`} key={index}>{message.content}{message.role === 'assistant' ? <button aria-label={`复制消息 ${index + 1}`} className="llm-bubble-copy" onClick={() => void navigator.clipboard.writeText(String(message.content || ''))} type="button">复制</button> : null}</div>)}</div><textarea aria-label="聊天输入" className="llm-chat-input" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { chatInput: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void window.CanvasBoardV2?.runNode(node.id, 'chat'); } }} value={String(node.chatInput || '')} /><RunButton label="发送" mode="chat" node={node} /></div>
      : <div className="llm-node-pane"><div className="llm-pane-label">Input</div><textarea aria-label="LLM 输入" className="llm-input-area llm-input-output" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { userInput: event.target.value })} value={String(node.userInput || '')} /><div className="llm-pane-label">Output</div><div className="llm-output-wrap"><button aria-label="复制 LLM 输出" className="llm-copy-btn" onClick={() => navigator.clipboard.writeText(String(node.outputText || ''))} type="button">复制</button><div className="llm-output">{String(node.outputText || '暂无输出')}</div></div><ExecutionControls document={document} node={node} /></div>}
  </div>;
}

type ComfyField = { default?: unknown; id?: string; input?: string; max?: number; min?: number; name?: string; node?: string; options?: string[]; random_enabled?: boolean; step?: number; type?: string };

function comfyFieldKind(field: ComfyField): 'audio' | 'image' | 'prompt' | 'setting' | 'video' {
  if (field.type === 'image' || field.type === 'video' || field.type === 'audio') return field.type;
  return field.type === 'textarea' || /prompt|text|提示词|正向|负向/i.test(`${field.input || ''} ${field.name || ''}`) ? 'prompt' : 'setting';
}

function ComfyBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const [fields, setFields] = useState<ComfyField[]>([]);
  const workflow = String(node.comfyWorkflow || '');
  useEffect(() => {
    let active = true;
    if (node.mode !== 'custom' || !workflow) { setFields([]); return; }
    void window.CanvasLegacyBridge?.getComfyFields(workflow).then((items) => { if (active) setFields(items as ComfyField[]); });
    return () => { active = false; };
  }, [node.mode, workflow]);
  const update = (patch: Record<string, unknown>) => { store.getState().updateNode(node.id, patch); commit(); };
  const params = node.comfyParams && typeof node.comfyParams === 'object' ? node.comfyParams as Record<string, unknown> : {};
  const randomActive = node.comfyRandomActive && typeof node.comfyRandomActive === 'object' ? node.comfyRandomActive as Record<string, unknown> : {};
  const settingFields = fields.filter((field) => comfyFieldKind(field) === 'setting');
  const mediaFields = fields.filter((field) => ['audio', 'image', 'video'].includes(comfyFieldKind(field)));
  const workflows = (window.CanvasLegacyBridge?.getNodeOptions('comfy', 'workflow', node) ?? []).map((item) => [item.value, item.label] as const);
  const setParam = (field: ComfyField, value: unknown, save = true) => {
    store.getState().updateNode(node.id, { comfyParams: { ...params, [String(field.id)]: value } });
    if (save) commit();
  };
  return <div className="comfy-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <div className="mode-tabs">{[['text', '文生图'], ['enhance', '增强'], ['edit', '编辑'], ['custom', '工作流']].map(([mode, label]) => <button className={node.mode === mode ? 'active' : ''} key={mode} onClick={() => update({ mode })} type="button">{label}</button>)}</div>
    <InputSummary document={document} node={node} />
    <div className="gen-settings comfy-settings">{node.mode === 'text' ? <div className="gen-settings-row"><input aria-label="Comfy 宽度" className="setting-input" min="64" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { width: Number(event.target.value) || 1024 })} step="64" type="number" value={Number(node.width || 1024)} /><input aria-label="Comfy 高度" className="setting-input" min="64" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { height: Number(event.target.value) || 1024 })} step="64" type="number" value={Number(node.height || 1024)} /></div>
      : node.mode === 'enhance' ? <><input aria-label="增强强度" className="canvas-range" max="1" min="0.1" onChange={(event) => store.getState().updateNode(node.id, { enhanceStrength: Number(event.target.value) })} onPointerUp={commit} step="0.05" type="range" value={Number(node.enhanceStrength ?? 0.5)} /><button className={`setting-check ${node.enhanceUpscale ? 'active' : ''}`} onClick={() => update({ enhanceUpscale: !node.enhanceUpscale })} type="button">超分辨率</button></>
        : node.mode === 'edit' ? <button className={`setting-check ${node.editUpscale ? 'active' : ''}`} onClick={() => update({ editUpscale: !node.editUpscale })} type="button">超分辨率</button>
          : <><SelectField ariaLabel="Comfy 工作流" onChange={(comfyWorkflow) => update({ comfyWorkflow, comfyParams: {}, comfyRandomActive: {} })} options={workflows} value={workflow} /><div className="text-[10px] text-gray-400">动态媒体字段 {mediaFields.length} · 参数字段 {settingFields.length}</div>{settingFields.map((field) => {
            const id = String(field.id || ''); const value = params[id] ?? field.default ?? '';
            if (field.type === 'boolean') return <button className={`setting-check ${value ? 'active' : ''}`} key={id} onClick={() => setParam(field, !value)} type="button">{field.name || id}</button>;
            if (field.type === 'dropdown') return <SelectField ariaLabel={field.name || id} key={id} onChange={(next) => setParam(field, next)} options={(field.options || []).map((item) => [item, item] as const)} value={String(value)} />;
            if (field.type === 'textarea') return <textarea aria-label={field.name || id} className="setting-input" key={id} onBlur={commit} onChange={(event) => setParam(field, event.target.value, false)} value={String(value)} />;
            const input = <input aria-label={field.name || id} className="setting-input" max={field.max} min={field.min} onBlur={commit} onChange={(event) => setParam(field, field.type === 'number' || field.type === 'slider' ? Number(event.target.value) : event.target.value, false)} step={field.step} type={field.type === 'number' || field.type === 'slider' ? 'number' : 'text'} value={String(value)} />;
            return field.type === 'number' && field.random_enabled ? <div className="comfy-random-field" key={id}>{input}<button aria-label={`${field.name || id} 随机`} className={`tool-btn comfy-random-btn ${randomActive[id] !== false ? 'active' : ''}`} onClick={() => update({ comfyRandomActive: { ...randomActive, [id]: randomActive[id] === false } })} type="button">随机</button></div> : <div key={id}>{input}</div>;
          })}</>}
    </div><ExecutionControls document={document} node={node} />
  </div>;
}

function ImageBody({ commit, node, store }: { commit: () => void; node: CanvasNode; store: DocumentStore }) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  useEffect(() => () => { mediaRef.current?.pause(); mediaRef.current?.removeAttribute('src'); mediaRef.current?.load(); }, []);
  const upload = async (files: File[]) => {
    if (!files.length) return;
    const uploaded = await window.CanvasLegacyBridge?.uploadMedia(files);
    const items = uploaded?.files ?? [];
    if (!items.length) return;
    store.getState().updateNode(node.id, { url: items[0].url || '', name: items[0].name || 'media', mediaKind: items[0].kind || 'image' });
    const ids = [node.id];
    items.slice(1).forEach((file, index) => {
      const id = store.getState().addNode('image', { x: Number(node.x || 0) + (index + 1) * 36, y: Number(node.y || 0) + (index + 1) * 36 });
      if (id) { store.getState().updateNode(id, { url: file.url || '', name: file.name || 'media', mediaKind: file.kind || 'image' }); ids.push(id); }
    });
    if (ids.length > 1) store.getState().groupNodes(ids);
    commit();
  };
  const url = String(node.url || '');
  const kind = String(node.mediaKind || (/\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|m4a)(\?|$)/i.test(url) ? 'audio' : 'image'));
  if (!url) return <label className="blank-image" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>选择或拖入媒体<input accept="image/*,video/*,audio/*" hidden multiple onChange={(event) => void upload([...(event.target.files ?? [])])} type="file" /></label>;
  return <div className="image-preview-wrap" onClick={(event) => event.stopPropagation()} onDoubleClick={() => window.open(url, '_blank', 'noopener')} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload([...event.dataTransfer.files]); }} onPointerDown={(event) => event.stopPropagation()}>
    {kind === 'video' ? <video controls preload="metadata" ref={(element) => { mediaRef.current = element; }} src={url} /> : kind === 'audio' ? <audio controls preload="metadata" ref={(element) => { mediaRef.current = element; }} src={url} /> : <img alt={String(node.name || 'image')} draggable src={url} />}
    <div className="image-caption text-[11px] text-gray-400 truncate">{String(node.name || kind)}</div>
    <button aria-label="清空媒体" className="output-del" onClick={() => { store.getState().updateNode(node.id, { url: '', name: '空白图片', mediaKind: 'image' }); commit(); }} type="button">×</button>
  </div>;
}

function GroupBody({ node, nodesById }: { node: CanvasNode; nodesById: Map<string, CanvasNode> }) {
  const items = Array.isArray(node.items) ? node.items.map((id) => nodesById.get(String(id))).filter(Boolean) as CanvasNode[] : [];
  const media = items.filter((item) => item.type === 'image' && item.url);
  return <div><div className="text-[11px] text-gray-400">{media.length} 个媒体 · {items.filter((item) => item.type === 'prompt').length} 个提示词</div>{media.length ? <div className="output-grid">{media.slice(0, 6).map((item) => <img alt={String(item.name || 'media')} key={item.id} onDoubleClick={() => window.open(String(item.url), '_blank', 'noopener')} src={String(item.url)} />)}</div> : null}</div>;
}

function LTXBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<Record<string, unknown> | null>(null);
  if (!draftRef.current || draftRef.current.id !== node.id) draftRef.current = window.CanvasLegacyBridge?.normalizeLtxNode(node) ?? structuredClone(node);
  useEffect(() => {
    const host = hostRef.current;
    const Editor = window.CanvasLTXTimelineEditor;
    const draft = draftRef.current;
    if (!host || !Editor || !draft) return;
    store.getState().updateNode(node.id, draft);
    const editor = new Editor(draft, host, null);
    const sync = () => { store.getState().updateNode(node.id, structuredClone(draft)); commit(); };
    editor._onCanvasCommit = sync;
    editor._onCanvasResize = sync;
    return () => editor.destroy();
  }, [commit, node.id, store]);
  const update = (patch: Record<string, unknown>) => {
    Object.assign(draftRef.current ?? {}, patch);
    store.getState().updateNode(node.id, patch);
    commit();
  };
  return <div className="ltx-director-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <InputSummary document={document} node={node} />
    <textarea aria-label="LTX 全局提示词" className="setting-input" onBlur={commit} onChange={(event) => { Object.assign(draftRef.current ?? {}, { globalPrompt: event.target.value }); store.getState().updateNode(node.id, { globalPrompt: event.target.value }); }} placeholder="全局提示词" value={String(node.globalPrompt || '')} />
    <div className="ltx-params-row"><input aria-label="LTX 秒数" className="setting-input" min="0.1" onChange={(event) => update({ durationSeconds: Math.max(0.1, Number(event.target.value) || 5), durationFrames: Math.max(1, Math.round((Number(event.target.value) || 5) * Number(node.frameRate || 24))) })} step="0.01" type="number" value={Number(node.durationSeconds || 5)} /><input aria-label="LTX 帧数" className="setting-input" min="1" onChange={(event) => update({ durationFrames: Math.max(1, Number(event.target.value) || 120), durationSeconds: (Math.max(1, Number(event.target.value) || 120) / Number(node.frameRate || 24)) })} type="number" value={Number(node.durationFrames || 120)} /><input aria-label="LTX FPS" className="setting-input" min="1" onChange={(event) => update({ frameRate: Math.max(1, Number(event.target.value) || 24) })} type="number" value={Number(node.frameRate || 24)} /><input aria-label="LTX 宽度" className="setting-input" min="0" onChange={(event) => update({ customWidth: Math.max(0, Number(event.target.value) || 0) })} step="32" type="number" value={Number(node.customWidth || 0)} /><input aria-label="LTX 高度" className="setting-input" min="0" onChange={(event) => update({ customHeight: Math.max(0, Number(event.target.value) || 0) })} step="32" type="number" value={Number(node.customHeight || 0)} /></div>
    <div className="ltx-params-row"><SelectField ariaLabel="LTX 时间显示" onChange={(displayMode) => update({ displayMode })} options={[['seconds', '秒'], ['frames', '帧']]} value={String(node.displayMode || 'seconds')} /><button className={`setting-check ${node.useCustomAudio ? 'active' : ''}`} onClick={() => update({ useCustomAudio: !node.useCustomAudio })} type="button">自定义音频</button><input aria-label="LTX 图片压缩" className="setting-input" max="100" min="0" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { imgCompression: Number(event.target.value) })} type="number" value={Number(node.imgCompression ?? 18)} /><input aria-label="LTX Epsilon" className="setting-input" min="0" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { epsilon: Number(event.target.value) })} step="0.0001" type="number" value={Number(node.epsilon ?? 0.001)} /><input aria-label="LTX Divisible By" className="setting-input" min="1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { divisibleBy: Math.max(1, Number(event.target.value) || 32) })} type="number" value={Number(node.divisibleBy || 32)} /><input aria-label="LTX Noise Seed" className="setting-input" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { noiseSeed: Number(event.target.value) })} type="number" value={Number(node.noiseSeed ?? 12)} /></div>
    <div className="ltx-director-timeline-host" ref={hostRef}>{window.CanvasLTXTimelineEditor ? null : 'LTX 时间线脚本未加载'}</div>
    <ExecutionControls document={document} node={node} />
  </div>;
}

function CanvasBoardV2({ commit, store }: { commit: () => void; store: DocumentStore }) {
  const document = useStore(store, ({ document }) => document);
  const clipboard = useRef<{ connections: CanvasEdge[]; nodes: CanvasNode[] } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState('');
  const [selectedEdge, setSelectedEdge] = useState(-1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState('ready');
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const documentId = String(document?.id || '');
  const nodesById = new Map((document?.nodes ?? []).map((node) => [node.id, node]));
  const boardDocument = { connections: document?.connections ?? [], nodes: document?.nodes ?? [] };

  useEffect(() => {
    setConnectingFrom('');
    setSelectedEdge(-1);
    setSelectedIds(new Set());
  }, [documentId]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target?.isContentEditable || target?.matches('input, textarea, select');
      if (event.key === 'Escape') {
        setConnectingFrom('');
        setSelectedEdge(-1);
        setSelectedIds(new Set());
        return;
      }
      if (editable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        clipboard.current = store.getState().copyNodes([...selectedIds]);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && clipboard.current) {
        event.preventDefault();
        const ids = store.getState().pasteNodes(clipboard.current);
        if (ids.length) {
          setSelectedIds(new Set(ids));
          commit();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        const selected = store.getState().document?.nodes.filter((node) => selectedIds.has(node.id)) ?? [];
        const id = selected.some((node) => node.type === 'image') ? store.getState().groupNodes([...selectedIds]) : store.getState().groupPromptNodes([...selectedIds]);
        if (id) {
          setSelectedIds(new Set([id]));
          commit();
        }
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (selectedIds.size) selectedIds.forEach((id) => store.getState().deleteNode(id));
      else if (selectedEdge >= 0) store.getState().deleteConnection(selectedEdge);
      else return;
      event.preventDefault();
      setSelectedIds(new Set());
      setSelectedEdge(-1);
      commit();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [commit, selectedEdge, selectedIds, store]);

  useEffect(() => {
    const group = () => {
      const selected = store.getState().document?.nodes.filter((node) => selectedIds.has(node.id)) ?? [];
      const id = selected.some((node) => node.type === 'image') ? store.getState().groupNodes([...selectedIds]) : store.getState().groupPromptNodes([...selectedIds]);
      if (id) {
        setSelectedIds(new Set([id]));
        commit();
      }
    };
    window.addEventListener('canvas-board-v2-group-selected', group);
    return () => window.removeEventListener('canvas-board-v2-group-selected', group);
  }, [commit, selectedIds, store]);

  useEffect(() => {
    const listener = (event: Event) => setSaveState(String((event as CustomEvent<string>).detail || 'ready'));
    window.addEventListener('canvas-board-v2-save-state', listener);
    return () => window.removeEventListener('canvas-board-v2-save-state', listener);
  }, []);

  const connect = (toId: string) => {
    if (connectingFrom && store.getState().connectNodes(connectingFrom, toId)) commit();
    setConnectingFrom('');
  };

  return <div
    aria-label="CanvasBoard V2"
    data-testid="canvas-board-v2"
    data-viewport={`${viewport.x},${viewport.y},${viewport.zoom.toFixed(2)}`}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const point = { x: (event.clientX - rect.left - viewport.x) / viewport.zoom, y: (event.clientY - rect.top - viewport.y) / viewport.zoom };
      const outputPayload = event.dataTransfer.getData('application/x-canvas-output-image');
      if (outputPayload) {
        try {
          const media = JSON.parse(outputPayload) as { kind?: string; name?: string; url?: string };
          if (media.url) {
            const id = store.getState().addNode('image', point);
            if (id) {
              store.getState().updateNode(id, { mediaKind: media.kind || 'image', name: media.name || 'output', url: media.url });
              commit();
            }
            return;
          }
        } catch (error) {
          console.warn('[canvas-modern-core] invalid output drag payload', error);
        }
      }
      const files = [...event.dataTransfer.files].filter((file) => /^(image|video|audio)\//.test(file.type));
      if (files.length) void window.CanvasBoardV2?.importFiles(files, point);
    }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      const board = event.currentTarget;
      const start = { x: event.clientX, y: event.clientY, viewport };
      board.setPointerCapture(event.pointerId);
      setSelectedIds(new Set());
      setSelectedEdge(-1);
      const move = (next: PointerEvent) => setViewport((value) => ({
        ...value,
        x: start.viewport.x + next.clientX - start.x,
        y: start.viewport.y + next.clientY - start.y,
      }));
      const up = () => board.removeEventListener('pointermove', move);
      board.addEventListener('pointermove', move);
      board.addEventListener('pointerup', up, { once: true });
    }}
    onWheel={(event) => {
      event.preventDefault();
      setViewport((value) => ({
        ...value,
        zoom: Math.min(1.5, Math.max(0.25, value.zoom * (event.deltaY < 0 ? 1.1 : 0.9))),
      }));
    }}
    style={{
      backgroundColor: 'var(--page)',
      backgroundImage: 'radial-gradient(var(--grid) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
      inset: 0,
      overflow: 'hidden',
      position: 'absolute',
      touchAction: 'none',
    }}
  >
    <div aria-live="polite" data-testid="canvas-board-v2-save-status" style={{ position: 'absolute', right: 18, top: 74, zIndex: 20 }}>
      {saveState === 'saving' ? '正在保存' : saveState === 'error' ? '保存失败，本地修改仍保留' : saveState === 'saved' ? '已保存' : ''}
    </div>
    <div style={{ height: 4000, position: 'absolute', transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: '0 0', width: 6000 }}>
      <svg height="4000" style={{ inset: 0, overflow: 'visible', position: 'absolute' }} width="6000">
        {(document?.connections ?? []).map((edge, index) => {
          const source = nodesById.get(edge.from);
          const target = nodesById.get(edge.to);
          if (!source || !target) return null;
          const from = nodePoint(source);
          const to = nodePoint(target);
          const fromSize = nodeSize(source);
          const toSize = nodeSize(target);
          const line = { x1: from.x + fromSize.width, x2: to.x, y1: from.y + fromSize.height / 2, y2: to.y + toSize.height / 2 };
          return <g key={`${edge.from}-${edge.to}-${index}`}>
            <line {...line} stroke={selectedEdge === index ? 'var(--strong)' : 'var(--line-2)'} strokeWidth="2" />
            <line {...line} data-edge-index={index} data-selected={selectedEdge === index ? 'true' : 'false'} onClick={(event) => {
              event.stopPropagation();
              setSelectedEdge(index);
              setSelectedIds(new Set());
            }} onPointerDown={(event) => event.stopPropagation()} pointerEvents="stroke" stroke="rgba(0,0,0,.001)" strokeWidth="16" />
          </g>;
        })}
      </svg>
      {(document?.nodes ?? []).map((node) => {
        const point = nodePoint(node);
        const size = nodeSize(node);
        return <article
          aria-label={`${node.type} ${node.id}`}
          className={`node ${node.type}-node sized ${node.url ? 'has-image' : ''} ${selectedIds.has(node.id) ? 'selected' : ''}`}
          data-node-id={node.id}
          data-node-type={node.type}
          key={node.id}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedEdge(-1);
            setSelectedIds((current) => {
              if (!event.ctrlKey && !event.metaKey) return new Set([node.id]);
              const next = new Set(current);
              if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
              return next;
            });
          }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedIds(new Set([node.id])); }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            if (event.ctrlKey || event.metaKey) return;
            const element = event.currentTarget;
            const start = { clientX: event.clientX, clientY: event.clientY, point };
            let moved = false;
            element.setPointerCapture(event.pointerId);
            setSelectedEdge(-1);
            if (!selectedIds.has(node.id)) setSelectedIds(new Set([node.id]));
            const move = (next: PointerEvent) => {
              moved = true;
              store.getState().moveNode(
                node.id,
                start.point.x + (next.clientX - start.clientX) / viewport.zoom,
                start.point.y + (next.clientY - start.clientY) / viewport.zoom,
              );
            };
            const up = () => {
              element.removeEventListener('pointermove', move);
              if (moved) commit();
            };
            element.addEventListener('pointermove', move);
            element.addEventListener('pointerup', up, { once: true });
          }}
          role="button"
          style={{ height: size.height, left: point.x, minHeight: size.height, minWidth: size.width, top: point.y, width: size.width }}
          tabIndex={0}
        >
          {canInput(node) ? <button aria-label={`连接到 ${node.id}`} className="port in" data-port="in" onClick={() => connect(node.id)} onPointerDown={(event) => event.stopPropagation()} onPointerUp={() => connect(node.id)} type="button" /> : null}
          {canOutput(node) ? <button aria-label={`从 ${node.id} 连线`} className="port out" data-port="out" onClick={() => setConnectingFrom(node.id)} onPointerDown={(event) => { event.stopPropagation(); setConnectingFrom(node.id); }} type="button" /> : null}
          <header className="node-head"><strong className="node-title">{nodeRegistry[node.type] ?? node.type}</strong></header>
          <div className="node-body">{node.type === 'prompt' ? <PromptBody commit={commit} node={node} store={store} />
            : node.type === 'image' ? <ImageBody commit={commit} node={node} store={store} />
              : node.type === 'group' ? <GroupBody node={node} nodesById={nodesById} />
            : node.type === 'promptGroup' ? <PromptGroupBody node={node} nodesById={nodesById} />
              : node.type === 'loop' ? <LoopBody commit={commit} node={node} store={store} />
                : node.type === 'generator' ? <GeneratorBody commit={commit} document={boardDocument} node={node} store={store} />
                  : node.type === 'msgen' ? <MsGenBody commit={commit} document={boardDocument} node={node} store={store} />
                    : node.type === 'output' ? <OutputBody commit={commit} node={node} store={store} />
                      : node.type === 'video' ? <VideoBody commit={commit} document={boardDocument} node={node} store={store} />
                        : node.type === 'llm' ? <LLMBody commit={commit} document={boardDocument} node={node} store={store} />
                          : node.type === 'comfy' ? <ComfyBody commit={commit} document={boardDocument} node={node} store={store} />
                            : node.type === 'ltxDirector' ? <LTXBody commit={commit} document={boardDocument} node={node} store={store} />
                              : String(node.title || node.name || node.id)}</div>
        </article>;
      })}
    </div>
  </div>;
}

export function mountCanvasBoardV2(element: HTMLElement, legacyBoard: HTMLElement): () => void {
  const bridge = window.CanvasLegacyBridge;
  const repository = window.CanvasModernCore?.canvasRepository;
  if (!bridge || !repository) throw new Error('Canvas V2 dependencies are unavailable');
  const store = createDocumentStore(bridge.getDocumentSnapshot());
  let baseDocument = store.getState().document;
  const adopt = (event: Event) => {
    const previousId = store.getState().document?.id;
    store.getState().adoptDocument((event as CustomEvent<unknown>).detail);
    const current = store.getState().document;
    if (current?.id !== previousId) baseDocument = current;
  };
  const projectExecution = (event: Event) => store.getState().projectExecutionDocument((event as CustomEvent<unknown>).detail);
  window.addEventListener('canvas-legacy-document', adopt);
  window.addEventListener('canvas-legacy-execution-document', projectExecution);
  const root = createRoot(element);
  const legacyHidden = legacyBoard.hidden;
  let disposed = false;
  let pending = false;
  let saving = false;
  const reportSaveState = (state: string) => {
    element.dataset.saveState = state;
    window.dispatchEvent(new CustomEvent('canvas-board-v2-save-state', { detail: state }));
  };
  const commit = () => {
    pending = true;
    if (saving) return;
    saving = true;
    void (async () => {
      while (pending && !disposed) {
        pending = false;
        const submitted = store.getState().document;
        if (!submitted || typeof submitted.id !== 'string') continue;
        reportSaveState('saving');
        try {
          const saved = await repository.save(submitted.id, canvasDocumentSavePayload(submitted));
          baseDocument = saved;
          if (!disposed) store.getState().acceptSavedDocument(saved, submitted);
          reportSaveState('saved');
        } catch (error) {
          if (error instanceof CanvasConflictError) {
            window.CanvasModernCore?.recordRolloutEvent('save-conflict', {
              dimensions: { reason: 'save-conflict' },
            });
          }
          if (error instanceof CanvasConflictError && error.serverCanvas && baseDocument) {
            const current = store.getState().document;
            if (current?.id === submitted.id) {
              const merged = mergeCanvasDocuments(baseDocument, current, error.serverCanvas);
              if (!merged.conflicts.length) {
                reportSaveState('merging');
                store.setState({ document: merged.document });
                try {
                  const saved = await repository.save(submitted.id, canvasDocumentSavePayload(merged.document));
                  baseDocument = saved;
                  if (!disposed) store.getState().acceptSavedDocument(saved, merged.document);
                  reportSaveState('saved');
                  window.CanvasModernCore?.recordRolloutEvent('save-rebased', {
                    dimensions: { reason: 'none' },
                  });
                  continue;
                } catch (retryError) {
                  console.warn('[canvas-modern-core] CanvasBoard V2 rebased save failed', retryError);
                }
              } else {
                console.warn('[canvas-modern-core] CanvasBoard V2 save conflict requires resolution', merged.conflicts);
              }
            }
          }
          window.CanvasModernCore?.recordRolloutEvent('save-failed', {
            dimensions: { reason: 'save-request-failed' },
          });
          reportSaveState('error');
          console.warn('[canvas-modern-core] CanvasBoard V2 save failed', error);
          break;
        }
      }
      saving = false;
    })();
  };
  const previousBoardApi = window.CanvasBoardV2;
  window.CanvasBoardV2 = {
    addNode(type, point) {
      const id = store.getState().addNode(type, point);
      if (id) commit();
      return id;
    },
    groupSelected() {
      window.dispatchEvent(new Event('canvas-board-v2-group-selected'));
    },
    async controlExecution(command, nodeId) {
      await bridge.runCommand(command, { targetId: nodeId });
      const result = bridge.getDocumentSnapshot();
      if (result) store.getState().projectDocument(result);
      commit();
    },
    async importFiles(files, point) {
      if (!files.length) return;
      const uploaded = await bridge.uploadMedia(files);
      const ids = (uploaded.files ?? []).map((file, index) => {
        const id = store.getState().addNode('image', point ? { x: point.x + index * 36, y: point.y + index * 36 } : undefined);
        if (id) store.getState().updateNode(id, { url: file.url || '', name: file.name || 'media', mediaKind: file.kind || 'image' });
        return id;
      }).filter(Boolean) as string[];
      if (ids.length > 1) store.getState().groupNodes(ids);
      if (ids.length) commit();
    },
    openPromptTemplates(nodeId) {
      window.openPromptTemplateModal?.(nodeId);
    },
    openOutputLightbox(node, url) {
      const images = Array.isArray(node.images) ? node.images.map((item) => {
        if (typeof item === 'string') return item;
        return String((item as Record<string, unknown>).url || '') === url ? { ...item as Record<string, unknown>, viewed: true } : item;
      }) : [];
      store.getState().updateNode(String(node.id || ''), { images });
      commit();
      bridge.openOutputLightbox(node, url);
    },
    async prepareVideoMedia(nodeId, action, value) {
      const snapshot = store.getState().document;
      if (!snapshot) return;
      const result = await bridge.prepareVideoMedia(nodeId, snapshot, action, value);
      store.getState().projectDocument(result);
      commit();
    },
    rerunFromOutputMeta(meta) {
      const run = meta.run && typeof meta.run === 'object' ? meta.run as Record<string, unknown> : {};
      const base = run.node && typeof run.node === 'object' ? structuredClone(run.node as Record<string, unknown>) : {};
      const type = String(base.type || run.nodeType || '');
      const allowed = ['comfy', 'generator', 'llm', 'ltxDirector', 'msgen', 'video'] as const;
      if (!allowed.includes(type as typeof allowed[number])) return;
      const generatorId = store.getState().addNode(type as typeof allowed[number]);
      if (!generatorId) return;
      const { id: _id, inputs: _inputs, running: _running, type: _type, x: _x, y: _y, ...settings } = base;
      store.getState().updateNode(generatorId, { ...settings, runStatus: undefined, runError: '' });
      const generator = store.getState().document?.nodes.find((node) => node.id === generatorId);
      const prompt = String(run.prompt || '');
      if (prompt) {
        const promptId = store.getState().addNode('prompt', { x: Number(generator?.x || 0) - 340, y: Number(generator?.y || 0) });
        if (promptId) {
          store.getState().updateNode(promptId, { text: prompt });
          store.getState().connectNodes(promptId, generatorId);
        }
      }
      const refs = Array.isArray(run.refs) ? run.refs as Array<Record<string, unknown>> : [];
      refs.slice(0, 8).forEach((ref, index) => {
        if (!ref.url) return;
        const imageId = store.getState().addNode('image', { x: Number(generator?.x || 0) - 340, y: Number(generator?.y || 0) + 110 + index * 86 });
        if (!imageId) return;
        store.getState().updateNode(imageId, { mediaKind: ref.kind || 'image', name: ref.name || 'image', url: ref.url });
        store.getState().connectNodes(imageId, generatorId);
      });
      commit();
    },
    async runNode(nodeId, mode) {
      const snapshot = store.getState().document;
      if (!snapshot) return;
      const result = await bridge.runNode(nodeId, snapshot, mode);
      store.getState().projectDocument(result);
    },
    updateNode(nodeId, patch) {
      if (!store.getState().document?.nodes.some((node) => node.id === nodeId)) return false;
      store.getState().updateNode(nodeId, patch);
      commit();
      return true;
    },
  };
  root.render(<CanvasBoardV2 commit={commit} store={store} />);
  legacyBoard.hidden = true;
  element.hidden = false;
  return () => {
    disposed = true;
    if (previousBoardApi) window.CanvasBoardV2 = previousBoardApi;
    else delete window.CanvasBoardV2;
    window.removeEventListener('canvas-legacy-document', adopt);
    window.removeEventListener('canvas-legacy-execution-document', projectExecution);
    root.unmount();
    element.hidden = true;
    legacyBoard.hidden = legacyHidden;
  };
}
