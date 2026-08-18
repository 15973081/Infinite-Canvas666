import { describe, expect, it } from 'vitest';
import { bindCanvasActivityEvents, createActivityStore, type CanvasActivitySnapshot } from './activity-store';

const snapshot: CanvasActivitySnapshot = {
  costs: { calls: 1, estimated: 0, image: 2_000_000, total: 2_000_000, unknown: 0, video: 0 },
  logs: [{
    costMicros: 2_000_000,
    costSource: 'actual',
    createdAt: 1,
    error: '',
    id: 'log-1',
    model: 'image-model',
    outputCount: 1,
    platform: 'API',
    prompt: 'draw',
    runMs: 20,
    status: 'success',
  }],
  mode: 'cost',
};

describe('activity store', () => {
  it('projects detached activity snapshots and detaches cleanly', () => {
    const target = new EventTarget();
    const store = createActivityStore();
    const unbind = bindCanvasActivityEvents(target, store);

    target.dispatchEvent(new CustomEvent('canvas-legacy-activity', { detail: snapshot }));
    snapshot.logs[0].prompt = 'mutated';
    expect(store.getState().snapshot.logs[0].prompt).toBe('draw');
    expect(store.getState().snapshot.costs.total).toBe(2_000_000);

    target.dispatchEvent(new CustomEvent('canvas-legacy-activity', {
      detail: { ...snapshot, logs: [{ status: 'success' }] },
    }));
    expect(store.getState().snapshot.logs[0].id).toBe('log-1');

    unbind();
    target.dispatchEvent(new CustomEvent('canvas-legacy-activity', {
      detail: { ...snapshot, mode: 'logs' },
    }));
    expect(store.getState().snapshot.mode).toBe('cost');
  });
});
