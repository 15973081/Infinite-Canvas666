import { describe, expect, it } from 'vitest';
import { bindCanvasStatusEvents, createSessionStore } from './session-store';

describe('session store', () => {
  it('projects valid legacy status events and detaches cleanly', () => {
    const target = new EventTarget();
    const store = createSessionStore();
    const unbind = bindCanvasStatusEvents(target, store);

    target.dispatchEvent(new CustomEvent('canvas-legacy-status', {
      detail: { kind: 'success', text: 'Saved' },
    }));
    expect(store.getState().status).toEqual({ kind: 'success', text: 'Saved' });

    unbind();
    target.dispatchEvent(new CustomEvent('canvas-legacy-status', {
      detail: { kind: 'error', text: 'Save failed' },
    }));
    expect(store.getState().status.text).toBe('Saved');
  });
});
