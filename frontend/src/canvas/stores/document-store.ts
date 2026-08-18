import { createStore, type StoreApi } from 'zustand/vanilla';
import { decodeCanvasDocument } from '../domain/document-codec';
import { createGraphModel } from '../domain/graph';
import type { CanvasDocument } from '../domain/types';

export interface DocumentStoreState {
  acceptSavedDocument(saved: CanvasDocument, submitted: CanvasDocument): void;
  adoptDocument(snapshot: unknown): void;
  connectNodes(fromId: string, toId: string): boolean;
  deleteConnection(index: number): void;
  deleteNode(nodeId: string): void;
  document: CanvasDocument | null;
  moveNode(nodeId: string, x: number, y: number): void;
  projectDocument(snapshot: unknown): void;
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
    connectNodes: (fromId, toId) => {
      const current = get().document;
      if (!current || !createGraphModel(current).canConnect(fromId, toId)) return false;
      set({ document: { ...current, connections: [...current.connections, { from: fromId, to: toId }] } });
      return true;
    },
    deleteConnection: (index) => set(({ document }) => document && index >= 0 && index < document.connections.length
      ? { document: { ...document, connections: document.connections.filter((_, edgeIndex) => edgeIndex !== index) } }
      : {}),
    deleteNode: (nodeId) => set(({ document }) => document?.nodes.some((node) => node.id === nodeId)
      ? {
          document: {
            ...document,
            connections: document.connections.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
            nodes: document.nodes.filter((node) => node.id !== nodeId),
          },
        }
      : {}),
    moveNode: (nodeId, x, y) => set(({ document }) => document?.nodes.some((node) => node.id === nodeId)
      ? { document: { ...document, nodes: document.nodes.map((node) => node.id === nodeId ? { ...node, x, y } : node) } }
      : {}),
    projectDocument: (snapshot) => {
      const next = decodeSnapshot(snapshot);
      if (next) set({ document: next });
    },
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
