import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import type { CanvasEdge, CanvasNode } from '../domain/types';
import { canvasDocumentSavePayload } from '../infrastructure/canvas-repository';
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
  const defaults = node.type === 'prompt' ? { height: 230, width: 310 }
    : node.type === 'loop' ? { height: node.showPrompt || node.imageInput ? 390 : 180, width: 336 }
      : node.type === 'promptGroup' ? { height: 220, width: 260 }
        : node.type === 'generator' || node.type === 'msgen' ? { height: 340, width: 380 }
          : node.type === 'output' ? { height: 320, width: 460 }
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

function RunButton({ node }: { node: CanvasNode }) {
  const [running, setRunning] = useState(false);
  return <button className={`gen-btn ${running ? 'running' : ''}`} disabled={running} onClick={async () => {
    setRunning(true);
    try { await window.CanvasBoardV2?.runNode(node.id); }
    catch (error) { window.alert(error instanceof Error ? error.message : String(error)); }
    finally { setRunning(false); }
  }} type="button">{running ? '运行中…' : '运行'}</button>;
}

function InputSummary({ document, node }: { document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode }) {
  const sources = document.connections.filter((edge) => edge.to === node.id).map((edge) => document.nodes.find((item) => item.id === edge.from)).filter(Boolean) as CanvasNode[];
  const prompts = sources.filter((item) => ['prompt', 'promptGroup', 'loop', 'llm'].includes(item.type)).length;
  const images = sources.filter((item) => ['image', 'group', 'output'].includes(item.type)).length;
  return <div className="text-[10px] text-gray-400">提示词 {prompts} · 图片/媒体 {images}</div>;
}

function GeneratorBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const update = (patch: Record<string, unknown>) => { store.getState().updateNode(node.id, patch); commit(); };
  const bridge = window.CanvasLegacyBridge;
  const providerOptions = (bridge?.getNodeOptions('generator', 'provider', node) ?? []).map((item) => [item.value, item.label] as const);
  const modelOptions = (bridge?.getNodeOptions('generator', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
  const provider = String(node.apiProvider || providerOptions[0]?.[0] || '');
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
    {node.resolution === 'custom' ? <div className="gen-settings-row"><input aria-label="自定义宽度" className="setting-input" min="64" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { customWidth: event.target.value, customSize: `${event.target.value}x${String(node.customHeight || '')}` })} step="64" type="number" value={String(node.customWidth || '')} /><input aria-label="自定义高度" className="setting-input" min="64" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { customHeight: event.target.value, customSize: `${String(node.customWidth || '')}x${event.target.value}` })} step="64" type="number" value={String(node.customHeight || '')} /></div> : null}
    </div><div className="gen-run-row"><RunButton node={node} /></div>
  </div>;
}

function MsGenBody({ commit, document, node, store }: { commit: () => void; document: { connections: CanvasEdge[]; nodes: CanvasNode[] }; node: CanvasNode; store: DocumentStore }) {
  const update = (patch: Record<string, unknown>) => { store.getState().updateNode(node.id, patch); commit(); };
  const models = (window.CanvasLegacyBridge?.getNodeOptions('msgen', 'model', node) ?? []).map((item) => [item.value, item.label] as const);
  return <div className="generator-body" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <InputSummary document={document} node={node} />
    <div className="ms-model-tabs">{models.map(([value, label]) => <button className={node.msgenModel === value ? 'active' : ''} key={value} onClick={() => update({ msgenModel: value, msLoraEnabled: false, msLoraId: '' })} type="button">{label}</button>)}</div>
    {node.msgenModel === 'custom' ? <input aria-label="ModelScope 模型" className="setting-input" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { msCustomModel: event.target.value })} value={String(node.msCustomModel || '')} /> : null}
    <div className="gen-settings"><div className="gen-settings-row">
      <SelectField ariaLabel="ModelScope 分辨率" onChange={(msResolution) => update({ msResolution, ...(msResolution === 'custom' ? { msRatio: '' } : {}) })} options={resolutions} value={String(node.msResolution || '1k')} />
      <SelectField ariaLabel="ModelScope 比例" onChange={(msRatio) => update({ msRatio })} options={ratios.filter(([value]) => value !== 'source')} value={String(node.msRatio || 'square')} />
      <input aria-label="ModelScope 生成数量" className="gen-count-input" max="8" min="1" onBlur={commit} onChange={(event) => store.getState().updateNode(node.id, { count: Math.max(1, Math.min(8, Number(event.target.value) || 1)) })} type="number" value={Math.max(1, Math.min(8, Number(node.count || 1)))} />
    </div></div><div className="gen-run-row"><RunButton node={node} /></div>
  </div>;
}

function OutputBody({ commit, node, store }: { commit: () => void; node: CanvasNode; store: DocumentStore }) {
  const images = Array.isArray(node.images) ? node.images : [];
  const urlOf = (item: unknown) => typeof item === 'string' ? item : String((item as { url?: unknown })?.url || '');
  const remove = (url: string) => { store.getState().updateNode(node.id, { images: images.filter((item) => urlOf(item) !== url) }); commit(); };
  return <div className="output-grid" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>{images.map((item, index) => {
    const url = urlOf(item);
    const kind = String((item as { kind?: unknown })?.kind || (/\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' : /\.(mp3|wav|m4a)(\?|$)/i.test(url) ? 'audio' : 'image'));
    return <div className="output-img-wrap" data-output-url={url} key={`${url}-${index}`}>
      {kind === 'video' ? <video controls onDoubleClick={() => window.open(url, '_blank', 'noopener')} preload="metadata" src={url} /> : kind === 'audio' ? <audio controls preload="metadata" src={url} /> : <img alt="generated output" draggable onClick={() => window.open(url, '_blank', 'noopener')} src={url} />}
      <a className="output-download" download href={url} onClick={(event) => event.stopPropagation()}>↓</a><button aria-label="删除输出" className="output-del" onClick={() => remove(url)} type="button">×</button>
    </div>;
  })}</div>;
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
        const id = store.getState().groupPromptNodes([...selectedIds]);
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
      const id = store.getState().groupPromptNodes([...selectedIds]);
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
          className={`node ${node.type}-node sized ${selectedIds.has(node.id) ? 'selected' : ''}`}
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
            : node.type === 'promptGroup' ? <PromptGroupBody node={node} nodesById={nodesById} />
              : node.type === 'loop' ? <LoopBody commit={commit} node={node} store={store} />
                : node.type === 'generator' ? <GeneratorBody commit={commit} document={boardDocument} node={node} store={store} />
                  : node.type === 'msgen' ? <MsGenBody commit={commit} document={boardDocument} node={node} store={store} />
                    : node.type === 'output' ? <OutputBody commit={commit} node={node} store={store} />
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
  const adopt = (event: Event) => store.getState().adoptDocument((event as CustomEvent<unknown>).detail);
  window.addEventListener('canvas-legacy-document', adopt);
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
          if (!disposed) store.getState().acceptSavedDocument(saved, submitted);
          reportSaveState('saved');
        } catch (error) {
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
    openPromptTemplates(nodeId) {
      window.openPromptTemplateModal?.(nodeId);
    },
    async runNode(nodeId) {
      const snapshot = store.getState().document;
      if (!snapshot) return;
      const result = await bridge.runNode(nodeId, snapshot);
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
    root.unmount();
    element.hidden = true;
    legacyBoard.hidden = legacyHidden;
  };
}
