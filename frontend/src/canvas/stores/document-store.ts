import { createStore, type StoreApi } from 'zustand/vanilla';
import { decodeCanvasDocument } from '../domain/document-codec';
import { createGraphModel } from '../domain/graph';
import type { CanvasDocument, CanvasEdge, CanvasNode } from '../domain/types';

export interface DocumentStoreState {
  acceptSavedDocument(saved: CanvasDocument, submitted: CanvasDocument): void;
  addNode(type: 'generator' | 'loop' | 'msgen' | 'output' | 'prompt', point?: { x: number; y: number }): string | null;
  adoptDocument(snapshot: unknown): void;
  connectNodes(fromId: string, toId: string): boolean;
  copyNodes(nodeIds: string[]): { connections: CanvasEdge[]; nodes: CanvasNode[] };
  deleteConnection(index: number): void;
  deleteNode(nodeId: string): void;
  document: CanvasDocument | null;
  groupPromptNodes(nodeIds: string[]): string | null;
  moveNode(nodeId: string, x: number, y: number): void;
  pasteNodes(clipboard: { connections: CanvasEdge[]; nodes: CanvasNode[] }): string[];
  projectDocument(snapshot: unknown): void;
  updateNode(nodeId: string, patch: Record<string, unknown>): void;
}

export type DocumentStore = StoreApi<DocumentStoreState>;

export function createDocumentStore(initial?: unknown): DocumentStore {
  const document = decodeSnapshot(initial);
  return createStore<DocumentStoreState>()((set, get) => ({
    document,
    acceptSavedDocument: (saved, submitted) => set(({ document: current }) => {
      if (!current || current.id !== saved.id) return {};
      if (current === submitted) return { document: saved };
      return { document: { ...current, updated_at: saved.updated_at } };
    }),
    adoptDocument: (snapshot) => {
      const next = decodeSnapshot(snapshot);
      if (next && get().document?.id !== next.id) set({ document: next });
    },
    addNode: (type, point) => {
      const current = get().document;
      if (!current) return null;
      const index = current.nodes.length;
      const id = `${type}_${crypto.randomUUID()}`;
      const position = point ?? { x: 80 + (index % 4) * 360, y: 160 + Math.floor(index / 4) * 280 };
      const defaults: Record<string, Record<string, unknown>> = {
        generator: { apiProvider: '', model: '', ratio: 'square', resolution: '1k', quality: 'auto', count: 1, customRatio: '', customSize: '', customRatioWidth: '', customRatioHeight: '', customWidth: '', customHeight: '', inputs: [] },
        loop: { count: 3, mode: 'serial', showPrompt: false, imageInput: false, videoInput: false, loopStart: 1, imageBatchSize: 1, videoBatchSize: 1, variablePrompt: '', fixedPrompt: '' },
        msgen: { msgenModel: 'zimage', msWidth: 1024, msHeight: 1024, msCustomModel: 'Tongyi-MAI/Z-Image-Turbo', msRatio: 'square', msResolution: '1k', count: 1, fitImage: false, inputs: [] },
        output: { images: [] },
        prompt: { text: '' },
      };
      const node: CanvasNode = { id, type, ...position, ...defaults[type] };
      set({ document: { ...current, nodes: [...current.nodes, node] } });
      return id;
    },
    connectNodes: (fromId, toId) => {
      const current = get().document;
      if (!current || !createGraphModel(current).canConnect(fromId, toId)) return false;
      set({ document: { ...current, connections: [...current.connections, { from: fromId, to: toId }] } });
      return true;
    },
    copyNodes: (nodeIds) => {
      const current = get().document;
      if (!current) return { connections: [], nodes: [] };
      const ids = collectNodeIds(current.nodes, nodeIds);
      return structuredClone({
        connections: current.connections.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
        nodes: current.nodes.filter((node) => ids.has(node.id)),
      });
    },
    deleteConnection: (index) => set(({ document }) => document && index >= 0 && index < document.connections.length
      ? { document: { ...document, connections: document.connections.filter((_, edgeIndex) => edgeIndex !== index) } }
      : {}),
    deleteNode: (nodeId) => set(({ document }) => {
      if (!document?.nodes.some((node) => node.id === nodeId)) return {};
      const ids = collectNodeIds(document.nodes, [nodeId]);
      return { document: {
        ...document,
        connections: document.connections.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to)),
        nodes: document.nodes.filter((node) => !ids.has(node.id)),
      } };
    }),
    groupPromptNodes: (nodeIds) => {
      const current = get().document;
      if (!current) return null;
      const prompts = current.nodes.filter((node) => nodeIds.includes(node.id) && node.type === 'prompt');
      if (!prompts.length) return null;
      const id = `promptGroup_${crypto.randomUUID()}`;
      const left = Math.min(...prompts.map((node) => Number(node.x || 0)));
      const top = Math.min(...prompts.map((node) => Number(node.y || 0)));
      const right = Math.max(...prompts.map((node) => Number(node.x || 0) + Number(node.w || 310)));
      const bottom = Math.max(...prompts.map((node) => Number(node.y || 0) + Number(node.h || 230)));
      const outgoing = current.connections.filter((edge) => prompts.some((node) => node.id === edge.from) && !nodeIds.includes(edge.to));
      const connections = current.connections.filter((edge) => !prompts.some((node) => node.id === edge.from))
        .concat([...new Set(outgoing.map((edge) => edge.to))].map((to) => ({ from: id, to })));
      set({ document: {
        ...current,
        connections,
        nodes: [...current.nodes, { id, type: 'promptGroup', x: left - 24, y: top - 58, w: right - left + 48, h: bottom - top + 90, items: prompts.map((node) => node.id) }],
      } });
      return id;
    },
    moveNode: (nodeId, x, y) => set(({ document }) => {
      const target = document?.nodes.find((node) => node.id === nodeId);
      if (!document || !target) return {};
      const ids = collectNodeIds(document.nodes, [nodeId]);
      const dx = x - Number(target.x || 0);
      const dy = y - Number(target.y || 0);
      return { document: { ...document, nodes: document.nodes.map((node) => ids.has(node.id)
        ? { ...node, x: Number(node.x || 0) + dx, y: Number(node.y || 0) + dy }
        : node) } };
    }),
    pasteNodes: (clipboard) => {
      const current = get().document;
      if (!current || !clipboard.nodes.length) return [];
      const idMap = new Map(clipboard.nodes.map((node) => [node.id, `${node.type}_${crypto.randomUUID()}`]));
      const nodes = structuredClone(clipboard.nodes).map((node) => ({
        ...node,
        id: idMap.get(node.id)!,
        x: Number(node.x || 0) + 32,
        y: Number(node.y || 0) + 32,
        ...(Array.isArray(node.items) ? { items: node.items.map((id) => idMap.get(String(id)) ?? id) } : {}),
      }));
      const connections = structuredClone(clipboard.connections).map((edge) => ({
        ...edge,
        from: idMap.get(edge.from)!,
        to: idMap.get(edge.to)!,
      })).filter((edge) => edge.from && edge.to);
      set({ document: { ...current, connections: [...current.connections, ...connections], nodes: [...current.nodes, ...nodes] } });
      return nodes.map((node) => node.id);
    },
    projectDocument: (snapshot) => {
      const next = decodeSnapshot(snapshot);
      if (next) set({ document: next });
    },
    updateNode: (nodeId, patch) => set(({ document }) => {
      if (!document?.nodes.some((node) => node.id === nodeId)) return {};
      const next = {
        ...document,
        nodes: document.nodes.map((node) => node.id === nodeId ? { ...node, ...patch, id: node.id, type: node.type } : node),
      };
      const graph = createGraphModel(next);
      return { document: { ...next, connections: next.connections.filter((edge) => graph.canConnect(edge.from, edge.to, true)) } };
    }),
  }));
}

export function bindCanvasDocumentEvents(target: EventTarget, store: DocumentStore): () => void {
  const listener = (event: Event) => {
    store.getState().projectDocument((event as CustomEvent<unknown>).detail);
  };
  target.addEventListener('canvas-legacy-document', listener);
  return () => target.removeEventListener('canvas-legacy-document', listener);
}

function decodeSnapshot(snapshot: unknown): CanvasDocument | null {
  if (!snapshot) return null;
  try {
    return decodeCanvasDocument(snapshot);
  } catch {
    return null;
  }
}

function collectNodeIds(nodes: CanvasNode[], roots: string[]): Set<string> {
  const ids = new Set<string>();
  const visit = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    const node = nodes.find((candidate) => candidate.id === id);
    if ((node?.type === 'group' || node?.type === 'promptGroup') && Array.isArray(node.items)) {
      node.items.forEach((childId) => visit(String(childId)));
    }
  };
  roots.forEach(visit);
  return ids;
}
