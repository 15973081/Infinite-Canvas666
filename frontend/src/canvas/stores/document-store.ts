import { createStore, type StoreApi } from 'zustand/vanilla';
import { decodeCanvasDocument } from '../domain/document-codec';
import type { CanvasDocument } from '../domain/types';

export interface DocumentStoreState {
  document: CanvasDocument | null;
  projectDocument(snapshot: unknown): void;
}

export type DocumentStore = StoreApi<DocumentStoreState>;

export function createDocumentStore(initial?: unknown): DocumentStore {
  const document = decodeSnapshot(initial);
  return createStore<DocumentStoreState>()((set) => ({
    document,
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
