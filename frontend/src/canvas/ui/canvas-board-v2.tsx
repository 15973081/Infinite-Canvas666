import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import type { CanvasNode } from '../domain/types';
import { canvasDocumentSavePayload } from '../infrastructure/canvas-repository';
import { createDocumentStore, type DocumentStore } from '../stores/document-store';

type Point = { x: number; y: number };
type Viewport = Point & { zoom: number };

const nodeSize = { height: 110, width: 240 };
const nodeRegistry: Record<string, string> = {
  comfy: 'ComfyUI', generator: 'API 生成', group: '分组', image: '上传', llm: 'LLM', loop: '循环',
  ltxDirector: 'LTX Director', msgen: 'ModelScope', output: 'Output', prompt: '提示词', promptGroup: '提示词组', video: '视频',
};

function nodePoint(node: CanvasNode): Point {
  return { x: Number(node.x || 0), y: Number(node.y || 0) };
}

function CanvasBoardV2({ commit, store }: { commit: () => void; store: DocumentStore }) {
  const document = useStore(store, ({ document }) => document);
  const [connectingFrom, setConnectingFrom] = useState('');
  const [selectedEdge, setSelectedEdge] = useState(-1);
  const [selectedId, setSelectedId] = useState('');
  const [saveState, setSaveState] = useState('ready');
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const documentId = String(document?.id || '');
  const nodesById = new Map((document?.nodes ?? []).map((node) => [node.id, node]));

  useEffect(() => {
    setConnectingFrom('');
    setSelectedEdge(-1);
    setSelectedId('');
  }, [documentId]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConnectingFrom('');
        setSelectedEdge(-1);
        setSelectedId('');
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (selectedId) store.getState().deleteNode(selectedId);
      else if (selectedEdge >= 0) store.getState().deleteConnection(selectedEdge);
      else return;
      event.preventDefault();
      setSelectedId('');
      setSelectedEdge(-1);
      commit();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [commit, selectedEdge, selectedId, store]);

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
      setSelectedId('');
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
          const line = { x1: from.x + nodeSize.width, x2: to.x, y1: from.y + nodeSize.height / 2, y2: to.y + nodeSize.height / 2 };
          return <g key={`${edge.from}-${edge.to}-${index}`}>
            <line {...line} stroke={selectedEdge === index ? 'var(--strong)' : 'var(--line-2)'} strokeWidth="2" />
            <line {...line} data-edge-index={index} data-selected={selectedEdge === index ? 'true' : 'false'} onClick={(event) => {
              event.stopPropagation();
              setSelectedEdge(index);
              setSelectedId('');
            }} onPointerDown={(event) => event.stopPropagation()} pointerEvents="stroke" stroke="rgba(0,0,0,.001)" strokeWidth="16" />
          </g>;
        })}
      </svg>
      {(document?.nodes ?? []).map((node) => {
        const point = nodePoint(node);
        return <article
          aria-label={`${node.type} ${node.id}`}
          className={`node ${selectedId === node.id ? 'selected' : ''}`}
          data-node-id={node.id}
          key={node.id}
          onClick={(event) => { event.stopPropagation(); setSelectedEdge(-1); setSelectedId(node.id); }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(node.id); }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            const element = event.currentTarget;
            const start = { clientX: event.clientX, clientY: event.clientY, point };
            let moved = false;
            element.setPointerCapture(event.pointerId);
            setSelectedEdge(-1);
            setSelectedId(node.id);
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
          style={{ height: nodeSize.height, left: point.x, minHeight: nodeSize.height, minWidth: nodeSize.width, top: point.y, width: nodeSize.width }}
          tabIndex={0}
        >
          <button aria-label={`连接到 ${node.id}`} className="port in" data-port="in" onClick={() => connect(node.id)} onPointerDown={(event) => event.stopPropagation()} onPointerUp={() => connect(node.id)} type="button" />
          <button aria-label={`从 ${node.id} 连线`} className="port out" data-port="out" onClick={() => setConnectingFrom(node.id)} onPointerDown={(event) => { event.stopPropagation(); setConnectingFrom(node.id); }} type="button" />
          <header className="node-head"><strong className="node-title">{nodeRegistry[node.type] ?? node.type}</strong></header>
          <div className="node-body">{String(node.title || node.name || node.id)}</div>
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
  root.render(<CanvasBoardV2 commit={commit} store={store} />);
  legacyBoard.hidden = true;
  element.hidden = false;
  return () => {
    disposed = true;
    window.removeEventListener('canvas-legacy-document', adopt);
    root.unmount();
    element.hidden = true;
    legacyBoard.hidden = legacyHidden;
  };
}
