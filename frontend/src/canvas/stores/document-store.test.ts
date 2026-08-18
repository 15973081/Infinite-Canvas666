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

  it('owns V2 node and connection mutations without accepting same-document projections', () => {
    const store = createDocumentStore({
      id: 'canvas-1',
      nodes: [{ id: 'prompt', type: 'prompt', x: 0, y: 0 }, { id: 'generator', type: 'generator', x: 100, y: 0 }],
      connections: [],
      updated_at: 1,
    });
    store.getState().moveNode('prompt', 20, 30);
    expect(store.getState().connectNodes('prompt', 'generator')).toBe(true);
    expect(store.getState().connectNodes('prompt', 'generator')).toBe(false);
    store.getState().adoptDocument({ id: 'canvas-1', nodes: [], connections: [] });
    expect(store.getState().document).toMatchObject({
      nodes: [{ id: 'prompt', x: 20, y: 30 }, { id: 'generator' }],
      connections: [{ from: 'prompt', to: 'generator' }],
    });
    store.getState().deleteConnection(0);
    store.getState().deleteNode('generator');
    expect(store.getState().document).toMatchObject({ nodes: [{ id: 'prompt' }], connections: [] });
  });
});
