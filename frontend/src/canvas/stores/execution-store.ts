import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ExecutionState } from '../domain/execution';

export interface ExecutionStoreState {
  project(state: Readonly<ExecutionState>): void;
  runs: Record<string, ExecutionState>;
}

export type ExecutionStore = StoreApi<ExecutionStoreState>;

export function createExecutionStore(): ExecutionStore {
  return createStore<ExecutionStoreState>()((set) => ({
    runs: {},
    project: (state) => set(({ runs }) => ({
      runs: { ...runs, [state.targetId]: cloneExecutionState(state) },
    })),
  }));
}

export function bindExecutionEvents(target: EventTarget, store: ExecutionStore): () => void {
  const listener = (event: Event) => {
    const state = (event as CustomEvent<{ state?: unknown }>).detail?.state;
    if (isExecutionState(state)) store.getState().project(state);
  };
  target.addEventListener('canvas-modern-execution', listener);
  return () => target.removeEventListener('canvas-modern-execution', listener);
}

function isExecutionState(value: unknown): value is ExecutionState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ExecutionState>;
  return typeof state.targetId === 'string'
    && typeof state.status === 'string'
    && Array.isArray(state.order)
    && Array.isArray(state.completedNodeIds)
    && Boolean(state.rounds && typeof state.rounds === 'object');
}

function cloneExecutionState(state: Readonly<ExecutionState>): ExecutionState {
  return {
    ...state,
    completedNodeIds: [...state.completedNodeIds],
    order: [...state.order],
    rounds: Object.fromEntries(Object.entries(state.rounds).map(([roundId, round]) => [
      roundId,
      { ...round, completedNodeIds: [...round.completedNodeIds] },
    ])),
  };
}
