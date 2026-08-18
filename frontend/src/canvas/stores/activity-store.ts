import { createStore, type StoreApi } from 'zustand/vanilla';

export type ActivityMode = 'cost' | 'logs';

export interface CanvasCostSummary {
  calls: number;
  estimated: number;
  image: number;
  total: number;
  unknown: number;
  video: number;
}

export interface CanvasActivityLog {
  costMicros: number | null;
  costSource: string;
  createdAt: number;
  error: string;
  id: string;
  model: string;
  outputCount: number;
  platform: string;
  prompt: string;
  runMs: number;
  status: 'failed' | 'success';
}

export interface CanvasActivitySnapshot {
  costs: CanvasCostSummary;
  logs: CanvasActivityLog[];
  mode: ActivityMode;
}

export interface ActivityStoreState {
  projectActivity(snapshot: CanvasActivitySnapshot): void;
  snapshot: CanvasActivitySnapshot;
}

export type ActivityStore = StoreApi<ActivityStoreState>;

const emptySnapshot: CanvasActivitySnapshot = {
  costs: { calls: 0, estimated: 0, image: 0, total: 0, unknown: 0, video: 0 },
  logs: [],
  mode: 'logs',
};

export function createActivityStore(initial?: unknown): ActivityStore {
  const snapshot = isActivitySnapshot(initial) ? cloneSnapshot(initial) : cloneSnapshot(emptySnapshot);
  return createStore<ActivityStoreState>()((set) => ({
    snapshot,
    projectActivity: (next) => set({ snapshot: cloneSnapshot(next) }),
  }));
}

export function bindCanvasActivityEvents(target: EventTarget, store: ActivityStore): () => void {
  const listener = (event: Event) => {
    const snapshot = (event as CustomEvent<unknown>).detail;
    if (isActivitySnapshot(snapshot)) store.getState().projectActivity(snapshot);
  };
  target.addEventListener('canvas-legacy-activity', listener);
  return () => target.removeEventListener('canvas-legacy-activity', listener);
}

function isActivitySnapshot(value: unknown): value is CanvasActivitySnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<CanvasActivitySnapshot>;
  const costs = snapshot.costs as Partial<CanvasCostSummary> | undefined;
  return (snapshot.mode === 'cost' || snapshot.mode === 'logs')
    && Array.isArray(snapshot.logs)
    && snapshot.logs.every(isActivityLog)
    && Boolean(costs)
    && ['calls', 'estimated', 'image', 'total', 'unknown', 'video']
      .every((key) => Number.isFinite(Number(costs?.[key as keyof CanvasCostSummary])));
}

function isActivityLog(value: unknown): value is CanvasActivityLog {
  if (!value || typeof value !== 'object') return false;
  const log = value as Partial<CanvasActivityLog>;
  return (log.status === 'failed' || log.status === 'success')
    && (log.costMicros === null || Number.isFinite(log.costMicros))
    && ['costSource', 'error', 'id', 'model', 'platform', 'prompt']
      .every((key) => typeof log[key as keyof CanvasActivityLog] === 'string')
    && ['createdAt', 'outputCount', 'runMs']
      .every((key) => Number.isFinite(log[key as keyof CanvasActivityLog]));
}

function cloneSnapshot(snapshot: CanvasActivitySnapshot): CanvasActivitySnapshot {
  return {
    costs: { ...snapshot.costs },
    logs: snapshot.logs.map((log) => ({ ...log })),
    mode: snapshot.mode,
  };
}
