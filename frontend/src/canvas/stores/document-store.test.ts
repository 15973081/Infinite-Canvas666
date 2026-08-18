import { describe, expect, it } from 'vitest';
import { bindCanvasDocumentEvents, createDocumentStore } from './document-store';

describe('document store', () => {
  it('keeps a decoded, detached projection and ignores invalid events', () => {
    const source = { id: 'canvas-1', nodes: [{ id: 'a', type: 'prompt', value: 'first' }], connections: [] };
    const target = new EventTarget();
    const store = createDocumentStore(source);
    const unbind = bindCanvasDocumentEvents(target, store);

    source.nodes[0].value = 'mutated';
    expect(store.getState().document?.nodes[0].value).toBe('first');

    target.dispatchEvent(new CustomEvent('canvas-legacy-document', {
      detail: { id: 'canvas-2', nodes: [{ id: 'b', type: 'output' }], connections: [] },
    }));
    expect(store.getState().document).toMatchObject({ id: 'canvas-2', nodes: [{ id: 'b', type: 'output' }] });

    target.dispatchEvent(new CustomEvent('canvas-legacy-document', { detail: { nodes: 'invalid' } }));
    expect(store.getState().document?.id).toBe('canvas-2');

    unbind();
    target.dispatchEvent(new CustomEvent('canvas-legacy-document', {
      detail: { id: 'canvas-3', nodes: [], connections: [] },
    }));
    expect(store.getState().document?.id).toBe('canvas-2');
  });
});
