import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type OnNodesChange,
  addEdge,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const NODE_COUNT = 200;
const EDGE_COUNT = 300;
const kinds = ['prompt', 'promptGroup', 'loop', 'generator', 'output', 'video', 'comfy', 'llm', 'group', 'ltxDirector'];

interface SpikeNode {
  id: string;
  kind: string;
  x: number;
  y: number;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

function fixture(): { nodes: SpikeNode[]; edges: Edge[] } {
  const nodes = Array.from({ length: NODE_COUNT }, (_, index) => ({
    id: `node-${index}`,
    kind: kinds[index % kinds.length],
    x: (index % 20) * 320,
    y: Math.floor(index / 20) * 220,
  }));
  const edges = Array.from({ length: EDGE_COUNT }, (_, index) => ({
    id: `edge-${index}`,
    source: `node-${index % NODE_COUNT}`,
    target: `node-${(index * 7 + 1) % NODE_COUNT}`,
  }));
  return { nodes, edges };
}

function Shell({ kind, id, onConnectEnd, onConnectStart, ports = true }: {
  kind: string;
  id: string;
  onConnectEnd?: React.MouseEventHandler<HTMLSpanElement>;
  onConnectStart?: React.MouseEventHandler<HTMLSpanElement>;
  ports?: boolean;
}) {
  return <>
    <div className="spike-title" data-kind={kind}>{kind}</div>
    <div className="spike-content">{kind === 'video' ? <video data-spike-media muted controls preload="none" /> : kind === 'ltxDirector' ? 'Timeline shell' : id}</div>
    {ports && <>
      <span className="spike-port spike-port-in" data-port="in" onMouseUp={onConnectEnd} />
      <span className="spike-port spike-port-out" data-port="out" onPointerDown={(event) => event.stopPropagation()} onMouseDown={onConnectStart} />
    </>}
  </>;
}

function NativeBoard({ initialNodes, edges: initialEdges }: { initialNodes: SpikeNode[]; edges: Edge[] }) {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const connectingFrom = useRef('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 24, y: 24, zoom: 0.7 });

  return <div
    className="spike-board"
    data-testid="native-board"
    data-zoom={viewport.zoom.toFixed(2)}
    onWheel={(event) => {
      event.preventDefault();
      setViewport((value) => ({ ...value, zoom: Math.min(1.5, Math.max(0.25, value.zoom * (event.deltaY < 0 ? 1.1 : 0.9))) }));
    }}
    onPointerDown={(event) => {
      if (event.target !== event.currentTarget) return;
      const board = event.currentTarget;
      if (event.shiftKey) {
        const boardRect = board.getBoundingClientRect();
        const startX = event.clientX - boardRect.left;
        const startY = event.clientY - boardRect.top;
        try { board.setPointerCapture(event.pointerId); } catch { /* synthetic spike checks have no active pointer */ }
        const move = (next: PointerEvent) => {
          const x = next.clientX - boardRect.left;
          const y = next.clientY - boardRect.top;
          setSelectionBox({ left: Math.min(startX, x), top: Math.min(startY, y), width: Math.abs(x - startX), height: Math.abs(y - startY) });
        };
        const up = (next: PointerEvent) => {
          board.removeEventListener('pointermove', move);
          const endX = next.clientX - boardRect.left;
          const endY = next.clientY - boardRect.top;
          const left = (Math.min(startX, endX) - viewport.x) / viewport.zoom;
          const top = (Math.min(startY, endY) - viewport.y) / viewport.zoom;
          const right = (Math.max(startX, endX) - viewport.x) / viewport.zoom;
          const bottom = (Math.max(startY, endY) - viewport.y) / viewport.zoom;
          setSelected(new Set(nodes.filter((node) => node.x < right && node.x + 260 > left && node.y < bottom && node.y + 140 > top).map((node) => node.id)));
          setSelectionBox(null);
        };
        board.addEventListener('pointermove', move);
        board.addEventListener('pointerup', up, { once: true });
        return;
      }
      const start = { clientX: event.clientX, clientY: event.clientY, viewportX: viewport.x, viewportY: viewport.y };
      board.setPointerCapture(event.pointerId);
      const move = (next: PointerEvent) => setViewport((value) => ({
        ...value,
        x: start.viewportX + next.clientX - start.clientX,
        y: start.viewportY + next.clientY - start.clientY,
      }));
      const up = () => {
        board.removeEventListener('pointermove', move);
        setSelected(new Set());
      };
      board.addEventListener('pointermove', move);
      board.addEventListener('pointerup', up, { once: true });
    }}
  >
    {selectionBox && <div className="spike-selection-box" data-spike-selection-box style={selectionBox} />}
    <div className="spike-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
      <svg className="spike-edges" width="6500" height="2400">
        {edges.map((edge) => {
          const source = nodes[Number(edge.source.slice(5))];
          const target = nodes[Number(edge.target.slice(5))];
          return <line key={edge.id} data-spike-edge x1={source.x + 260} y1={source.y + 70} x2={target.x} y2={target.y + 70} />;
        })}
      </svg>
      {nodes.map((node) => <article
        className={`spike-node ${selected.has(node.id) ? 'selected' : ''}`}
        data-spike-node
        data-id={node.id}
        data-kind={node.kind}
        key={node.id}
        style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
        onClick={(event) => {
          event.stopPropagation();
          setSelected((value) => event.ctrlKey || event.metaKey
            ? new Set(value.has(node.id) ? [...value].filter((id) => id !== node.id) : [...value, node.id])
            : new Set([node.id]));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const element = event.currentTarget;
          element.setPointerCapture(event.pointerId);
          const start = { x: event.clientX, y: event.clientY, nodeX: node.x, nodeY: node.y };
          const move = (next: PointerEvent) => setNodes((value) => value.map((item) => item.id === node.id ? {
            ...item,
            x: start.nodeX + (next.clientX - start.x) / viewport.zoom,
            y: start.nodeY + (next.clientY - start.y) / viewport.zoom,
          } : item));
          element.addEventListener('pointermove', move);
          element.addEventListener('pointerup', () => element.removeEventListener('pointermove', move), { once: true });
        }}
      ><Shell kind={node.kind} id={node.id} onConnectEnd={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (connectingFrom.current && connectingFrom.current !== node.id) {
          setEdges((value) => [...value, { id: `edge-${crypto.randomUUID()}`, source: connectingFrom.current, target: node.id }]);
        }
        connectingFrom.current = '';
      }} onConnectStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
        connectingFrom.current = node.id;
      }} /></article>)}
    </div>
  </div>;
}

function FlowNode({ id, data }: NodeProps<Node<{ kind: string }>>) {
  return <>
    <Shell kind={data.kind} id={id} ports={false} />
    <Handle type="target" position={Position.Left} />
    <Handle type="source" position={Position.Right} />
  </>;
}

function XYFlowBoard({ initialNodes, edges }: { initialNodes: SpikeNode[]; edges: Edge[] }) {
  const [nodes, setNodes] = useState<Node<{ kind: string }>[]>(() => initialNodes.map((node) => ({
    id: node.id,
    data: { kind: node.kind },
    position: { x: node.x, y: node.y },
    type: 'spike',
  })));
  const [boardEdges, setBoardEdges] = useState(edges);
  const onNodesChange: OnNodesChange<Node<{ kind: string }>> = (changes) => setNodes((value) => applyNodeChanges(changes, value));
  return <div className="spike-board" data-testid="xyflow-board">
    <ReactFlow nodes={nodes} edges={boardEdges} nodeTypes={{ spike: FlowNode }} onNodesChange={onNodesChange} onConnect={(connection) => setBoardEdges((value) => addEdge(connection, value))} selectionOnDrag panOnDrag={[1, 2]} fitView minZoom={0.25} maxZoom={1.5}>
      <Background />
      <Controls />
    </ReactFlow>
  </div>;
}

const styles = `
*{box-sizing:border-box}html,body,#canvasBoardSpike,.spike-app{width:100%;height:100%;margin:0;overflow:hidden;background:#101216;color:#e8eaf0;font:12px system-ui,sans-serif}
.spike-board{width:100%;height:100%;position:relative;overflow:hidden;background-color:#101216;background-image:radial-gradient(#333 1px,transparent 1px);background-size:20px 20px;touch-action:none}
.spike-world{position:absolute;transform-origin:0 0;width:6500px;height:2400px;pointer-events:none}.spike-edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.spike-edges line{stroke:#64748b;stroke-width:2}
.spike-node,.react-flow__node-spike{position:absolute;width:260px;height:140px;border:1px solid #424854;border-radius:10px;background:#1b1f27;box-shadow:0 8px 24px #0005;overflow:visible}.spike-node.selected,.react-flow__node.selected{border-color:#60a5fa;box-shadow:0 0 0 2px #60a5fa55}
.spike-node{pointer-events:auto}.spike-title{height:34px;padding:9px 12px;background:#252a34;font-weight:700;text-transform:capitalize}.spike-content{padding:18px 12px;color:#aeb6c5}.spike-content video{width:100%;height:72px}.spike-port{position:absolute;z-index:10;top:58px;width:24px;height:24px;border-radius:50%;background:#60a5fa}.spike-port-in{left:-12px}.spike-port-out{right:-12px}.spike-selection-box{position:absolute;z-index:20;border:1px solid #60a5fa;background:#60a5fa22;pointer-events:none}
.react-flow__node-spike{position:relative}.react-flow__handle{z-index:10;width:24px;height:24px;background:#60a5fa}.react-flow__attribution{display:none}
`;

const renderer = new URLSearchParams(location.search).get('renderer') === 'xyflow' ? 'xyflow' : 'native';
const data = fixture();
const startedAt = performance.now();
document.head.append(Object.assign(document.createElement('style'), { textContent: styles }));
const root = document.getElementById('canvasBoardSpike');
if (!root) throw new Error('Missing #canvasBoardSpike');
const spikeRoot = root;
const reactRoot = createRoot(spikeRoot);
let revision = 0;
const app = () => <div className="spike-app" data-revision={revision}>{renderer === 'xyflow'
  ? <XYFlowBoard initialNodes={data.nodes} edges={data.edges} />
  : <NativeBoard initialNodes={data.nodes} edges={data.edges} />}</div>;
flushSync(() => reactRoot.render(app()));
(window as typeof window & { CanvasRendererSpike?: { destroy(): void; sample(count?: number): number[] } }).CanvasRendererSpike = {
  destroy() {
    reactRoot.unmount();
  },
  sample(count = 7) {
    return Array.from({ length: count }, () => {
      const start = performance.now();
      revision += 1;
      flushSync(() => reactRoot.render(app()));
      return performance.now() - start;
    });
  },
};
let readyFrames = 0;
function markReady() {
  const edgeCount = spikeRoot.querySelectorAll('[data-spike-edge],.react-flow__edge').length;
  if (renderer === 'xyflow' && edgeCount < EDGE_COUNT && readyFrames++ < 120) {
    requestAnimationFrame(markReady);
    return;
  }
  spikeRoot.dataset.renderer = renderer;
  spikeRoot.dataset.nodes = String(spikeRoot.querySelectorAll('[data-spike-node],.react-flow__node').length);
  spikeRoot.dataset.edges = String(edgeCount);
  spikeRoot.dataset.mountMs = (performance.now() - startedAt).toFixed(2);
  spikeRoot.dataset.ready = 'true';
}
requestAnimationFrame(() => requestAnimationFrame(markReady));
