import type { CanvasDocument, CanvasEdge, CanvasNode } from '../domain/types';

export interface SmartCanvasNodeRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface SmartCanvasPortDrag {
  currentWorld: { x: number; y: number };
  fromId: string;
  fromPort: 'in' | 'out';
  hoverPort?: 'in' | 'out' | '';
  hoverTargetId?: string;
}

interface SmartConnectionGeometry {
  color: string;
  curve: string;
  midpoint: { x: number; y: number };
  target: { x: number; y: number };
  width: number;
}

export function smartConnectionGeometry(edge: CanvasEdge, from: SmartCanvasNodeRect, to: SmartCanvasNodeRect, cascade = false): SmartConnectionGeometry {
  const kind = String(edge.kind || 'flow');
  const history = kind === 'history';
  const fx = history ? from.x + from.width / 2 : from.x + from.width;
  const fy = history ? from.y + from.height : from.y + from.height / 2;
  const tx = history ? to.x + to.width / 2 : to.x;
  const ty = history ? to.y : to.y + to.height / 2;
  const dx = Math.max(50, Math.abs(tx - fx) * 0.45);
  const dy = Math.max(36, Math.abs(ty - fy) * 0.45);
  return {
    color: cascade ? '#16a34a' : history ? 'rgba(100,116,139,0.46)' : kind === 'input' ? 'rgba(100,116,139,0.62)' : 'rgba(148,163,184,0.62)',
    curve: history
      ? `M${fx} ${fy} C ${fx} ${fy + dy}, ${tx} ${ty - dy}, ${tx} ${ty}`
      : `M${fx} ${fy} C ${fx + dx} ${fy}, ${tx - dx} ${ty}, ${tx} ${ty}`,
    midpoint: { x: (fx + tx) / 2, y: (fy + ty) / 2 },
    target: { x: tx, y: ty },
    width: kind === 'input' ? 1.9 : 1.6,
  };
}

export function smartPortDragPath(drag: SmartCanvasPortDrag, from: SmartCanvasNodeRect): string {
  const out = drag.fromPort === 'out';
  const fx = out ? from.x + from.width : from.x;
  const fy = from.y + from.height / 2;
  const tx = drag.currentWorld.x;
  const ty = drag.currentWorld.y;
  const dx = Math.max(50, Math.abs(tx - fx) * 0.45);
  const sign = out ? 1 : -1;
  return `M${fx} ${fy} C ${fx + dx * sign} ${fy}, ${tx - dx * sign} ${ty}, ${tx} ${ty}`;
}

export function smartCascadeConnectionKeys(document: Pick<CanvasDocument, 'connections' | 'nodes'>): Set<string> {
  const outgoing = new Map<string, CanvasEdge[]>();
  document.connections.forEach((edge) => {
    if (String(edge.kind || 'flow') === 'history') return;
    const list = outgoing.get(edge.from) || [];
    list.push(edge);
    outgoing.set(edge.from, list);
  });
  const keys = new Set<string>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    (outgoing.get(id) || []).forEach((edge) => {
      keys.add(`${edge.from}->${edge.to}`);
      walk(edge.to);
    });
  };
  document.nodes.filter((node) => node.type === 'loop').forEach((node) => walk(node.id));
  return keys;
}

export function smartCascadeEdgeState(edge: CanvasEdge, source: CanvasNode, target: CanvasNode): '' | 'active' | 'done' | 'wait' {
  const explicit = String(edge.cascadeState || edge.runState || '');
  if (explicit === 'active' || explicit === 'done' || explicit === 'wait') return explicit;
  if (source.running || target.running) return 'active';
  if (source.runStatus === 'done' && target.runStatus === 'done') return 'done';
  return '';
}

interface SmartCanvasConnectionsProps {
  document: Pick<CanvasDocument, 'connections' | 'nodes'>;
  drag?: SmartCanvasPortDrag | null;
  nodeRect(node: CanvasNode): SmartCanvasNodeRect;
  onCut(index: number): void;
  onSelect(index: number): void;
  selectedIndex?: number;
}

export function SmartCanvasConnections({ document, drag, nodeRect, onCut, onSelect, selectedIndex = -1 }: SmartCanvasConnectionsProps) {
  const nodes = new Map(document.nodes.map((node) => [node.id, node]));
  const cascadeKeys = smartCascadeConnectionKeys(document);
  const paths = document.connections.map((edge, index) => {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);
    if (!source || !target) return null;
    const history = String(edge.kind || 'flow') === 'history';
    const state = smartCascadeEdgeState(edge, source, target);
    const cascade = !history && (cascadeKeys.has(`${edge.from}->${edge.to}`) || Boolean(state));
    const pending = Boolean(target.pending) && !cascade;
    const geometry = smartConnectionGeometry(edge, nodeRect(source), nodeRect(target), cascade);
    const classes = [
      pending ? 'conn-pending' : '',
      cascade ? 'conn-cascade' : '',
      cascade && state === 'done' ? 'conn-cascade-done' : '',
      cascade && state && state !== 'done' ? 'conn-cascade-wait' : '',
      cascade && state === 'active' ? 'conn-cascade-active' : '',
      history ? 'conn-history' : '',
    ].filter(Boolean).join(' ');
    return <g data-selected={selectedIndex === index ? 'true' : 'false'} key={`${edge.from}-${edge.to}-${index}`}>
      <path className={classes} d={geometry.curve} fill="none" opacity={pending ? 0.82 : 1} stroke={geometry.color} strokeWidth={geometry.width} />
      <path className="conn-hit" d={geometry.curve} data-conn-index={index} fill="none" onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(index);
      }} onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCut(index);
      }} onPointerDown={(event) => event.stopPropagation()} stroke="transparent" strokeWidth="14" />
      <circle cx={geometry.target.x} cy={geometry.target.y} fill={geometry.color} opacity=".66" r="3.5" />
      <g className="conn-cut" data-conn-index={index} onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCut(index);
      }} onPointerDown={(event) => event.stopPropagation()} transform={`translate(${geometry.midpoint.x} ${geometry.midpoint.y})`}>
        <circle fill="var(--card)" r="8" stroke={geometry.color} strokeWidth="1.4" />
        <path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke={geometry.color} strokeLinecap="round" strokeWidth="1.5" />
      </g>
    </g>;
  });
  const dragSource = drag ? nodes.get(drag.fromId) : null;
  return <svg className="connection-layer" height="4000" viewBox="0 0 6000 4000" width="6000" xmlns="http://www.w3.org/2000/svg">
    {paths}
    {drag && dragSource ? <path className="port-drag-temp conn-pending" d={smartPortDragPath(drag, nodeRect(dragSource))} fill="none" stroke="rgba(100,116,139,0.92)" strokeLinecap="round" strokeWidth="1.9" /> : null}
  </svg>;
}
