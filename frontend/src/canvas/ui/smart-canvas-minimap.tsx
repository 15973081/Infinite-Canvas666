import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface SmartCanvasMinimapRect {
  height: number;
  id: string;
  width: number;
  x: number;
  y: number;
}

interface SmartCanvasMinimapProps {
  boardHeight: number;
  boardWidth: number;
  nodes: SmartCanvasMinimapRect[];
  onLocate(point: { x: number; y: number }): void;
  viewport: { x: number; y: number; zoom: number };
}

interface MinimapState {
  height: number;
  minX: number;
  minY: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  width: number;
}

const DEFAULT_CONTENT_SIZE = { height: 108, width: 170 };

export function SmartCanvasMinimap({ boardHeight, boardWidth, nodes, onLocate, viewport }: SmartCanvasMinimapProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentSize, setContentSize] = useState(DEFAULT_CONTENT_SIZE);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const update = () => setContentSize({
      height: content.clientHeight || DEFAULT_CONTENT_SIZE.height,
      width: content.clientWidth || DEFAULT_CONTENT_SIZE.width,
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const projection = minimapProjection(nodes, viewport, boardWidth, boardHeight, contentSize.width, contentSize.height);
  const locate = (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
    const content = contentRef.current;
    if (!content) return;
    const rect = content.getBoundingClientRect();
    onLocate(minimapPointToWorld(event.clientX - rect.left, event.clientY - rect.top, projection.state));
  };
  const startLocating = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget;
    locate(event.nativeEvent);
    element.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => locate(next);
    const up = () => element.removeEventListener('pointermove', move);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up, { once: true });
  };

  return <div aria-hidden="true" className="smart-minimap" id="minimap" onPointerDown={startLocating}>
    <div className="smart-minimap-content" id="minimapContent" ref={contentRef}>
      {projection.nodes.map((node) => <div className="minimap-node" data-minimap-node-id={node.id} key={node.id} style={node.style} />)}
      <div className="smart-minimap-viewport" id="minimapViewport" style={projection.viewport} />
    </div>
  </div>;
}

function minimapProjection(
  nodes: SmartCanvasMinimapRect[],
  viewport: SmartCanvasMinimapProps['viewport'],
  boardWidth: number,
  boardHeight: number,
  width: number,
  height: number,
) {
  const viewRect = {
    height: boardHeight / viewport.zoom,
    width: boardWidth / viewport.zoom,
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
  };
  const rects = [...nodes, viewRect];
  const minX = Math.min(...rects.map((rect) => rect.x), -200);
  const minY = Math.min(...rects.map((rect) => rect.y), -200);
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width), viewRect.x + viewRect.width + 200);
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height), viewRect.y + viewRect.height + 200);
  const scale = Math.min(width / Math.max(1, maxX - minX), height / Math.max(1, maxY - minY));
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;
  const state = { height, minX, minY, offsetX, offsetY, scale, width };
  const project = (rect: { height: number; width: number; x: number; y: number }) => ({
    height: Math.max(4, rect.height * scale),
    left: offsetX + (rect.x - minX) * scale,
    top: offsetY + (rect.y - minY) * scale,
    width: Math.max(4, rect.width * scale),
  });
  return {
    nodes: nodes.map((node) => ({ id: node.id, style: project(node) })),
    state,
    viewport: project(viewRect),
  };
}

function minimapPointToWorld(x: number, y: number, state: MinimapState) {
  return {
    x: state.minX + (x - state.offsetX) / Math.max(0.0001, state.scale),
    y: state.minY + (y - state.offsetY) / Math.max(0.0001, state.scale),
  };
}
