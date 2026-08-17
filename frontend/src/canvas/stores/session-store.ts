import { createStore, type StoreApi } from 'zustand/vanilla';

export type CanvasStatusKind = 'error' | 'info' | 'pending' | 'success';

export interface CanvasStatus {
  kind: CanvasStatusKind;
  text: string;
}

export interface SessionStoreState {
  projectStatus(status: CanvasStatus): void;
  status: CanvasStatus;
}

export type SessionStore = StoreApi<SessionStoreState>;

export function createSessionStore(initial: CanvasStatus = { kind: 'info', text: '' }): SessionStore {
  return createStore<SessionStoreState>()((set) => ({
    status: { ...initial },
    projectStatus: (status) => set({ status: { ...status } }),
  }));
}

export function bindCanvasStatusEvents(target: EventTarget, store: SessionStore): () => void {
  const listener = (event: Event) => {
    const status = (event as CustomEvent<unknown>).detail;
    if (isCanvasStatus(status)) store.getState().projectStatus(status);
  };
  target.addEventListener('canvas-legacy-status', listener);
  return () => target.removeEventListener('canvas-legacy-status', listener);
}

function isCanvasStatus(value: unknown): value is CanvasStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<CanvasStatus>;
  return typeof status.text === 'string'
    && ['error', 'info', 'pending', 'success'].includes(String(status.kind));
}
