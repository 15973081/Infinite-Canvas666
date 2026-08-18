import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import type { CanvasNode } from '../domain/types';
import { bindCanvasDocumentEvents, createDocumentStore, type DocumentStore } from '../stores/document-store';

type Point = { x: number; y: number };
type Viewport = Point & { zoom: number };

const nodeSize = { height: 110, width: 240 };

function nodePoint(node: CanvasNode, positions: Record<string, Point>): Point {
  return positions[node.id] ?? { x: Number(node.x || 0), y: Number(node.y || 0) };
}

function CanvasBoardV2({ store }: { store: DocumentStore }) {
  const document = useStore(store, ({ document }) => document);
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [selectedId, setSelectedId] = useState('');
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const documentId = String(document?.id || '');
  const nodesById = new Map((document?.nodes ?? []).map((node) => [node.id, node]));

  useEffect(() => {
    setPositions({});
    setSelectedId('');
  }, [documentId]);

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
    <div style={{ height: 4000, position: 'absolute', transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: '0 0', width: 6000 }}>
      <svg aria-hidden="true" height="4000" style={{ inset: 0, overflow: 'visible', position: 'absolute' }} width="6000">
        {(document?.connections ?? []).map((edge, index) => {
          const source = nodesById.get(edge.from);
          const target = nodesById.get(edge.to);
          if (!source || !target) return null;
          const from = nodePoint(source, positions);
          const to = nodePoint(target, positions);
          return <line key={`${edge.from}-${edge.to}-${index}`} stroke="var(--line-2)" strokeWidth="2" x1={from.x + nodeSize.width} x2={to.x} y1={from.y + nodeSize.height / 2} y2={to.y + nodeSize.height / 2} />;
        })}
      </svg>
      {(document?.nodes ?? []).map((node) => {
        const point = nodePoint(node, positions);
        return <article
          aria-label={`${node.type} ${node.id}`}
          className={`node ${selectedId === node.id ? 'selected' : ''}`}
          data-node-id={node.id}
          key={node.id}
          onClick={(event) => { event.stopPropagation(); setSelectedId(node.id); }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(node.id); }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            const element = event.currentTarget;
            const start = { clientX: event.clientX, clientY: event.clientY, point };
            element.setPointerCapture(event.pointerId);
            setSelectedId(node.id);
            const move = (next: PointerEvent) => setPositions((value) => ({
              ...value,
              [node.id]: {
                x: start.point.x + (next.clientX - start.clientX) / viewport.zoom,
                y: start.point.y + (next.clientY - start.clientY) / viewport.zoom,
              },
            }));
            const up = () => element.removeEventListener('pointermove', move);
            element.addEventListener('pointermove', move);
            element.addEventListener('pointerup', up, { once: true });
          }}
          role="button"
          style={{ height: nodeSize.height, left: point.x, minHeight: nodeSize.height, minWidth: nodeSize.width, top: point.y, width: nodeSize.width }}
          tabIndex={0}
        >
          <header className="node-head"><strong className="node-title">{node.type}</strong></header>
          <div className="node-body">{String(node.title || node.name || node.id)}</div>
        </article>;
      })}
    </div>
  </div>;
}

export function mountCanvasBoardV2(element: HTMLElement, legacyBoard: HTMLElement): () => void {
  const bridge = window.CanvasLegacyBridge;
  if (!bridge) throw new Error('Canvas legacy bridge is unavailable');
  const store = createDocumentStore(bridge.getDocumentSnapshot());
  const unbind = bindCanvasDocumentEvents(window, store);
  const root = createRoot(element);
  const legacyHidden = legacyBoard.hidden;
  root.render(<CanvasBoardV2 store={store} />);
  legacyBoard.hidden = true;
  element.hidden = false;
  return () => {
    unbind();
    root.unmount();
    element.hidden = true;
    legacyBoard.hidden = legacyHidden;
  };
}
