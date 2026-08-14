import type { CanvasDocument, CanvasEdge, CanvasNode } from './types';

export const DEFAULT_RUN_NODE_TYPES = new Set([
  'generator',
  'msgen',
  'comfy',
  'ltxDirector',
  'llm',
  'video',
]);

export interface GraphModel {
  cascadeOrder(targetId: string): string[];
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

  return { cascadeOrder, wouldCreateCycle };
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
