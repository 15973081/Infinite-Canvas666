import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { decodeCanvasDocument } from '../domain/document-codec';
import { mergeCanvasDocuments } from '../domain/document-merge';
import { createGraphModel } from '../domain/graph';
import type { CanvasRuntime } from '../application/modern-canvas-runtime';
import type { CanvasDocument, CanvasEdge, CanvasNode } from '../domain/types';
import { CanvasConflictError, canvasDocumentSavePayload, type CanvasRepository } from '../infrastructure/canvas-repository';
import { createDocumentStore, type DocumentStore } from '../stores/document-store';
import { ImageTransformDialog, type ImageTransformResult } from './image-transform-dialog';
import { LegacyImageTransformDialog, type LegacyGridResult, type LegacyImageTransformResult, type LegacyMaskResult } from './legacy-image-transform-dialog';
import { LegacyOutputLightbox } from './legacy-output-lightbox';
import { SmartCanvasComposer } from './smart-canvas-composer';
import { SmartCanvasConnections, type SmartCanvasPortDrag } from './smart-canvas-connections';
import { SmartCanvasCreateMenu, type SmartCanvasCreateType } from './smart-canvas-create-menu';
import { SmartCanvasImageEditor, type SmartCanvasImageEditMode, type SmartVideoFrameResult } from './smart-canvas-image-editor';
import { SmartCanvasMinimap } from './smart-canvas-minimap';
import { SmartCanvasPromptPreset } from './smart-canvas-prompt-preset';
import { SmartCanvasPromptTemplate } from './smart-canvas-prompt-template';
import { SmartCanvasPreview } from './smart-canvas-preview';
import { SmartImageNode, smartImageItems, smartImageNodeLayout } from './smart-image-node';
import { SmartLoopNode, smartLoopImagesForRound, smartLoopNodeLayout, smartLoopPromptForRound } from './smart-loop-node';
import { SmartPromptNode, smartPromptNodeLayout, type SmartPromptProvider } from './smart-prompt-node';

type Point = { x: number; y: number };
type Viewport = Point & { zoom: number };
type SelectionRect = { height: number; left: number; top: number; width: number };

const WORLD_WIDTH = 6000;
const WORLD_HEIGHT = 4000;
const VIEWPORT_STORAGE_KEY = 'canvas_session_viewports_v1';

const createMenuNodes = [
  ['image', '上传节点', 'image-plus'], ['prompt', '提示词', 'text-cursor-input'], ['loop', '循环节点', 'repeat-2'],
  ['llm', 'LLM 节点', 'message-square-text'], ['generator', 'API生成', 'wand-sparkles'], ['msgen', 'ModelScope生成', 'cloud-lightning'],
  ['video', '视频生成', 'clapperboard'], ['comfy', 'ComfyUI 生成', 'workflow'], ['ltxDirector', 'LTX Director', 'film'], ['output', 'Output', 'circle-dot'],
] as const;

const nodeRegistry: Record<string, string> = {
  'smart-image': 'Image',
  comfy: 'ComfyUI', generator: 'API 生成', group: '分组', image: '上传', llm: 'LLM', loop: '循环',
  ltxDirector: 'LTX Director', msgen: 'ModelScope', output: 'Output', prompt: '提示词', promptGroup: '提示词组', video: '视频',
};

function runtime(): CanvasRuntime | null {
  return window.CanvasModernCore?.canvasRuntime ?? null;
}

function nodePoint(node: CanvasNode): Point {
  return { x: Number(node.x || 0), y: Number(node.y || 0) };
}

function loadViewport(documentId: string): Viewport {
  try {
    const values = JSON.parse(sessionStorage.getItem(VIEWPORT_STORAGE_KEY) || '{}') as Record<string, Partial<Viewport>>;
    const saved = values[documentId];
    if (!saved) return { x: 0, y: 0, zoom: 1 };
    return {
      x: Number.isFinite(Number(saved.x)) ? Number(saved.x) : 0,
      y: Number.isFinite(Number(saved.y)) ? Number(saved.y) : 0,
      zoom: Math.min(1.5, Math.max(0.25, Number(saved.zoom || 1))),
    };
  } catch {
    return { x: 0, y: 0, zoom: 1 };
  }
}

function persistViewport(documentId: string, viewport: Viewport): void {
  if (!documentId) return;
  try {
    const values = JSON.parse(sessionStorage.getItem(VIEWPORT_STORAGE_KEY) || '{}') as Record<string, Viewport>;
    values[documentId] = viewport;
    sessionStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Session viewport persistence is best-effort, matching the legacy fallback behavior.
  }
}

function intersects(a: { height: number; width: number; x: number; y: number }, b: { height: number; width: number; x: number; y: number }): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function nodeSize(node: CanvasNode): { height: number; width: number } {
  if (node.type === 'smart-image') {
    const layout = smartImageNodeLayout(node);
    return { height: layout.height, width: layout.width };
  }
  if (node.type === 'prompt') {
    const layout = smartPromptNodeLayout(node);
    return { height: layout.height, width: layout.width };
  }
  if (node.type === 'loop') return smartLoopNodeLayout(node);
  const defaults = node.type === 'image' ? { height: 336, width: 260 }
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
  return ['generator', 'comfy', 'ltxDirector', 'output', 'llm', 'msgen', 'smart-image', 'video'].includes(node.type)
    || (node.type === 'loop' && (Boolean(node.imageInput) || Boolean(node.showPrompt)));
}

function canOutput(node: CanvasNode): boolean {
  return ['image', 'prompt', 'loop', 'group', 'promptGroup', 'generator', 'comfy', 'ltxDirector', 'llm', 'msgen', 'smart-image', 'video', 'output'].includes(node.type);
}

function smartImageGeneratorView(node: CanvasNode): CanvasNode {
  const settings = node.runSettings && typeof node.runSettings === 'object' ? node.runSettings as Record<string, unknown> : {};
  const engine = String(settings.engine || 'api');
  const type = engine === 'modelscope' ? 'msgen' : engine === 'comfy' ? 'comfy' : String(settings.apiKind || settings.kind || 'image') === 'video' ? 'video' : 'generator';
  return {
    ...settings,
    id: node.id,
    type,
    apiProvider: settings.apiProvider || settings.provider_id || settings.providerId || '',
    model: settings.model || '',
    ratio: settings.ratio || settings.apiRatio || 'square',
    resolution: settings.resolution || settings.apiResolution || '1k',
    running: node.running,
  };
}

function PromptBody({ commit, node, onOpenPreset, onOpenTemplate, store }: { commit: () => void; node: CanvasNode; onOpenPreset?: (nodeId: string) => void; onOpenTemplate?: (nodeId: string) => void; store: DocumentStore }) {
  const text = String(node.text || '');
  return <div className="prompt-editor" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <div className="prompt-toolbar">
      <button className="prompt-template-btn prompt-preset-edit" onClick={() => onOpenTemplate ? onOpenTemplate(node.id) : window.CanvasBoardV2?.openPromptTemplates(node.id)} type="button">模板</button>
      {onOpenPreset ? <button className="prompt-template-btn prompt-preset-save" onClick={() => onOpenPreset(node.id)} type="button">预设</button> : null}
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
    if (source.type === 'smart-image') return smartImageItems(source).map((item) => ({ ...item, kind: String(item.kind || 'image'), name: String(item.name || ''), url: String(item.url || '') }));
    if (source.type === 'group' && Array.isArray(source.items)) return source.items.map((id) => byId.get(String(id))).filter((item) => item?.type === 'image' && item.url).map((item) => ({ kind: String(item!.mediaKind || 'image'), name: String(item!.name || ''), url: String(item!.url) }));
    return [];
  });
}

function connectedPrompts(document: { connections: CanvasEdge[]; nodes: CanvasNode[] }, node: CanvasNode): string[] {
  const byId = new Map(document.nodes.map((item) => [item.id, item]));
  return document.connections.filter((edge) => edge.to === node.id).map((edge) => byId.get(edge.from)).filter(Boolean).flatMap((source) => {
    if (source?.type === 'prompt') return String(source.text || '').trim() ? [String(source.text).trim()] : [];
    if (source?.type === 'loop') return smartLoopPromptForRound(source, [], Math.max(1, Number(source.loopStart || 1))) || [];
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
  const providerOptions = (runtime()?.getNodeOptions('generator', 'provider', node) ?? []).map((item) => [item.value, item.label] as const);
  const modelOptions = (runtime()?.getNodeOptions('generator', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
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
        const models = runtime()?.getNodeOptions('generator', 'model', { ...node, apiProvider }) ?? [];
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
  const models = (runtime()?.getNodeOptions('msgen', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
  const customModels = (runtime()?.getNodeOptions('msgen', 'custom-model', node) ?? []).map((item) => [item.value, item.label] as const);
  const loras = runtime()?.getNodeOptions('msgen', 'lora', node) ?? [];
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
    const sourceId = String((item.run as Record<string, any> | undefined)?.node?.id || item.nodeId || '');
    store.getState().updateNode(node.id, { _pending: pending.filter((candidate) => candidate !== item) });
    commit();
    if (sourceId) void window.CanvasBoardV2?.runNode(sourceId);
  };
  return <div className="output-grid" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>{images.map((item, index) => {
    const url = urlOf(item);
    const kind = String((item as { kind?: unknown })?.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|m4a)(\?|$)/i.test(url) ? 'audio' : 'image'));
    const name = String((item as Record<string, unknown>).name || url.split(/[?#]/, 1)[0].split('/').pop() || `生成结果 ${index + 1}`);
    return <div className="output-img-wrap" data-output-url={url} key={`${url}-${index}`}>
      {kind === 'video' ? <video controls onDoubleClick={() => open(url)} preload="metadata" src={url} /> : kind === 'audio' ? <audio controls preload="metadata" src={url} /> : <img alt="generated output" draggable onClick={() => open(url)} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-canvas-output-image', JSON.stringify({ kind, name, url })); event.dataTransfer.setData('text/uri-list', url); }} src={url} />}
      <button aria-label="保存到资产库" className="output-save" onClick={() => window.openCanvasAssetLibrary?.({ saveItem: { kind, name, url } })} type="button">存</button><a className="output-download" download href={url} onClick={(event) => event.stopPropagation()}>↓</a><button aria-label="删除输出" className="output-del" onClick={() => remove(url)} type="button">×</button>
    </div>;
  })}{pending.map((item, index) => {
    const recoveryStatus = String(item.recoveryStatus || '');
    const actionable = Boolean(item.failed) || ['interrupted', 'failed', 'cancelled'].includes(recoveryStatus);
    const label = recoveryStatus === 'recovering' ? '正在恢复任务…'
      : recoveryStatus === 'interrupted' ? '任务追踪已中断'
        : recoveryStatus === 'cancelled' ? '任务已取消'
          : recoveryStatus === 'failed' ? String(item.recoveryError || '任务失败')
            : String(item.label || item.status || '正在生成…');
    return <div className={`output-pending ${actionable ? 'failed' : ''}`} data-pending-id={String(item.id || '')} key={String(item.id || index)}><span className="pending-spinner" /><span>{label}</span>{item.canvasTaskId ? <small>{String(item.canvasTaskId)}</small> : null}{actionable ? <button onClick={() => retry(item)} type="button">重新生成</button> : null}</div>;
  })}</div>;
}

function VideoBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const [manualUrl, setManualUrl] = useState(String(node.manualVideoUrl || (Array.isArray(node.manualVideoUrls) ? node.manualVideoUrls[0] : '') || ''));
  const [preparing, setPreparing] = useState(false);
  const update = (patch: Record<string, unknown>) => { store.getState().updateNode(node.id, patch); commit(); };
  const providers = (runtime()?.getNodeOptions('video', 'provider', node) ?? []).map((item) => [item.value, item.label] as const);
  const models = (runtime()?.getNodeOptions('video', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
  const toggles = [['enhancePrompt', '增强提示词'], ['enableUpsample', '超分辨率'], ['watermark', '水印'], ['cameraFixed', '固定镜头'], ['generateAudio', '生成音频'], ['multimodal', '多模态'], ['useFrameRoles', '首尾帧']] as const;
  return <div className="generator-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <InputSummary document={document} node={node} />
    <div className="video-input-actions"><input aria-label="视频手动 URL" className="setting-input" onChange={(event) => setManualUrl(event.target.value)} placeholder="https://… 或 asset://…" value={manualUrl} /><button className="tool-btn" disabled={preparing} onClick={async () => { setPreparing(true); try { await window.CanvasBoardV2?.prepareVideoMedia(node.id, 'manual', manualUrl); } catch (error) { window.alert(error instanceof Error ? error.message : String(error)); } finally { setPreparing(false); } }} type="button">应用网址</button><button className="tool-btn" disabled={preparing} onClick={async () => { setPreparing(true); try { await window.CanvasBoardV2?.prepareVideoMedia(node.id, 'cloud'); } catch (error) { window.alert(error instanceof Error ? error.message : String(error)); } finally { setPreparing(false); } }} type="button">{preparing ? '处理中…' : '上传云端'}</button></div>
    <div className="gen-settings"><div className="gen-settings-row">
      <SelectField ariaLabel="视频平台" onChange={(apiProvider) => {
        const next = runtime()?.getNodeOptions('video', 'model', { ...node, apiProvider }) ?? [];
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
  const providers = (runtime()?.getNodeOptions('llm', 'provider', node) ?? []).map((item) => [item.value, item.label] as const);
  const models = (runtime()?.getNodeOptions('llm', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
  const messages = Array.isArray(node.messages) ? node.messages as Array<{ content?: string; role?: string }> : [];
  return <div className="llm-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <div className="llm-row"><SelectField ariaLabel="LLM 平台" onChange={(llmProvider) => {
      const next = runtime()?.getNodeOptions('llm', 'model', { ...node, llmProvider }) ?? [];
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
    void (runtime()?.getComfyFields(workflow) ?? Promise.resolve([])).then((items) => { if (active) setFields(items as ComfyField[]); });
    return () => { active = false; };
  }, [node.mode, workflow]);
  const update = (patch: Record<string, unknown>) => { store.getState().updateNode(node.id, patch); commit(); };
  const params = node.comfyParams && typeof node.comfyParams === 'object' ? node.comfyParams as Record<string, unknown> : {};
  const randomActive = node.comfyRandomActive && typeof node.comfyRandomActive === 'object' ? node.comfyRandomActive as Record<string, unknown> : {};
  const settingFields = fields.filter((field) => comfyFieldKind(field) === 'setting');
  const mediaFields = fields.filter((field) => ['audio', 'image', 'video'].includes(comfyFieldKind(field)));
  const workflows = (runtime()?.getNodeOptions('comfy', 'workflow', node) ?? []).map((item) => [item.value, item.label] as const);
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

function ImageBody({ canvasRuntime, commit, node, onEdit, store }: { canvasRuntime: CanvasRuntime; commit: () => void; node: CanvasNode; onEdit(): void; store: DocumentStore }) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  useEffect(() => () => { mediaRef.current?.pause(); mediaRef.current?.removeAttribute('src'); mediaRef.current?.load(); }, []);
  const upload = async (files: File[]) => {
    if (!files.length) return;
    const uploaded = await canvasRuntime.uploadMedia(files);
    const items = uploaded.files ?? [];
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
  const history = Array.isArray(node.imageEditHistory) ? node.imageEditHistory as Array<Record<string, unknown>> : [];
  const kind = String(node.mediaKind || (/\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|m4a)(\?|$)/i.test(url) ? 'audio' : 'image'));
  if (!url) return <label className="blank-image" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>选择或拖入媒体<input accept="image/*,video/*,audio/*" hidden multiple onChange={(event) => void upload([...(event.target.files ?? [])])} type="file" /></label>;
  return <div className="image-preview-wrap" onClick={(event) => event.stopPropagation()} onDoubleClick={() => window.open(url, '_blank', 'noopener')} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload([...event.dataTransfer.files]); }} onPointerDown={(event) => event.stopPropagation()}>
    {kind === 'video' ? <video controls preload="metadata" ref={(element) => { mediaRef.current = element; }} src={url} /> : kind === 'audio' ? <audio controls preload="metadata" ref={(element) => { mediaRef.current = element; }} src={url} /> : <img alt={String(node.name || 'image')} draggable src={url} />}
    <div className="image-caption text-[11px] text-gray-400 truncate">{String(node.name || kind)}</div>
    {kind === 'image' ? <div className="image-edit-actions"><button className="tool-btn" onClick={onEdit} type="button">编辑图片</button>{history.length ? <button className="tool-btn" onClick={() => {
      const previous = history[history.length - 1];
      store.getState().updateNode(node.id, {
        imageEditHistory: history.slice(0, -1),
        mediaKind: previous.kind || 'image',
        name: previous.name || 'image',
        url: previous.url || '',
        ...(previous.outpaintSize ? { outpaintSize: previous.outpaintSize } : { outpaintSize: undefined }),
      });
      commit();
    }} type="button">恢复上版</button> : null}{node.editOriginalUrl ? <a href={String(node.editOriginalUrl)} rel="noreferrer" target="_blank">查看原图</a> : null}</div> : null}
    <button aria-label="清空媒体" className="output-del" onClick={() => { store.getState().updateNode(node.id, { url: '', name: '空白图片', mediaKind: 'image' }); commit(); }} type="button">×</button>
  </div>;
}

function GroupBody({ node, nodesById }: { node: CanvasNode; nodesById: Map<string, CanvasNode> }) {
  const items = Array.isArray(node.items) ? node.items.map((id) => nodesById.get(String(id))).filter(Boolean) as CanvasNode[] : [];
  const media = items.filter((item) => item.type === 'image' && item.url);
  return <div><div className="text-[11px] text-gray-400">{media.length} 个媒体 · {items.filter((item) => item.type === 'prompt').length} 个提示词</div>{media.length ? <div className="output-grid">{media.slice(0, 6).map((item) => <img alt={String(item.name || 'media')} key={item.id} onDoubleClick={() => window.open(String(item.url), '_blank', 'noopener')} src={String(item.url)} />)}</div> : null}</div>;
}

function LTXBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const update = (patch: Record<string, unknown>) => {
    store.getState().updateNode(node.id, patch);
    commit();
  };
  const normalized = runtime()?.normalizeLtxNode(node) ?? node;
  return <div className="ltx-director-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <InputSummary document={document} node={node} />
    <textarea aria-label="LTX 全局提示词" className="setting-input" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { globalPrompt: event.target.value })} placeholder="全局提示词" value={String(node.globalPrompt || '')} />
    <div className="ltx-params-row"><input aria-label="LTX 秒数" className="setting-input" min="0.1" onChange={(event) => update({ durationSeconds: Math.max(0.1, Number(event.target.value) || 5), durationFrames: Math.max(1, Math.round((Number(event.target.value) || 5) * Number(node.frameRate || 24))) })} step="0.01" type="number" value={Number(node.durationSeconds || 5)} /><input aria-label="LTX 帧数" className="setting-input" min="1" onChange={(event) => update({ durationFrames: Math.max(1, Number(event.target.value) || 120), durationSeconds: (Math.max(1, Number(event.target.value) || 120) / Number(node.frameRate || 24)) })} type="number" value={Number(node.durationFrames || 120)} /><input aria-label="LTX FPS" className="setting-input" min="1" onChange={(event) => update({ frameRate: Math.max(1, Number(event.target.value) || 24) })} type="number" value={Number(node.frameRate || 24)} /><input aria-label="LTX 宽度" className="setting-input" min="0" onChange={(event) => update({ customWidth: Math.max(0, Number(event.target.value) || 0) })} step="32" type="number" value={Number(node.customWidth || 0)} /><input aria-label="LTX 高度" className="setting-input" min="0" onChange={(event) => update({ customHeight: Math.max(0, Number(event.target.value) || 0) })} step="32" type="number" value={Number(node.customHeight || 0)} /></div>
    <div className="ltx-params-row"><SelectField ariaLabel="LTX 时间显示" onChange={(displayMode) => update({ displayMode })} options={[['seconds', '秒'], ['frames', '帧']]} value={String(node.displayMode || 'seconds')} /><button className={`setting-check ${node.useCustomAudio ? 'active' : ''}`} onClick={() => update({ useCustomAudio: !node.useCustomAudio })} type="button">自定义音频</button><input aria-label="LTX 图片压缩" className="setting-input" max="100" min="0" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { imgCompression: Number(event.target.value) })} type="number" value={Number(node.imgCompression ?? 18)} /><input aria-label="LTX Epsilon" className="setting-input" min="0" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { epsilon: Number(event.target.value) })} step="0.0001" type="number" value={Number(node.epsilon ?? 0.001)} /><input aria-label="LTX Divisible By" className="setting-input" min="1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { divisibleBy: Math.max(1, Number(event.target.value) || 32) })} type="number" value={Number(node.divisibleBy || 32)} /><input aria-label="LTX Noise Seed" className="setting-input" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { noiseSeed: Number(event.target.value) })} type="number" value={Number(node.noiseSeed ?? 12)} /></div>
    <LtxTimelineEditor commit={commit} node={normalized} store={store} />
    <ExecutionControls document={document} node={node} />
  </div>;
}

type LtxSegment = { guideStrength?: number; id: string; imageB64?: string; imageFile?: string; length: number; prompt: string; start: number; type: 'image' | 'text' };
type LtxAudioSegment = { id: string; length: number; name?: string; start: number; url: string };

function LtxTimelineEditor({ commit, node, store }: { commit: () => void; node: CanvasNode; store: DocumentStore }) {
  let timeline: { audioSegments: LtxAudioSegment[]; segments: LtxSegment[] };
  try {
    const parsed = JSON.parse(String(node.ltxTimelineData || '{}')) as Partial<typeof timeline>;
    timeline = { audioSegments: Array.isArray(parsed.audioSegments) ? parsed.audioSegments as LtxAudioSegment[] : [], segments: Array.isArray(parsed.segments) ? parsed.segments as LtxSegment[] : [] };
  } catch { timeline = { audioSegments: [], segments: [] }; }
  const save = (next: typeof timeline) => { store.getState().updateNode(node.id, { ltxTimelineData: JSON.stringify(next) }); commit(); };
  const updateSegment = (index: number, patch: Partial<LtxSegment>) => save({ ...timeline, segments: timeline.segments.map((segment, itemIndex) => itemIndex === index ? { ...segment, ...patch } : segment) });
  const updateAudio = (index: number, patch: Partial<LtxAudioSegment>) => save({ ...timeline, audioSegments: timeline.audioSegments.map((segment, itemIndex) => itemIndex === index ? { ...segment, ...patch } : segment) });
  const upload = async (file: File, apply: (media: { name?: string; url?: string }) => void) => {
    const media = (await runtime()?.uploadMedia([file]))?.files?.[0];
    if (media?.url) apply(media);
  };
  return <div className="ltx-director-timeline-host canvas-modern-timeline" data-testid="ltx-timeline-editor">
    <header><strong>时间线</strong><button onClick={() => save({ ...timeline, segments: [...timeline.segments, { id: `segment_${crypto.randomUUID?.() || Date.now()}`, start: timeline.segments.reduce((max, item) => Math.max(max, Number(item.start) + Number(item.length)), 0), length: 24, prompt: '', type: 'text' }] })} type="button">添加片段</button></header>
    {timeline.segments.map((segment, index) => <div className="canvas-modern-segment" key={segment.id || index}>
      <select aria-label={`片段 ${index + 1} 类型`} onChange={(event) => updateSegment(index, { type: event.target.value as LtxSegment['type'] })} value={segment.type || 'text'}><option value="text">文本</option><option value="image">图片</option></select>
      <input aria-label={`片段 ${index + 1} 起始帧`} min="0" onChange={(event) => updateSegment(index, { start: Math.max(0, Number(event.target.value) || 0) })} type="number" value={Number(segment.start || 0)} />
      <input aria-label={`片段 ${index + 1} 长度`} min="1" onChange={(event) => updateSegment(index, { length: Math.max(1, Number(event.target.value) || 1) })} type="number" value={Number(segment.length || 1)} />
      <input aria-label={`片段 ${index + 1} 提示词`} onChange={(event) => updateSegment(index, { prompt: event.target.value })} placeholder="片段提示词" value={segment.prompt || ''} />
      {segment.type === 'image' ? <><input aria-label={`片段 ${index + 1} 图片`} onChange={(event) => updateSegment(index, { imageB64: event.target.value, imageFile: '' })} placeholder="图片 URL" value={segment.imageB64 || segment.imageFile || ''} /><label className="tool-btn">上传<input accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, (media) => updateSegment(index, { imageB64: media.url, imageFile: '' })); }} type="file" /></label><input aria-label={`片段 ${index + 1} 引导强度`} max="2" min="0" onChange={(event) => updateSegment(index, { guideStrength: Number(event.target.value) })} step="0.05" type="number" value={Number(segment.guideStrength ?? 1)} /></> : null}
      <button aria-label={`删除片段 ${index + 1}`} onClick={() => save({ ...timeline, segments: timeline.segments.filter((_, itemIndex) => itemIndex !== index) })} type="button">×</button>
    </div>)}
    <div className="canvas-modern-audio-row"><span>音频片段 {timeline.audioSegments.length}</span><button onClick={() => save({ ...timeline, audioSegments: [...timeline.audioSegments, { id: `audio_${crypto.randomUUID?.() || Date.now()}`, start: 0, length: 24, url: '' }] })} type="button">添加音频</button></div>
    {timeline.audioSegments.map((segment, index) => <div className="canvas-modern-segment canvas-modern-audio-segment" key={segment.id || index}>
      <input aria-label={`音频 ${index + 1} 起始帧`} min="0" onChange={(event) => updateAudio(index, { start: Math.max(0, Number(event.target.value) || 0) })} type="number" value={Number(segment.start || 0)} />
      <input aria-label={`音频 ${index + 1} 长度`} min="1" onChange={(event) => updateAudio(index, { length: Math.max(1, Number(event.target.value) || 1) })} type="number" value={Number(segment.length || 1)} />
      <input aria-label={`音频 ${index + 1} URL`} onChange={(event) => updateAudio(index, { url: event.target.value })} placeholder="音频 URL" value={segment.url || ''} />
      <label className="tool-btn">上传<input accept="audio/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, (media) => updateAudio(index, { name: media.name, url: String(media.url || '') })); }} type="file" /></label>
      <button aria-label={`删除音频 ${index + 1}`} onClick={() => save({ ...timeline, audioSegments: timeline.audioSegments.filter((_, itemIndex) => itemIndex !== index) })} type="button">×</button>
    </div>)}
  </div>;
}

function CanvasBoardV2({ canvasRuntime, commit, initialReadOnly = false, legacyUi = false, onSelectionChange, smartUi = false, store }: { canvasRuntime: CanvasRuntime; commit: () => void; initialReadOnly?: boolean; legacyUi?: boolean; onSelectionChange?: (ids: Set<string>) => void; smartUi?: boolean; store: DocumentStore }) {
  const document = useStore(store, ({ document }) => document);
  const documentId = String(document?.id || '');
  const boardRef = useRef<HTMLDivElement | null>(null);
  const clipboard = useRef<{ connections: CanvasEdge[]; nodes: CanvasNode[] } | null>(null);
  const rSelectionKey = useRef(false);
  const [connectingFrom, setConnectingFrom] = useState('');
  const [portDrag, setPortDrag] = useState<SmartCanvasPortDrag | null>(null);
  const [selectedEdge, setSelectedEdge] = useState(-1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState('ready');
  const [lightbox, setLightbox] = useState<{ nodeId: string; url: string } | null>(null);
  const [smartImageEditor, setSmartImageEditor] = useState<{ imageIndex: number; mode: SmartCanvasImageEditMode; nodeId: string } | null>(null);
  const [imageEditorNodeId, setImageEditorNodeId] = useState('');
  const [readOnly, setReadOnly] = useState(initialReadOnly);
  const [viewport, setViewport] = useState<Viewport>(() => legacyUi ? loadViewport(documentId) : { x: 0, y: 0, zoom: 1 });
  const [boardSize, setBoardSize] = useState({ height: 0, width: 0 });
  const [createMenu, setCreateMenu] = useState<{ left: number; point: Point; top: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [promptPresetNodeId, setPromptPresetNodeId] = useState('');
  const [promptTemplateTarget, setPromptTemplateTarget] = useState<{
    initialText: string;
    nodeId?: string;
    onApply?: (text: string) => void;
    target: 'composer' | 'node';
  } | null>(null);
  const nodesById = new Map((document?.nodes ?? []).map((node) => [node.id, node]));
  const boardDocument = { connections: document?.connections ?? [], nodes: document?.nodes ?? [] };
  const connectionGraph = document ? createGraphModel(document) : null;

  useEffect(() => {
    setConnectingFrom('');
    setPortDrag(null);
    setSelectedEdge(-1);
    setSelectedIds(new Set());
    setCreateMenu(null);
    setPromptPresetNodeId('');
    setPromptTemplateTarget(null);
    setViewport(legacyUi ? loadViewport(documentId) : { x: 0, y: 0, zoom: 1 });
  }, [documentId, legacyUi]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const update = () => setBoardSize({ height: board.clientHeight, width: board.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() === 'r' && !target?.isContentEditable && !target?.matches('input, textarea, select')) rSelectionKey.current = true;
    };
    const keyup = (event: KeyboardEvent) => { if (event.key.toLowerCase() === 'r') rSelectionKey.current = false; };
    const blur = () => { rSelectionKey.current = false; };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const listener = (event: Event) => setReadOnly(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener('canvas-board-v2-readonly', listener);
    return () => window.removeEventListener('canvas-board-v2-readonly', listener);
  }, []);
  useEffect(() => { if (readOnly) setImageEditorNodeId(''); }, [readOnly]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target?.isContentEditable || target?.matches('input, textarea, select');
      if (event.key === 'Escape') {
        setConnectingFrom('');
        setPortDrag(null);
        setSelectedEdge(-1);
        setSelectedIds(new Set());
        setCreateMenu(null);
        setSelectionRect(null);
        return;
      }
      if (readOnly) return;
      if (editable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) window.CanvasBoardV2?.redo();
        else window.CanvasBoardV2?.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        window.CanvasBoardV2?.redo();
        return;
      }
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
  }, [commit, readOnly, selectedEdge, selectedIds, store]);

  useEffect(() => {
    const group = () => {
      if (readOnly) return;
      const selected = store.getState().document?.nodes.filter((node) => selectedIds.has(node.id)) ?? [];
      const id = selected.some((node) => node.type === 'image') ? store.getState().groupNodes([...selectedIds]) : store.getState().groupPromptNodes([...selectedIds]);
      if (id) {
        setSelectedIds(new Set([id]));
        commit();
      }
    };
    window.addEventListener('canvas-board-v2-group-selected', group);
    return () => window.removeEventListener('canvas-board-v2-group-selected', group);
  }, [commit, readOnly, selectedIds, store]);

  useEffect(() => {
    const listener = (event: Event) => setSaveState(String((event as CustomEvent<string>).detail || 'ready'));
    window.addEventListener('canvas-board-v2-save-state', listener);
    return () => window.removeEventListener('canvas-board-v2-save-state', listener);
  }, []);

  useEffect(() => {
    const listener = (event: Event) => setLightbox((event as CustomEvent<{ nodeId: string; url: string }>).detail);
    window.addEventListener('canvas-v2-open-lightbox', listener);
    return () => window.removeEventListener('canvas-v2-open-lightbox', listener);
  }, []);

  const connect = (toId: string) => {
    const active = store.getState().document;
    if (connectingFrom && portDrag?.fromPort !== 'in' && active && createGraphModel(active).canConnect(connectingFrom, toId) && store.getState().connectNodes(connectingFrom, toId)) commit();
    setConnectingFrom('');
    setPortDrag(null);
  };

  const startConnection = (fromId: string, fromPort: 'in' | 'out' = 'out') => {
    if (readOnly) return;
    const source = store.getState().document?.nodes.find((node) => node.id === fromId);
    if (!source) return;
    const point = nodePoint(source);
    const size = nodeSize(source);
    setConnectingFrom(fromId);
    setPortDrag({ currentWorld: { x: fromPort === 'out' ? point.x + size.width : point.x, y: point.y + size.height / 2 }, fromId, fromPort });
  };

  useEffect(() => {
    if (!connectingFrom || readOnly || !smartUi) return;
    const board = boardRef.current;
    if (!board) return;
    const shell = board.closest('.shell');
    shell?.classList.add('port-dragging');
    let moved = false;
    const clearHover = () => {
      board.querySelectorAll('.node-port.is-active').forEach((element) => element.classList.remove('is-active'));
      board.querySelectorAll('.image-node.port-hover').forEach((element) => element.classList.remove('port-hover'));
    };
    const hitAt = (clientX: number, clientY: number) => {
      const hit = window.document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      let port = hit?.closest<HTMLElement>('.node-port, [data-port]') || null;
      if (!port) {
        const nearest = [...window.document.querySelectorAll<HTMLElement>('#smartCanvasApp .node-port[data-port]')].map((element) => {
          const rect = element.getBoundingClientRect();
          const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
          return { distance, element };
        }).filter((candidate) => candidate.distance <= 22).sort((left, right) => left.distance - right.distance)[0];
        port = nearest?.element || null;
      }
      const node = (port?.closest<HTMLElement>('.image-node, [data-node-id]') || hit?.closest<HTMLElement>('.image-node, [data-node-id]')) ?? null;
      const id = String(node?.dataset.id || node?.dataset.nodeId || '');
      let targetPort = String(port?.dataset.port || '');
      if (!targetPort && node) {
        const rect = node.getBoundingClientRect();
        targetPort = clientX - rect.left < rect.width / 2 ? 'in' : 'out';
      }
      if (!id || id === connectingFrom || (targetPort !== 'in' && targetPort !== 'out')) return { hit, id: '', port: '' as const, valid: false };
      const fromPort = portDrag?.fromPort || 'out';
      const compatible = (fromPort === 'out' && targetPort === 'in') || (fromPort === 'in' && targetPort === 'out');
      const fromId = fromPort === 'out' ? connectingFrom : id;
      const toId = fromPort === 'out' ? id : connectingFrom;
      const active = store.getState().document;
      return { hit, id, port: targetPort as 'in' | 'out', valid: Boolean(compatible && active && createGraphModel(active).canConnect(fromId, toId)) };
    };
    const move = (event: PointerEvent) => {
      moved = true;
      const rect = board.getBoundingClientRect();
      const currentWorld = { x: (event.clientX - rect.left - viewport.x) / viewport.zoom, y: (event.clientY - rect.top - viewport.y) / viewport.zoom };
      const target = hitAt(event.clientX, event.clientY);
      clearHover();
      if (target.valid) {
        const node = board.querySelector<HTMLElement>(`.image-node[data-id="${CSS.escape(target.id)}"], [data-node-id="${CSS.escape(target.id)}"]`);
        node?.classList.add('port-hover');
        node?.querySelector<HTMLElement>(`[data-port="${target.port}"]`)?.classList.add('is-active');
      }
      setPortDrag((current) => current ? { ...current, currentWorld, hoverPort: target.valid ? target.port : '', hoverTargetId: target.valid ? target.id : '' } : current);
    };
    const up = (event: PointerEvent) => {
      const drag = portDrag;
      const target = hitAt(event.clientX, event.clientY);
      if (target.valid && drag) {
        const fromId = drag.fromPort === 'out' ? drag.fromId : target.id;
        const toId = drag.fromPort === 'out' ? target.id : drag.fromId;
        if (store.getState().connectNodes(fromId, toId)) commit();
      } else if (moved && drag && !target.id && !target.hit?.closest('.composer,.smart-nav,.asset-panel,.create-menu,.smart-minimap,.log-modal,.shortcut-modal,.image-edit-modal')) {
        const rect = board.getBoundingClientRect();
        const point = { x: (event.clientX - rect.left - viewport.x) / viewport.zoom, y: (event.clientY - rect.top - viewport.y) / viewport.zoom };
        const id = store.getState().addNode('smart-image', { x: point.x - 158, y: point.y - 97 });
        if (id) {
          const fromId = drag.fromPort === 'out' ? drag.fromId : id;
          const toId = drag.fromPort === 'out' ? id : drag.fromId;
          if (store.getState().connectNodes(fromId, toId)) commit();
        }
      }
      setConnectingFrom('');
      setPortDrag(null);
      clearHover();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      shell?.classList.remove('port-dragging');
      clearHover();
    };
  }, [commit, connectingFrom, portDrag?.fromPort, readOnly, smartUi, store, viewport]);

  const lightboxNode = lightbox ? nodesById.get(lightbox.nodeId) : null;
  const smartImageEditorNode = smartImageEditor ? nodesById.get(smartImageEditor.nodeId) : null;
  const imageEditorNode = imageEditorNodeId ? nodesById.get(imageEditorNodeId) : null;
  useEffect(() => { onSelectionChange?.(selectedIds); }, [onSelectionChange, selectedIds]);
  useEffect(() => {
    if ((!legacyUi && !smartUi) || !createMenu) return;
    window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons());
  }, [createMenu, legacyUi, smartUi]);

  const centerViewport = (clientX: number, clientY: number) => {
    const minimap = boardRef.current?.querySelector('.minimap-content')?.getBoundingClientRect();
    if (!minimap || !boardSize.width || !boardSize.height) return;
    const world = {
      x: Math.min(WORLD_WIDTH, Math.max(0, ((clientX - minimap.left) / minimap.width) * WORLD_WIDTH)),
      y: Math.min(WORLD_HEIGHT, Math.max(0, ((clientY - minimap.top) / minimap.height) * WORLD_HEIGHT)),
    };
    setViewport((value) => {
      const next = { ...value, x: boardSize.width / 2 - world.x * value.zoom, y: boardSize.height / 2 - world.y * value.zoom };
      persistViewport(documentId, next);
      return next;
    });
  };
  const locateSmartViewport = (point: Point) => {
    setViewport((value) => {
      const next = { ...value, x: boardSize.width / 2 - point.x * value.zoom, y: boardSize.height / 2 - point.y * value.zoom };
      persistViewport(documentId, next);
      return next;
    });
  };
  const createSmartNode = (type: SmartCanvasCreateType) => {
    if (!createMenu || readOnly) return;
    let selectedId = '';
    if (type === 'image') {
      selectedId = store.getState().addNode('smart-image', { x: createMenu.point.x - 158, y: createMenu.point.y - 97 }) || '';
    } else {
      const offset = type === 'prompt' ? { x: 158, y: 97 } : { x: 135, y: 95 };
      selectedId = store.getState().addNode(type, { x: createMenu.point.x - offset.x, y: createMenu.point.y - offset.y }) || '';
    }
    if (selectedId) {
      setSelectedIds(new Set([selectedId]));
      commit();
    }
    setCreateMenu(null);
  };
  const selectedSmartOutput = smartUi && selectedIds.size === 1
    ? (document?.nodes.find((node) => selectedIds.has(node.id) && ['output', 'smart-image'].includes(node.type)) ?? null)
    : null;
  const smartGeneratorForOutput = (output: CanvasNode | null, snapshot = store.getState().document) => {
    if (!output || !snapshot) return null;
    const sourceIds = snapshot.connections.filter((edge) => edge.to === output.id).map((edge) => edge.from);
    return snapshot.nodes.find((node) => sourceIds.includes(node.id) && ['comfy', 'generator', 'msgen', 'video'].includes(node.type)) ?? null;
  };
  const selectedSmartGenerator = selectedSmartOutput?.type === 'smart-image' ? smartImageGeneratorView(selectedSmartOutput) : smartGeneratorForOutput(selectedSmartOutput, document);
  const patchSmartGenerator = (patch: Record<string, unknown>, nextType: 'comfy' | 'generator' | 'msgen' | 'video' = 'generator') => {
    if (!selectedSmartOutput || readOnly) return '';
    if (selectedSmartOutput.type === 'smart-image') {
      const current = selectedSmartOutput.runSettings && typeof selectedSmartOutput.runSettings === 'object' ? selectedSmartOutput.runSettings as Record<string, unknown> : {};
      const engine = nextType === 'msgen' ? 'modelscope' : nextType === 'comfy' ? 'comfy' : 'api';
      store.getState().updateNode(selectedSmartOutput.id, { runSettings: { ...current, ...patch, engine, apiKind: nextType === 'video' ? 'video' : 'image' } });
      commit();
      return selectedSmartOutput.id;
    }
    let snapshot = store.getState().document;
    if (!snapshot) return '';
    let target = smartGeneratorForOutput(selectedSmartOutput, snapshot);
    if (!target) {
      const id = store.getState().addNode(nextType, { x: Number(selectedSmartOutput.x || 0) - 420, y: Number(selectedSmartOutput.y || 0) });
      if (!id) return '';
      store.getState().connectNodes(id, selectedSmartOutput.id);
      snapshot = store.getState().document;
      target = snapshot?.nodes.find((node) => node.id === id) ?? null;
    }
    if (!target) return '';
    if (target.type !== nextType && snapshot) {
      store.getState().projectDocument({ ...snapshot, nodes: snapshot.nodes.map((node) => node.id === target!.id ? { ...node, type: nextType } : node) });
    }
    store.getState().updateNode(target.id, patch);
    commit();
    return target.id;
  };
  const patchSmartOutput = (patch: Record<string, unknown>, save = false) => {
    if (!selectedSmartOutput || readOnly) return;
    store.getState().updateNode(selectedSmartOutput.id, patch);
    if (save) commit();
  };
  const runSmartComposer = (mode: 'cascade' | 'node') => {
    const generatorId = selectedSmartOutput?.type === 'smart-image' ? selectedSmartOutput.id : selectedSmartGenerator?.id || patchSmartGenerator({});
    if (generatorId) void window.CanvasBoardV2?.runNode(generatorId, mode);
  };
  const appendSmartMedia = async (nodeId: string, files: File[]) => {
    if (readOnly || !files.length) return;
    const uploaded = await canvasRuntime.uploadMedia(files);
    const active = store.getState().document?.nodes.find((node) => node.id === nodeId && node.type === 'smart-image');
    if (!active) return;
    const additions = (uploaded.files ?? []).filter((file) => file.url).map((file) => ({ ...file, kind: file.kind || 'image', name: file.name || 'media', url: file.url || '' }));
    if (!additions.length) return;
    const images = [...smartImageItems(active), ...additions];
    store.getState().updateNode(nodeId, { h: undefined, images, scale: images.length > 1 ? 0.8 : Number(active.scale || 2), title: images.length > 1 ? 'Group' : additions[0].kind === 'video' ? 'Video' : additions[0].kind === 'audio' ? 'Audio' : 'Image', w: undefined });
    commit();
  };
  const uploadSmartPng = async (blob: Blob, name: string) => {
    const uploaded = await canvasRuntime.uploadMedia([new File([blob], name, { type: 'image/png' })]);
    const file = uploaded.files?.[0];
    if (!file?.url) throw new Error('图片上传失败');
    return { ...file, kind: 'image', name: file.name || name, url: file.url };
  };
  const createSmartImageOutput = (source: CanvasNode, images: Array<Record<string, unknown> & { url: string }>, title: string, placement: 'centered' | 'split' = 'centered') => {
    const sourceLayout = smartImageNodeLayout(source);
    const scale = images.length > 1 ? 0.8 : 2;
    const outputLayout = smartImageNodeLayout({ id: '', images, scale, type: 'smart-image' } as CanvasNode);
    const point = placement === 'split'
      ? { x: Number(source.x || 0) + sourceLayout.width + 40, y: Number(source.y || 0) }
      : { x: Number(source.x || 0) + sourceLayout.width + 240 - outputLayout.width / 2, y: Number(source.y || 0) + sourceLayout.height / 2 - outputLayout.height / 2 };
    const id = store.getState().addNode('smart-image', point);
    if (!id) throw new Error('无法创建图片节点');
    store.getState().updateNode(id, { h: undefined, images, scale, title, w: undefined });
    setSelectedIds(new Set([id]));
    commit();
    return id;
  };
  const applySmartImageEdit = async (result: LegacyImageTransformResult) => {
    if (readOnly || !smartImageEditor) throw new Error('只读模式不能编辑图片');
    const file = await uploadSmartPng(result.blob, result.name);
    const active = store.getState().document?.nodes.find((node) => node.id === smartImageEditor.nodeId && node.type === 'smart-image');
    if (!active) throw new Error('图片节点已经被移除');
    const images = smartImageItems(active);
    const previous = images[smartImageEditor.imageIndex];
    if (!previous) throw new Error('图片已经被移除');
    images[smartImageEditor.imageIndex] = { ...previous, ...file, natural_h: result.height, natural_w: result.width };
    const patch: Record<string, unknown> = { h: undefined, images, lastImageEdit: { height: result.height, mode: result.mode, width: result.width }, w: undefined };
    if (result.mode === 'outpaint') {
      patch.outpaintSize = { height: result.height, width: result.width };
      patch.runSettings = smartOutpaintSettings(active.runSettings, result.width, result.height);
      patch.promptDraftHtml = 'Remove white area and fill the scene';
      patch.promptDraftText = 'Remove white area and fill the scene';
      patch.promptDraftTouched = true;
    }
    store.getState().updateNode(active.id, patch);
    commit();
  };
  const createSmartMask = async (result: LegacyMaskResult) => {
    if (readOnly || !smartImageEditor) throw new Error('只读模式不能编辑图片');
    const file = await uploadSmartPng(result.blob, result.name);
    const active = store.getState().document?.nodes.find((node) => node.id === smartImageEditor.nodeId && node.type === 'smart-image');
    if (!active) throw new Error('图片节点已经被移除');
    const images = [...smartImageItems(active), { ...file, natural_h: result.height, natural_w: result.width, role: 'mask' }];
    store.getState().updateNode(active.id, { h: undefined, images, scale: images.length > 1 ? 0.8 : Number(active.scale || 2), title: images.length > 1 ? 'Group' : active.title, w: undefined });
    commit();
  };
  const splitSmartGrid = async (result: LegacyGridResult) => {
    if (readOnly || !smartImageEditor) throw new Error('只读模式不能编辑图片');
    const uploaded = await canvasRuntime.uploadMedia(result.items.map((item) => new File([item.blob], item.name, { type: 'image/png' })));
    const active = store.getState().document?.nodes.find((node) => node.id === smartImageEditor.nodeId && node.type === 'smart-image');
    if (!active) throw new Error('图片节点已经被移除');
    const source = smartImageItems(active)[smartImageEditor.imageIndex];
    const images = uploaded.files.slice(0, result.items.length).map((file, index) => ({
      grid: { ...result.layout, ...result.items[index].rect }, kind: file.kind || 'image', name: file.name || result.items[index].name,
      run: { prompt: '宫格切分', refs: source ? [{ name: source.name || 'source image', url: source.url || '' }] : [] }, runMs: 0, url: String(file.url || ''), viewed: false,
    })).filter((item): item is typeof item & { url: string } => Boolean(item.url));
    if (!images.length) throw new Error('切分图片上传结果为空');
    createSmartImageOutput(active, images, 'Grid', 'split');
  };
  const joinSmartGrid = async (result: import('./legacy-image-transform-dialog').LegacyGridJoinResult) => {
    if (readOnly || !smartImageEditor) throw new Error('只读模式不能编辑图片');
    const file = await uploadSmartPng(result.blob, result.name);
    const active = store.getState().document?.nodes.find((node) => node.id === smartImageEditor.nodeId && node.type === 'smart-image');
    if (!active) throw new Error('图片节点已经被移除');
    createSmartImageOutput(active, [{ ...file, natural_h: result.height, natural_w: result.width }], 'Grid Join');
  };
  const exportSmartVideoFrame = async (source: CanvasNode, result: SmartVideoFrameResult) => {
    if (readOnly) throw new Error('只读模式不能导出视频帧');
    const file = await uploadSmartPng(result.blob, result.name);
    createSmartImageOutput(source, [{ ...file, natural_h: result.height, natural_w: result.width }], 'Image');
  };
  const runSmartLoop = async (loop: CanvasNode) => {
    if (loop.running) {
      await window.CanvasBoardV2?.controlExecution('stop-execution', loop.id);
      return;
    }
    try {
      await window.CanvasBoardV2?.runNode(loop.id, 'cascade');
    } catch (error) {
      const toast = window.document.getElementById('toast');
      if (toast) { toast.textContent = error instanceof Error ? error.message : String(error); toast.classList.add('show'); window.setTimeout(() => toast.classList.remove('show'), 1_800); }
    }
  };

  return <div
    aria-label="CanvasBoard V2"
    aria-readonly={readOnly}
    className={`${legacyUi ? 'board' : ''} ${readOnly ? 'canvas-board-v2-readonly' : ''}`.trim() || undefined}
    data-testid="canvas-board-v2"
    data-viewport={`${viewport.x},${viewport.y},${viewport.zoom.toFixed(2)}`}
    onPointerDownCapture={(event) => {
      if (!smartUi || readOnly || event.button !== 0 || connectingFrom) return;
      const port = (event.target as HTMLElement).closest<HTMLElement>('.node-port[data-port]');
      const node = port?.closest<HTMLElement>('.image-node, [data-node-id]');
      const id = String(node?.dataset.id || node?.dataset.nodeId || '');
      const fromPort = port?.dataset.port;
      if (id && (fromPort === 'in' || fromPort === 'out')) startConnection(id, fromPort);
    }}
    onDoubleClick={(event) => {
      if (!smartUi || readOnly) return;
      const target = event.target as HTMLElement;
      if (target.closest('.node, .composer, .create-menu, .smart-minimap, input, textarea, select, button')) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setCreateMenu({
        left: Math.max(14, Math.min(window.innerWidth - 420 - 14, event.clientX + 8)),
        point: { x: (event.clientX - rect.left - viewport.x) / viewport.zoom, y: (event.clientY - rect.top - viewport.y) / viewport.zoom },
        top: Math.max(14, Math.min(window.innerHeight - 286 - 14, event.clientY + 8)),
      });
    }}
    onContextMenu={(event) => {
      if (!legacyUi) return;
      const target = event.target as HTMLElement;
      if (target.closest('.node, .create-menu, .minimap, input, textarea, select, button')) return;
      event.preventDefault();
      if (readOnly) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setCreateMenu({
        left: event.clientX - rect.left,
        point: { x: (event.clientX - rect.left - viewport.x) / viewport.zoom, y: (event.clientY - rect.top - viewport.y) / viewport.zoom },
        top: event.clientY - rect.top,
      });
    }}
    onDragLeave={(event) => { if (legacyUi && !event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false); }}
    onDragOver={(event) => { event.preventDefault(); if (legacyUi && !readOnly) setDropActive(true); }}
    onDrop={(event) => {
      event.preventDefault();
      event.stopPropagation();
      if (legacyUi) setDropActive(false);
      if (readOnly) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const point = { x: (event.clientX - rect.left - viewport.x) / viewport.zoom, y: (event.clientY - rect.top - viewport.y) / viewport.zoom };
      const smartAssetPayload = event.dataTransfer.getData('application/x-smart-asset');
      if (smartAssetPayload) {
        try {
          const media = JSON.parse(smartAssetPayload) as { asset_item_id?: string; asset_uris?: Record<string, string>; kind?: string; name?: string; url?: string };
          if (media.url) {
            const id = store.getState().addNode(smartUi ? 'smart-image' : 'image', point);
            if (id) {
              if (smartUi) store.getState().updateNode(id, { images: [{ asset_item_id: media.asset_item_id, asset_uris: media.asset_uris, kind: media.kind || 'image', name: media.name || 'asset', url: media.url }], scale: 2, title: media.kind === 'video' ? 'Video' : media.kind === 'audio' ? 'Audio' : 'Image' });
              else store.getState().updateNode(id, { mediaKind: media.kind || 'image', name: media.name || 'asset', url: media.url });
              commit();
            }
            return;
          }
        } catch (error) {
          console.warn('[canvas-modern-core] invalid smart asset drag payload', error);
        }
      }
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
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      const board = event.currentTarget;
      if (!legacyUi) {
        if (event.button !== 0) return;
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
        return;
      }
      const boardRect = board.getBoundingClientRect();
      const start = { localX: event.clientX - boardRect.left, localY: event.clientY - boardRect.top, x: event.clientX, y: event.clientY, viewport };
      board.setPointerCapture(event.pointerId);
      setCreateMenu(null);
      setSelectedEdge(-1);
      const selecting = event.button === 0 && (event.ctrlKey || event.metaKey || rSelectionKey.current);
      let moved = false;
      let latestViewport = start.viewport;
      let latestSelection: SelectionRect = { height: 0, left: start.localX, top: start.localY, width: 0 };
      const move = (next: PointerEvent) => {
        moved = moved || Math.hypot(next.clientX - start.x, next.clientY - start.y) > 4;
        if (selecting) {
          const localX = next.clientX - boardRect.left;
          const localY = next.clientY - boardRect.top;
          latestSelection = {
            height: Math.abs(localY - start.localY),
            left: Math.min(localX, start.localX),
            top: Math.min(localY, start.localY),
            width: Math.abs(localX - start.localX),
          };
          setSelectionRect(latestSelection);
          return;
        }
        latestViewport = {
          ...start.viewport,
          x: start.viewport.x + next.clientX - start.x,
          y: start.viewport.y + next.clientY - start.y,
        };
        setViewport(latestViewport);
      };
      const up = () => {
        board.removeEventListener('pointermove', move);
        if (selecting) {
          const worldRect = {
            height: latestSelection.height / start.viewport.zoom,
            width: latestSelection.width / start.viewport.zoom,
            x: (latestSelection.left - start.viewport.x) / start.viewport.zoom,
            y: (latestSelection.top - start.viewport.y) / start.viewport.zoom,
          };
          const ids = (store.getState().document?.nodes ?? []).filter((node) => {
            const point = nodePoint(node);
            const size = nodeSize(node);
            return intersects({ ...point, ...size }, worldRect);
          }).map((node) => node.id);
          setSelectedIds(new Set(ids));
          setSelectionRect(null);
        } else if (moved) persistViewport(documentId, latestViewport);
        else if (event.button === 0) setSelectedIds(new Set());
      };
      board.addEventListener('pointermove', move);
      board.addEventListener('pointerup', up, { once: true });
    }}
    onWheel={(event) => {
      event.preventDefault();
      if (!legacyUi) {
        setViewport((value) => ({ ...value, zoom: Math.min(1.5, Math.max(0.25, value.zoom * (event.deltaY < 0 ? 1.1 : 0.9))) }));
        return;
      }
      setCreateMenu(null);
      const rect = event.currentTarget.getBoundingClientRect();
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setViewport((value) => {
        const world = { x: (local.x - value.x) / value.zoom, y: (local.y - value.y) / value.zoom };
        const zoom = Math.min(1.5, Math.max(0.25, value.zoom * (event.deltaY < 0 ? 1.08 : 0.92)));
        const next = { x: local.x - world.x * zoom, y: local.y - world.y * zoom, zoom };
        persistViewport(documentId, next);
        return next;
      });
    }}
    ref={boardRef}
    style={{
      backgroundColor: legacyUi ? undefined : 'var(--page)',
      backgroundImage: legacyUi ? undefined : 'radial-gradient(var(--grid) 1px, transparent 1px)',
      backgroundSize: legacyUi ? undefined : '24px 24px',
      inset: 0,
      overflow: 'hidden',
      position: 'absolute',
      touchAction: 'none',
    }}
  >
    {legacyUi ? <div className={`drop-overlay ${dropActive ? 'active' : ''}`}>拖放素材到画布</div> : null}
    {legacyUi && selectionRect ? <div className="selection-box" style={{ ...selectionRect, display: 'block' }} /> : null}
    <div aria-live="polite" data-testid="canvas-board-v2-save-status" style={{ position: 'absolute', right: 18, top: 74, zIndex: 20 }}>
      {saveState === 'saving' ? '正在保存' : saveState === 'error' ? '保存失败，本地修改仍保留' : saveState === 'saved' ? '已保存' : ''}
    </div>
    <div className={legacyUi ? 'world' : undefined} style={{ height: legacyUi ? undefined : WORLD_HEIGHT, position: 'absolute', transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: legacyUi ? undefined : '0 0', width: legacyUi ? undefined : WORLD_WIDTH }}>
      {smartUi ? <SmartCanvasConnections
        document={boardDocument}
        drag={portDrag}
        nodeRect={(node) => ({ ...nodePoint(node), ...nodeSize(node) })}
        onCut={(index) => {
          if (readOnly) return;
          store.getState().deleteConnection(index);
          setSelectedEdge(-1);
          commit();
        }}
        onSelect={(index) => { setSelectedEdge(index); setSelectedIds(new Set()); }}
        selectedIndex={selectedEdge}
      /> : <svg className={legacyUi ? 'links' : undefined} height={WORLD_HEIGHT} style={legacyUi ? undefined : { inset: 0, overflow: 'visible', position: 'absolute' }} width={WORLD_WIDTH}>
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
      </svg>}
      {(document?.nodes ?? []).map((node) => {
        const point = nodePoint(node);
        const size = nodeSize(node);
        if (smartUi && node.type === 'smart-image') return <SmartImageNode
          connecting={Boolean(connectingFrom && portDrag?.fromPort === 'out' && connectionGraph?.canConnect(connectingFrom, node.id))}
          key={node.id}
          node={node}
          onAppendFiles={(files) => void appendSmartMedia(node.id, files)}
          onConnectIn={() => connect(node.id)}
          onConnectOut={() => startConnection(node.id)}
          onDelete={() => { store.getState().deleteNode(node.id); setSelectedIds(new Set()); commit(); }}
          onDeleteImage={(index) => {
            const active = store.getState().document?.nodes.find((item) => item.id === node.id);
            if (!active) return;
            const images = smartImageItems(active).filter((_, itemIndex) => itemIndex !== index);
            store.getState().updateNode(node.id, { h: undefined, images, scale: images.length > 1 ? 0.8 : 2, title: images.length > 1 ? 'Group' : images.length ? 'Image' : '上传节点', w: undefined });
            commit();
          }}
          onMoveStart={(event) => {
            if (event.button !== 0 || readOnly || (event.target as HTMLElement).closest('button, audio, video, .node-drop')) return;
            event.stopPropagation();
            const element = event.currentTarget;
            const movingIds = selectedIds.has(node.id) ? new Set(selectedIds) : new Set([node.id]);
            const startPoints = new Map((store.getState().document?.nodes ?? []).filter((item) => movingIds.has(item.id)).map((item) => [item.id, nodePoint(item)]));
            const start = { clientX: event.clientX, clientY: event.clientY };
            let moved = false;
            element.setPointerCapture(event.pointerId);
            if (!selectedIds.has(node.id)) setSelectedIds(movingIds);
            const move = (next: PointerEvent) => {
              moved = true;
              const delta = { x: (next.clientX - start.clientX) / viewport.zoom, y: (next.clientY - start.clientY) / viewport.zoom };
              startPoints.forEach((startPoint, id) => store.getState().moveNode(id, startPoint.x + delta.x, startPoint.y + delta.y));
            };
            const up = () => { element.removeEventListener('pointermove', move); if (moved) commit(); };
            element.addEventListener('pointermove', move);
            element.addEventListener('pointerup', up, { once: true });
          }}
          onPatch={(patch, save = false) => {
            const current = store.getState().document?.nodes.find((item) => item.id === node.id);
            if (!current) return;
            store.getState().updateNode(node.id, typeof patch === 'function' ? patch(current) : patch);
            if (save) commit();
          }}
          onPreview={(url) => setLightbox({ nodeId: node.id, url })}
          onSelect={(event) => {
            setSelectedEdge(-1);
            setSelectedIds((current) => {
              if (!event.ctrlKey && !event.metaKey) return new Set([node.id]);
              const next = new Set(current);
              if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
              return next;
            });
          }}
          readOnly={readOnly}
          selected={selectedIds.has(node.id)}
        />;
        if (smartUi && node.type === 'prompt') {
          const options = runtime()?.getNodeOptions('llm', 'provider', node) ?? [];
          const fallback = { label: String(node.llmProvider || 'comfly'), models: [String(node.llmModel || 'gpt-4o-mini')], value: String(node.llmProvider || 'comfly') };
          const providers: SmartPromptProvider[] = options.length ? options.map((option) => ({
            label: option.label,
            models: (runtime()?.getNodeOptions('llm', 'model', { ...node, llmProvider: option.value }) ?? []).map((item) => item.value),
            value: option.value,
          })) : [fallback];
          return <SmartPromptNode
            connecting={Boolean(connectingFrom && portDrag?.fromPort === 'out' && connectionGraph?.canConnect(connectingFrom, node.id))}
            key={node.id}
            media={connectedMedia(boardDocument, node)}
            node={node}
            onConnectIn={() => connect(node.id)}
            onConnectOut={() => startConnection(node.id)}
            onDelete={() => { store.getState().deleteNode(node.id); setSelectedIds(new Set()); commit(); }}
            onMoveStart={(event) => {
              if (event.button !== 0 || readOnly || (event.target as HTMLElement).closest('button, textarea, select, .node-port, .prompt-llm-instruction-resize')) return;
              event.stopPropagation();
              const element = event.currentTarget;
              const movingIds = selectedIds.has(node.id) ? new Set(selectedIds) : new Set([node.id]);
              const startPoints = new Map((store.getState().document?.nodes ?? []).filter((item) => movingIds.has(item.id)).map((item) => [item.id, nodePoint(item)]));
              const start = { clientX: event.clientX, clientY: event.clientY };
              let moved = false;
              element.setPointerCapture(event.pointerId);
              if (!selectedIds.has(node.id)) setSelectedIds(movingIds);
              const move = (next: PointerEvent) => {
                moved = true;
                const delta = { x: (next.clientX - start.clientX) / viewport.zoom, y: (next.clientY - start.clientY) / viewport.zoom };
                startPoints.forEach((startPoint, id) => store.getState().moveNode(id, startPoint.x + delta.x, startPoint.y + delta.y));
              };
              const up = () => { element.removeEventListener('pointermove', move); if (moved) commit(); };
              element.addEventListener('pointermove', move);
              element.addEventListener('pointerup', up, { once: true });
            }}
            onOpenTemplate={() => setPromptTemplateTarget({ initialText: String(node.text || ''), nodeId: node.id, target: 'node' })}
            onOpenPreset={() => setPromptPresetNodeId(node.id)}
            onPatch={(patch, save = false) => { store.getState().updateNode(node.id, patch); if (save) commit(); }}
            onRun={() => window.CanvasBoardV2?.runNode(node.id)}
            onSelect={(event) => {
              setSelectedEdge(-1);
              setSelectedIds((current) => {
                if (!event.ctrlKey && !event.metaKey) return new Set([node.id]);
                const next = new Set(current);
                if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                return next;
              });
            }}
            providers={providers}
            readOnly={readOnly}
            selected={selectedIds.has(node.id)}
          />;
        }
        if (smartUi && node.type === 'loop') return <SmartLoopNode
          connecting={Boolean(connectingFrom && portDrag?.fromPort === 'out' && connectionGraph?.canConnect(connectingFrom, node.id))}
          key={node.id}
          media={connectedMedia(boardDocument, node)}
          node={node}
          onConnectIn={() => connect(node.id)}
          onConnectOut={() => startConnection(node.id)}
          onDelete={() => { store.getState().deleteNode(node.id); setSelectedIds(new Set()); commit(); }}
          onMoveStart={(event) => {
            if (event.button !== 0 || readOnly || (event.target as HTMLElement).closest('button, input, [contenteditable="true"], .node-port')) return;
            event.stopPropagation();
            const element = event.currentTarget;
            const movingIds = selectedIds.has(node.id) ? new Set(selectedIds) : new Set([node.id]);
            const startPoints = new Map((store.getState().document?.nodes ?? []).filter((item) => movingIds.has(item.id)).map((item) => [item.id, nodePoint(item)]));
            const start = { clientX: event.clientX, clientY: event.clientY };
            let moved = false;
            element.setPointerCapture(event.pointerId);
            if (!selectedIds.has(node.id)) setSelectedIds(movingIds);
            const move = (next: PointerEvent) => { moved = true; const delta = { x: (next.clientX - start.clientX) / viewport.zoom, y: (next.clientY - start.clientY) / viewport.zoom }; startPoints.forEach((startPoint, id) => store.getState().moveNode(id, startPoint.x + delta.x, startPoint.y + delta.y)); };
            const up = () => { element.removeEventListener('pointermove', move); if (moved) commit(); };
            element.addEventListener('pointermove', move);
            element.addEventListener('pointerup', up, { once: true });
          }}
          onPatch={(patch, save = false) => { store.getState().updateNode(node.id, patch); if (save) commit(); }}
          onRun={() => runSmartLoop(node)}
          onSelect={(event) => { setSelectedEdge(-1); setSelectedIds((current) => { if (!event.ctrlKey && !event.metaKey) return new Set([node.id]); const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; }); }}
          readOnly={readOnly}
          selected={selectedIds.has(node.id)}
          upstreamPrompts={connectedPrompts(boardDocument, node)}
        />;
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
            const movingIds = legacyUi && selectedIds.has(node.id) ? new Set(selectedIds) : new Set([node.id]);
            const startPoints = new Map((store.getState().document?.nodes ?? []).filter((item) => movingIds.has(item.id)).map((item) => [item.id, nodePoint(item)]));
            const start = { clientX: event.clientX, clientY: event.clientY };
            let moved = false;
            element.setPointerCapture(event.pointerId);
            setSelectedEdge(-1);
            if (!selectedIds.has(node.id)) setSelectedIds(movingIds);
            const move = (next: PointerEvent) => {
              moved = true;
              const delta = { x: (next.clientX - start.clientX) / viewport.zoom, y: (next.clientY - start.clientY) / viewport.zoom };
              startPoints.forEach((startPoint, id) => store.getState().moveNode(id, startPoint.x + delta.x, startPoint.y + delta.y));
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
          {canInput(node) ? <button aria-label={`连接到 ${node.id}`} className="port in node-port port-in" data-port="in" onClick={() => connect(node.id)} onPointerDown={(event) => event.stopPropagation()} type="button" /> : null}
          {canOutput(node) ? <button aria-label={`从 ${node.id} 连线`} className="port out node-port port-out" data-port="out" onClick={() => startConnection(node.id)} onPointerDown={(event) => { event.stopPropagation(); startConnection(node.id); }} type="button" /> : null}
          <header className="node-head"><strong className="node-title">{nodeRegistry[node.type] ?? node.type}</strong></header>
          <div className="node-body">{node.type === 'prompt' ? <PromptBody commit={commit} node={node} onOpenPreset={smartUi && !readOnly ? setPromptPresetNodeId : undefined} onOpenTemplate={smartUi ? (nodeId) => {
            const active = store.getState().document?.nodes.find((item) => item.id === nodeId);
            if (active) setPromptTemplateTarget({ initialText: String(active.text || ''), nodeId, target: 'node' });
          } : undefined} store={store} />
            : node.type === 'image' ? <ImageBody canvasRuntime={canvasRuntime} commit={commit} node={node} onEdit={() => setImageEditorNodeId(node.id)} store={store} />
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
      {smartUi ? <SmartCanvasComposer
        canvasRuntime={canvasRuntime}
        document={document}
        generator={selectedSmartGenerator}
        onPatchGenerator={patchSmartGenerator}
        onPatchOutput={patchSmartOutput}
        onOpenTemplate={(initialText, onApply) => setPromptTemplateTarget({ initialText, onApply, target: 'composer' })}
        onRun={runSmartComposer}
        output={selectedSmartOutput}
        readOnly={readOnly}
      /> : null}
    </div>
    {legacyUi && createMenu ? <div className="create-menu open" onPointerDown={(event) => event.stopPropagation()} style={{ left: createMenu.left, top: createMenu.top }}>
      {createMenuNodes.map(([type, label, icon]) => <button className="menu-btn" key={type} onClick={() => {
        const id = store.getState().addNode(type, createMenu.point);
        if (id) {
          setSelectedIds(new Set([id]));
          commit();
        }
        setCreateMenu(null);
      }} type="button"><i className="w-4 h-4" data-lucide={icon} /><span>{label}</span></button>)}
    </div> : null}
    {smartUi && createMenu ? <SmartCanvasCreateMenu left={createMenu.left} onCreate={createSmartNode} top={createMenu.top} /> : null}
    {smartUi && promptPresetNodeId && nodesById.get(promptPresetNodeId) ? <SmartCanvasPromptPreset
      boardRef={boardRef}
      node={nodesById.get(promptPresetNodeId)!}
      onClearPreset={(presetId) => {
        const snapshot = store.getState().document;
        if (!snapshot) return;
        store.getState().projectDocument({
          ...snapshot,
          nodes: snapshot.nodes.map((node) => String(node.promptPresetId || '') === presetId ? { ...node, promptPresetId: undefined } : node),
        });
        commit();
      }}
      onClose={() => setPromptPresetNodeId('')}
      onPatchNode={(nodeId, patch) => { store.getState().updateNode(nodeId, patch); commit(); }}
      readOnly={readOnly}
    /> : null}
    {smartUi && promptTemplateTarget ? <SmartCanvasPromptTemplate
      initialText={promptTemplateTarget.initialText}
      onApply={(text, promptPresetId) => {
        if (promptTemplateTarget.target === 'composer') promptTemplateTarget.onApply?.(text);
        else if (promptTemplateTarget.nodeId) {
          store.getState().updateNode(promptTemplateTarget.nodeId, { promptPresetId, text });
          commit();
        }
      }}
      onClose={() => setPromptTemplateTarget(null)}
      readOnly={readOnly}
      target={promptTemplateTarget.target}
    /> : null}
    {smartUi ? <input accept="image/*,video/*,audio/*" hidden id="fileInput" multiple type="file" /> : null}
    {legacyUi ? <div className="minimap" onPointerDown={(event) => {
      event.preventDefault();
      event.stopPropagation();
      const element = event.currentTarget;
      centerViewport(event.clientX, event.clientY);
      element.setPointerCapture(event.pointerId);
      const move = (next: PointerEvent) => centerViewport(next.clientX, next.clientY);
      const up = () => element.removeEventListener('pointermove', move);
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', up, { once: true });
    }} title="导航地图">
      <div className="minimap-content">
        {(document?.nodes ?? []).map((node) => {
          const point = nodePoint(node);
          const size = nodeSize(node);
          return <div className={`minimap-node ${selectedIds.has(node.id) ? 'selected' : ''}`} data-minimap-node-id={node.id} key={node.id} style={{
            height: `${Math.max(2, (size.height / WORLD_HEIGHT) * 110)}px`,
            left: `${(point.x / WORLD_WIDTH) * 100}%`,
            top: `${(point.y / WORLD_HEIGHT) * 100}%`,
            width: `${Math.max(2, (size.width / WORLD_WIDTH) * 172)}px`,
          }} />;
        })}
        {(document?.nodes ?? []).length ? null : <div className="minimap-empty">暂无节点</div>}
        <div className="minimap-viewport" style={{
          height: `${Math.max(4, (boardSize.height / viewport.zoom / WORLD_HEIGHT) * 100)}%`,
          left: `${(-viewport.x / viewport.zoom / WORLD_WIDTH) * 100}%`,
          top: `${(-viewport.y / viewport.zoom / WORLD_HEIGHT) * 100}%`,
          width: `${Math.max(4, (boardSize.width / viewport.zoom / WORLD_WIDTH) * 100)}%`,
        }} />
      </div>
    </div> : null}
    {smartUi ? <SmartCanvasMinimap
      boardHeight={boardSize.height}
      boardWidth={boardSize.width}
      nodes={(document?.nodes ?? []).map((node) => ({ ...nodePoint(node), ...nodeSize(node), id: node.id }))}
      onLocate={locateSmartViewport}
      viewport={viewport}
    /> : null}
    {lightbox && lightboxNode ? (smartUi ? <SmartCanvasPreview
      document={document!}
      node={lightboxNode}
      onClose={() => setLightbox(null)}
      onEdit={(imageIndex, mode) => { setSmartImageEditor({ imageIndex, mode, nodeId: lightboxNode.id }); setLightbox(null); }}
      onExportVideoFrame={(result) => exportSmartVideoFrame(lightboxNode, result)}
      onNavigate={(url) => setLightbox({ nodeId: lightboxNode.id, url })}
      onRememberSize={(index, width, height) => {
        const active = store.getState().document?.nodes.find((item) => item.id === lightboxNode.id);
        if (!active || !Array.isArray(active.images)) return;
        const images = active.images.map((item, itemIndex) => itemIndex === index && item && typeof item === 'object' && !Array.isArray(item)
          ? { ...item as Record<string, unknown>, natural_h: height, natural_w: width }
          : item);
        store.getState().updateNode(active.id, { images });
        commit();
      }}
      url={lightbox.url}
    /> : legacyUi ? <LegacyOutputLightbox
      node={lightboxNode}
      onClose={() => setLightbox(null)}
      onNavigate={(url) => setLightbox({ nodeId: lightboxNode.id, url })}
      onRerun={(meta) => { window.CanvasBoardV2?.rerunFromOutputMeta(meta); setLightbox(null); }}
      onViewed={(url) => {
        const active = store.getState().document?.nodes.find((item) => item.id === lightboxNode.id);
        if (!active || !Array.isArray(active.images)) return;
        let changed = false;
        const images = active.images.map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item) || String((item as Record<string, unknown>).url || '') !== url || (item as Record<string, unknown>).viewed) return item;
          changed = true;
          return { ...(item as Record<string, unknown>), viewed: true };
        });
        if (!changed) return;
        store.getState().updateNode(active.id, { images });
        commit();
      }}
      url={lightbox.url}
    /> : <OutputLightbox node={lightboxNode} onClose={() => setLightbox(null)} url={lightbox.url} />) : null}
    {smartUi && smartImageEditor && smartImageEditorNode ? <SmartCanvasImageEditor imageIndex={smartImageEditor.imageIndex} initialMode={smartImageEditor.mode} node={smartImageEditorNode} onApply={applySmartImageEdit} onClose={() => setSmartImageEditor(null)} onCreateMask={createSmartMask} onGridJoin={joinSmartGrid} onGridSplit={splitSmartGrid} /> : null}
    {imageEditorNode?.url ? (legacyUi ? <LegacyImageTransformDialog name={String(imageEditorNode.name || 'image')} onApply={async (result: LegacyImageTransformResult) => {
      if (readOnly) throw new Error('只读模式不能编辑图片');
      const uploaded = await canvasRuntime.uploadMedia([new File([result.blob], result.name, { type: 'image/png' })]);
      const file = uploaded.files?.[0];
      if (!file?.url) throw new Error('图片上传失败');
      const active = store.getState().document?.nodes.find((item) => item.id === imageEditorNode.id);
      if (!active?.url) throw new Error('图片节点已经被移除');
      const history = Array.isArray(active.imageEditHistory) ? active.imageEditHistory as Array<Record<string, unknown>> : [];
      const previous = { kind: active.mediaKind || 'image', name: active.name || 'image', outpaintSize: active.outpaintSize, url: active.url };
      store.getState().updateNode(active.id, {
        editOriginalUrl: active.editOriginalUrl || active.url,
        imageEditHistory: [...history, previous].slice(-10),
        lastImageEdit: { height: result.height, mode: result.mode, width: result.width },
        mediaKind: file.kind || 'image',
        name: file.name || result.name,
        natural_h: result.height,
        natural_w: result.width,
        outpaintSize: result.mode === 'outpaint' ? { height: result.height, width: result.width } : undefined,
        url: file.url,
      });
      commit();
    }} onClose={() => setImageEditorNodeId('')} onCreateMask={async (result: LegacyMaskResult) => {
      if (readOnly) throw new Error('只读模式不能编辑图片');
      const uploaded = await canvasRuntime.uploadMedia([new File([result.blob], result.name, { type: 'image/png' })]);
      const file = uploaded.files?.[0];
      if (!file?.url) throw new Error('遮罩上传失败');
      const active = store.getState().document?.nodes.find((item) => item.id === imageEditorNode.id);
      if (!active) throw new Error('图片节点已经被移除');
      const id = store.getState().addNode('image', { x: Number(active.x || 0) + Number(active.w || 260) + 36, y: Number(active.y || 0) + 28 });
      if (!id) throw new Error('无法创建遮罩节点');
      store.getState().updateNode(id, { mediaKind: file.kind || 'image', name: file.name || result.name, natural_h: result.height, natural_w: result.width, role: 'mask', url: file.url });
      commit();
    }} onGridSplit={async (result: LegacyGridResult) => {
      if (readOnly) throw new Error('只读模式不能编辑图片');
      const files = result.items.map((item) => new File([item.blob], item.name, { type: 'image/png' }));
      const uploaded = await canvasRuntime.uploadMedia(files);
      if (!uploaded.files?.length) throw new Error('切分图片上传失败');
      const document = store.getState().document;
      const active = document?.nodes.find((item) => item.id === imageEditorNode.id);
      if (!document || !active) throw new Error('图片节点已经被移除');
      const output = document.connections.filter((edge) => edge.from === active.id).map((edge) => document.nodes.find((item) => item.id === edge.to)).find((item) => item?.type === 'output');
      const outputId = output?.id || store.getState().addNode('output', { x: Number(active.x || 0) + Number(active.w || 260) + 36, y: Number(active.y || 0) });
      if (!outputId) throw new Error('无法创建 Output 节点');
      const sourceRef = { name: String(active.name || 'source image'), url: String(active.url || '') };
      const images = uploaded.files.slice(0, result.items.length).map((file, index) => ({
        grid: { ...result.layout, ...result.items[index].rect },
        kind: file.kind || 'image',
        name: file.name || result.items[index].name,
        run: { prompt: '宫格切分', refs: [sourceRef] },
        runMs: 0,
        url: file.url || '',
        viewed: false,
      })).filter((item) => item.url);
      if (!images.length) throw new Error('切分图片上传结果为空');
      store.getState().updateNode(outputId, {
        imageComparisons: Object.fromEntries(images.map((item) => [item.url, sourceRef])),
        images,
        outputLayout: result.layout,
      });
      commit();
    }} url={String(imageEditorNode.url)} /> : <ImageTransformDialog name={String(imageEditorNode.name || 'image')} onApply={async (result: ImageTransformResult) => {
      if (readOnly) throw new Error('只读模式不能编辑图片');
      const uploaded = await canvasRuntime.uploadMedia([new File([result.blob], result.name, { type: 'image/png' })]);
      const file = uploaded.files?.[0];
      if (!file?.url) throw new Error('图片上传失败');
      const active = store.getState().document?.nodes.find((item) => item.id === imageEditorNode.id);
      if (!active?.url) throw new Error('图片节点已经被移除');
      const history = Array.isArray(active.imageEditHistory) ? active.imageEditHistory as Array<Record<string, unknown>> : [];
      const previous = { kind: active.mediaKind || 'image', name: active.name || 'image', outpaintSize: active.outpaintSize, url: active.url };
      store.getState().updateNode(active.id, {
        editOriginalUrl: active.editOriginalUrl || active.url,
        imageEditHistory: [...history, previous].slice(-10),
        lastImageEdit: { height: result.height, mode: result.mode, width: result.width },
        mediaKind: file.kind || 'image',
        name: file.name || result.name,
        natural_h: result.height,
        natural_w: result.width,
        outpaintSize: result.mode === 'outpaint' ? { height: result.height, width: result.width } : undefined,
        url: file.url,
      });
      commit();
    }} onClose={() => setImageEditorNodeId('')} url={String(imageEditorNode.url)} />) : null}
    {readOnly ? <div className="canvas-board-readonly-shield" data-testid="canvas-board-readonly-shield" /> : null}
  </div>;
}

function smartOutpaintSettings(value: unknown, width: number, height: number): Record<string, unknown> {
  const base = value && typeof value === 'object' && !Array.isArray(value) ? { ...value as Record<string, unknown> } : {};
  const engine = ['api', 'volcengine', 'modelscope', 'comfy'].includes(String(base.engine || '')) ? String(base.engine) : 'api';
  const next: Record<string, unknown> = { ...base, customHeight: height, customSize: `${width}x${height}`, customWidth: width, engine, outpaintResolutionLocked: true, ratio: '', resolution: 'custom' };
  if (engine === 'api' || engine === 'volcengine') next.apiKind = 'image';
  if (engine === 'modelscope') Object.assign(next, { msCustomHeight: height, msCustomSize: `${width}x${height}`, msCustomWidth: width, msRatio: '', msResolution: 'custom' });
  if (engine === 'comfy') Object.assign(next, { height, width });
  return next;
}

function OutputLightbox({ node, onClose, url }: { node: CanvasNode; onClose: () => void; url: string }) {
  const [compare, setCompare] = useState(50);
  const comparison = (node.imageComparisons as Record<string, { url?: string }> | undefined)?.[url]?.url || '';
  const video = /\.(mp4|webm|mov)(\?|$)/i.test(url);
  return <div className="output-lightbox open canvas-v2-lightbox" onClick={onClose} role="dialog">
    <div className="output-lightbox-shell" onClick={(event) => event.stopPropagation()}>
      <button aria-label="关闭预览" className="output-lightbox-close" onClick={onClose} type="button">×</button>
      {video ? <video autoPlay controls src={url} /> : <div className="output-compare"> <img alt="生成结果" src={url} />{comparison ? <div className="output-compare-original-wrap" style={{ width: `${compare}%` }}><img alt="原始参考" src={comparison} /></div> : null}</div>}
      {comparison && !video ? <input aria-label="对比滑块" max="100" min="0" onChange={(event) => setCompare(Number(event.target.value))} type="range" value={compare} /> : null}
      <a download href={url}>下载</a>
    </div>
  </div>;
}

export interface CanvasBoardMountOptions {
  clientId?: string;
  initialDocument?: unknown;
  legacyUi?: boolean;
  readOnly?: boolean;
  repository?: CanvasRepository;
  runtime?: CanvasRuntime;
  smartUi?: boolean;
}

export function mountCanvasBoardV2(element: HTMLElement, legacyBoard: HTMLElement | null, options: CanvasBoardMountOptions = {}): () => void {
  const bridge = window.CanvasLegacyBridge;
  const repository = options.repository ?? window.CanvasModernCore?.canvasRepository;
  const modernRuntime = options.runtime ?? runtime();
  const standalone = options.initialDocument !== undefined;
  const initialDocument = options.initialDocument ?? bridge?.getDocumentSnapshot();
  if (!repository || !modernRuntime || (standalone && !initialDocument) || (!standalone && !bridge)) throw new Error('Canvas V2 dependencies are unavailable');
  const store = createDocumentStore(initialDocument);
  let baseDocument = store.getState().document;
  let historyPresent = cloneDocument(store.getState().document);
  const historyPast: CanvasDocument[] = [];
  const historyFuture: CanvasDocument[] = [];
  const adopt = (event: Event) => {
    const previousId = store.getState().document?.id;
    store.getState().adoptDocument((event as CustomEvent<unknown>).detail);
    const current = store.getState().document;
    if (current?.id !== previousId) baseDocument = current;
  };
  const projectExecution = (event: Event) => store.getState().projectExecutionDocument((event as CustomEvent<unknown>).detail);
  if (!standalone) {
    window.addEventListener('canvas-legacy-document', adopt);
    window.addEventListener('canvas-legacy-execution-document', projectExecution);
  }
  const root = createRoot(element);
  const legacyHidden = legacyBoard?.hidden ?? true;
  let disposed = false;
  let pending = false;
  let saving = false;
  const savePayload = (document: CanvasDocument) => ({
    ...canvasDocumentSavePayload(document),
    ...(options.clientId ? { client_id: options.clientId } : {}),
  });
  const reportSaveState = (state: string) => {
    element.dataset.saveState = state;
    window.dispatchEvent(new CustomEvent('canvas-board-v2-save-state', { detail: state }));
  };
  const commit = (recordHistory = true) => {
    const active = store.getState().document;
    if (active) {
      if (recordHistory && historyPresent && documentHistoryKey(active) !== documentHistoryKey(historyPresent)) {
        historyPast.push(structuredClone(historyPresent));
        if (historyPast.length > 60) historyPast.shift();
        historyFuture.length = 0;
      }
      historyPresent = structuredClone(active);
      window.dispatchEvent(new CustomEvent('canvas-board-v2-history-state', { detail: { canRedo: historyFuture.length > 0, canUndo: historyPast.length > 0 } }));
    }
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
          const saved = await repository.save(submitted.id, savePayload(submitted));
          baseDocument = saved;
          if (!disposed) store.getState().acceptSavedDocument(saved, submitted);
          window.dispatchEvent(new CustomEvent('canvas-board-v2-document-saved', { detail: structuredClone(saved) }));
          reportSaveState('saved');
          window.CanvasModernCore?.recordRolloutEvent('save-succeeded', {
            dimensions: { reason: 'none' },
          });
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
                historyPresent = structuredClone(merged.document);
                try {
                  const saved = await repository.save(submitted.id, savePayload(merged.document));
                  baseDocument = saved;
                  if (!disposed) store.getState().acceptSavedDocument(saved, merged.document);
                  window.dispatchEvent(new CustomEvent('canvas-board-v2-document-saved', { detail: structuredClone(saved) }));
                  reportSaveState('saved');
                  window.CanvasModernCore?.recordRolloutEvent('save-rebased', {
                    dimensions: { reason: 'none' },
                  });
                  window.CanvasModernCore?.recordRolloutEvent('save-succeeded', {
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
  const undo = () => {
    const current = store.getState().document;
    const previous = historyPast.pop();
    if (!current || !previous) return false;
    historyFuture.push(structuredClone(current));
    store.getState().projectDocument(previous);
    historyPresent = structuredClone(previous);
    commit(false);
    return true;
  };
  const redo = () => {
    const current = store.getState().document;
    const next = historyFuture.pop();
    if (!current || !next) return false;
    historyPast.push(structuredClone(current));
    store.getState().projectDocument(next);
    historyPresent = structuredClone(next);
    commit(false);
    return true;
  };
  let externalSelection = new Set<string>();
  let readOnlyMode = Boolean(options.readOnly);
  const synchronizeRemote = (snapshot: unknown) => {
    const remote = decodeCanvasDocument(snapshot);
    const current = store.getState().document;
    if (!current || current.id !== remote.id) return { conflicts: ['document.id'], merged: false, updated: false };
    if (saving && !readOnlyMode) return { conflicts: ['save-in-progress'], merged: false, updated: false };
    const localChanged = Boolean(baseDocument && documentHistoryKey(current) !== documentHistoryKey(baseDocument));
    let next = remote;
    let merged = false;
    if (!readOnlyMode && baseDocument && localChanged) {
      const result = mergeCanvasDocuments(baseDocument, current, remote);
      if (result.conflicts.length) {
        reportSaveState('conflict');
        return { conflicts: result.conflicts, merged: false, updated: false };
      }
      next = result.document;
      merged = true;
    }
    baseDocument = remote;
    store.getState().projectDocument(next);
    historyPresent = structuredClone(next);
    historyPast.length = 0;
    historyFuture.length = 0;
    window.dispatchEvent(new CustomEvent('canvas-board-v2-history-state', { detail: { canRedo: false, canUndo: false } }));
    reportSaveState(merged ? 'merging' : 'saved');
    if (merged) commit(false);
    return { conflicts: [], merged, updated: true };
  };
  const previousBoardApi = window.CanvasBoardV2;
  window.CanvasBoardV2 = {
    addNode(type, point) {
      if (readOnlyMode) return null;
      const id = store.getState().addNode(type, point);
      if (id) commit();
      return id;
    },
    groupSelected() {
      if (readOnlyMode) return;
      window.dispatchEvent(new Event('canvas-board-v2-group-selected'));
    },
    exportSelection() {
      const snapshot = store.getState().document;
      if (!snapshot) return { connections: [], nodes: [] };
      const selected = externalSelection.size ? new Set(externalSelection) : new Set(snapshot.nodes.map((node) => node.id));
      let expanded = true;
      while (expanded) {
        expanded = false;
        snapshot.nodes.forEach((node) => {
          if (!selected.has(node.id) || !['group', 'promptGroup'].includes(node.type) || !Array.isArray(node.items)) return;
          node.items.forEach((id) => {
            const childId = String(id || '');
            if (childId && !selected.has(childId)) { selected.add(childId); expanded = true; }
          });
        });
      }
      return {
        connections: structuredClone(snapshot.connections.filter((edge) => selected.has(edge.from) && selected.has(edge.to))),
        nodes: structuredClone(snapshot.nodes.filter((node) => selected.has(node.id))),
      };
    },
    importWorkflow(payload) {
      if (readOnlyMode) return [];
      const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
      const connections = Array.isArray(payload.connections) ? payload.connections : [];
      const importableTypes = ['comfy', 'generator', 'group', 'image', 'llm', 'loop', 'ltxDirector', 'msgen', 'output', 'prompt', 'promptGroup', 'smart-image', 'video'] as const;
      const idMap = new Map<string, string>();
      nodes.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') return;
        const node = raw as Record<string, unknown>;
        const type = String(node.type || '');
        if (!importableTypes.includes(type as typeof importableTypes[number])) return;
        const id = store.getState().addNode(type as typeof importableTypes[number], {
          x: Number(node.x || 0) + 48 + (index % 3) * 12,
          y: Number(node.y || 0) + 48 + (index % 3) * 12,
        });
        if (!id) return;
        const sourceId = String(node.id || '');
        if (sourceId) idMap.set(sourceId, id);
        const { id: _id, type: _type, x: _x, y: _y, ...settings } = node;
        store.getState().updateNode(id, structuredClone(settings));
      });
      connections.forEach((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const edge = raw as Record<string, unknown>;
        const from = idMap.get(String(edge.from || ''));
        const to = idMap.get(String(edge.to || ''));
        if (from && to) store.getState().connectNodes(from, to);
      });
      if (idMap.size) commit();
      return [...idMap.values()];
    },
    async controlExecution(command, nodeId) {
      if (readOnlyMode) return;
      const snapshot = store.getState().document;
      if (!snapshot) return;
      const result = await modernRuntime.runCommand(command, nodeId, snapshot, async (next) => {
        store.getState().projectExecutionDocument(next);
        commit(false);
      });
      store.getState().projectDocument(result);
      commit(false);
    },
    async importFiles(files, point) {
      if (readOnlyMode) return;
      if (!files.length) return;
      const uploaded = await modernRuntime.uploadMedia(files);
      if (options.smartUi) {
        const images = (uploaded.files ?? []).filter((file) => file.url).map((file) => ({
          ...file,
          kind: file.kind || 'image',
          name: file.name || 'media',
          url: file.url || '',
        }));
        if (!images.length) return;
        const target = point ?? { x: 500, y: 400 };
        const id = store.getState().addNode('smart-image', { x: target.x - 158, y: target.y - 97 });
        if (id) {
          store.getState().updateNode(id, { images, scale: images.length > 1 ? 0.8 : 2, title: images.length > 1 ? 'Group' : images[0].kind === 'video' ? 'Video' : images[0].kind === 'audio' ? 'Audio' : 'Image' });
          commit();
        }
        return;
      }
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
      if (readOnlyMode) {
        if (options.initialDocument) window.dispatchEvent(new CustomEvent('canvas-v2-open-lightbox', { detail: { nodeId: String(node.id || ''), url } }));
        else if (bridge) bridge.openOutputLightbox(node, url);
        return;
      }
      const images = Array.isArray(node.images) ? node.images.map((item) => {
        if (typeof item === 'string') return item;
        return String((item as Record<string, unknown>).url || '') === url ? { ...item as Record<string, unknown>, viewed: true } : item;
      }) : [];
      store.getState().updateNode(String(node.id || ''), { images });
      commit(false);
      if (options.legacyUi || options.initialDocument) window.dispatchEvent(new CustomEvent('canvas-v2-open-lightbox', { detail: { nodeId: String(node.id || ''), url } }));
      else if (bridge) bridge.openOutputLightbox(node, url);
    },
    async prepareVideoMedia(nodeId, action, value) {
      if (readOnlyMode) return;
      const snapshot = store.getState().document;
      if (!snapshot) return;
      const result = await modernRuntime.prepareVideoMedia(nodeId, snapshot, action, value);
      store.getState().projectDocument(result);
      commit();
    },
    rerunFromOutputMeta(meta) {
      if (readOnlyMode) return;
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
    redo() { return readOnlyMode ? false : redo(); },
    async runNode(nodeId, mode) {
      if (readOnlyMode) return;
      const snapshot = store.getState().document;
      if (!snapshot) return;
      const result = await modernRuntime.runNode(nodeId, snapshot, mode, async (next) => {
        store.getState().projectExecutionDocument(next);
        commit(false);
      });
      store.getState().projectDocument(result);
      commit(false);
    },
    setReadOnly(value) {
      readOnlyMode = Boolean(value);
      window.dispatchEvent(new CustomEvent('canvas-board-v2-readonly', { detail: readOnlyMode }));
    },
    syncRemote(snapshot) { return synchronizeRemote(snapshot); },
    undo() { return readOnlyMode ? false : undo(); },
    updateNode(nodeId, patch) {
      if (readOnlyMode) return false;
      if (!store.getState().document?.nodes.some((node) => node.id === nodeId)) return false;
      store.getState().updateNode(nodeId, patch);
      commit();
      return true;
    },
  };
  root.render(<CanvasBoardV2 canvasRuntime={modernRuntime} commit={commit} initialReadOnly={readOnlyMode} legacyUi={Boolean(options.legacyUi)} onSelectionChange={(ids) => { externalSelection = new Set(ids); }} smartUi={Boolean(options.smartUi)} store={store} />);
  if (legacyBoard) legacyBoard.hidden = true;
  element.hidden = false;
  return () => {
    disposed = true;
    if (previousBoardApi) window.CanvasBoardV2 = previousBoardApi;
    else delete window.CanvasBoardV2;
    if (!standalone) {
      window.removeEventListener('canvas-legacy-document', adopt);
      window.removeEventListener('canvas-legacy-execution-document', projectExecution);
    }
    root.unmount();
    element.hidden = true;
    if (legacyBoard) legacyBoard.hidden = legacyHidden;
  };
}

function cloneDocument(document: CanvasDocument | null): CanvasDocument | null {
  return document ? structuredClone(document) : null;
}

function documentHistoryKey(document: CanvasDocument): string {
  const snapshot = structuredClone(document) as CanvasDocument & { updated_at?: unknown };
  delete snapshot.updated_at;
  return JSON.stringify(snapshot);
}
