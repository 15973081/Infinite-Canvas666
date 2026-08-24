import type { CanvasDocument, CanvasEdge, CanvasNode } from './types';

export const DEFAULT_RUN_NODE_TYPES = new Set([
  'generator',
  'msgen',
  'comfy',
  'ltxDirector',
  'llm',
  'video',
]);

const MEDIA_OUTPUT_NODE_TYPES = new Set(['generator', 'msgen', 'comfy', 'ltxDirector', 'video']);

export interface GraphModel {
  canConnect(fromId: string, toId: string, allowExisting?: boolean): boolean;
  cascadeOrder(targetId: string): string[];
  retryCascadeOrder(nodeId: string): string[];
  wouldCreateCycle(fromId: string, toId: string): boolean;
}

export function createGraphModel(
  document: Pick<CanvasDocument, 'nodes' | 'connections'>,
  runNodeTypes: ReadonlySet<string> = DEFAULT_RUN_NODE_TYPES,
): GraphModel {
  const nodes = new Map<string, CanvasNode>();
  for (const node of document.nodes) {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  }
  const incoming = indexEdges(document.connections, 'to');
  const outgoing = indexEdges(document.connections, 'from');

  function cascadeOrder(targetId: string): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    function visit(id: string): void {
      if (visited.has(id)) return;
      visited.add(id);
      const current = nodes.get(id);
      if (!current) return;

      for (const edge of incoming.get(id) ?? []) {
        const upstream = nodes.get(edge.from);
        if (!upstream) continue;
        if (runNodeTypes.has(upstream.type)) visit(upstream.id);
        else if (upstream.type === 'output') visitOutputInputs(upstream);
      }

      if (runNodeTypes.has(current.type)) order.push(id);
    }

    function visitOutputInputs(output: CanvasNode): void {
      for (const edge of incoming.get(output.id) ?? []) {
        const upstream = nodes.get(edge.from);
        if (upstream && runNodeTypes.has(upstream.type)) visit(upstream.id);
      }
    }

    visit(targetId);
    return order;
  }

  function wouldCreateCycle(fromId: string, toId: string): boolean {
    if (fromId === toId) return true;
    const seen = new Set<string>();
    const stack = [toId];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === fromId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edge of outgoing.get(id) ?? []) stack.push(edge.to);
    }
    return false;
  }

  function canConnect(fromId: string, toId: string, allowExisting = false): boolean {
    if (!fromId || !toId || fromId === toId) return false;
    const from = nodes.get(fromId);
    const to = nodes.get(toId);
    if (!from || !to || (!allowExisting && document.connections.some((edge) => edge.from === fromId && edge.to === toId))) return false;
    if (to.type === 'smart-image') return ['image', 'loop', 'output', 'prompt', 'promptGroup', 'smart-image'].includes(from.type) && !wouldCreateCycle(fromId, toId);
    if (from.type === 'smart-image') return ['loop', 'prompt', 'smart-image'].includes(to.type) && !wouldCreateCycle(fromId, toId);
    if (MEDIA_OUTPUT_NODE_TYPES.has(from.type)) {
      if (to.type === 'output') return !wouldCreateCycle(fromId, toId);
      if (MEDIA_OUTPUT_NODE_TYPES.has(to.type)) return !wouldCreateCycle(fromId, toId);
      return false;
    }
    if (to.type === 'loop') {
      const allowed = (Boolean(to.imageInput) && ['image', 'group', 'output', 'smart-image'].includes(from.type))
        || (Boolean(to.showPrompt) && ['prompt', 'promptGroup', 'loop', 'llm', 'smart-image'].includes(from.type));
      return allowed && !wouldCreateCycle(fromId, toId);
    }
    if (to.type === 'llm') return ['prompt', 'loop', 'promptGroup', 'llm', 'image', 'group', 'output'].includes(from.type) && !wouldCreateCycle(fromId, toId);
    if (from.type === 'llm') return MEDIA_OUTPUT_NODE_TYPES.has(to.type) && !wouldCreateCycle(fromId, toId);
    return MEDIA_OUTPUT_NODE_TYPES.has(to.type)
      && ['image', 'prompt', 'loop', 'group', 'promptGroup', 'output', 'llm'].includes(from.type)
      && !wouldCreateCycle(fromId, toId);
  }

  function retryCascadeOrder(nodeId: string): string[] {
    const visited = new Set<string>();
    const downstream = new Set<string>();

    function walk(id: string): void {
      if (visited.has(id)) return;
      visited.add(id);
      const current = nodes.get(id);
      if (!current) return;
      if (runNodeTypes.has(current.type)) downstream.add(id);
      for (const edge of outgoing.get(id) ?? []) {
        const next = nodes.get(edge.to);
        if (next && (runNodeTypes.has(next.type) || next.type === 'output')) walk(next.id);
      }
    }

    walk(nodeId);
    const order: string[] = [];
    const added = new Set<string>();
    for (const id of downstream) {
      for (const candidate of cascadeOrder(id)) {
        if (downstream.has(candidate) && !added.has(candidate)) {
          added.add(candidate);
          order.push(candidate);
        }
      }
    }
    return order;
  }

  return { canConnect, cascadeOrder, retryCascadeOrder, wouldCreateCycle };
}

function indexEdges(edges: CanvasEdge[], key: 'from' | 'to'): Map<string, CanvasEdge[]> {
  const index = new Map<string, CanvasEdge[]>();
  for (const edge of edges) {
    const list = index.get(edge[key]);
    if (list) list.push(edge);
    else index.set(edge[key], [edge]);
  }
  return index;
}
