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

  it('merges background execution recovery without overwriting concurrent V2 edits', () => {
    const store = createDocumentStore({
      id: 'canvas-1', updated_at: 1,
      nodes: [
        { id: 'generator', type: 'generator', quality: 'low', runStatus: 'pending' },
        { id: 'output', type: 'output', images: [], _pending: [{ id: 'pending-1' }] },
      ],
      connections: [],
    });
    store.getState().updateNode('generator', { quality: 'high', futureLocalEdit: true });
    store.getState().projectExecutionDocument({
      id: 'canvas-1', updated_at: 2,
      nodes: [
        { id: 'generator', type: 'generator', quality: 'stale', runStatus: 'done', runError: '', generatedOutputs: ['/output/result.png'] },
        { id: 'output', type: 'output', images: [{ url: '/output/result.png', run: { taskId: 'task-1' } }], _pending: [] },
      ],
      connections: [],
    });
    expect(store.getState().document).toMatchObject({
      updated_at: 2,
      nodes: [
        { id: 'generator', quality: 'high', futureLocalEdit: true, runStatus: 'done', generatedOutputs: ['/output/result.png'] },
        { id: 'output', images: [{ url: '/output/result.png' }], _pending: [] },
      ],
    });
  });

  it('projects runtime-created Output nodes and their connections without accepting unrelated nodes', () => {
    const store = createDocumentStore({
      id: 'canvas-1', updated_at: 1,
      nodes: [{ id: 'generator', type: 'generator', x: 100, y: 100 }],
      connections: [],
    });
    store.getState().projectExecutionDocument({
      id: 'canvas-1', updated_at: 2,
      nodes: [
        { id: 'generator', type: 'generator', x: 100, y: 100, runStatus: 'done', generatedOutputs: ['/output/result.png'] },
        { id: 'runtime-output', type: 'output', x: 560, y: 100, images: [{ url: '/output/result.png', kind: 'image' }], _pending: [] },
        { id: 'runtime-prompt', type: 'prompt', x: 0, y: 0, text: 'must not be projected' },
      ],
      connections: [
        { from: 'generator', to: 'runtime-output' },
        { from: 'runtime-prompt', to: 'generator' },
      ],
      logs: [{ id: 'run-log', status: 'done' }],
    });

    expect(store.getState().document).toMatchObject({
      updated_at: 2,
      nodes: [
        { id: 'generator', runStatus: 'done', generatedOutputs: ['/output/result.png'] },
        { id: 'runtime-output', type: 'output', images: [{ url: '/output/result.png', kind: 'image' }] },
      ],
      connections: [{ from: 'generator', to: 'runtime-output' }],
      logs: [{ id: 'run-log', status: 'done' }],
    });
    expect(store.getState().document?.nodes.some((node) => node.id === 'runtime-prompt')).toBe(false);
  });

  it('creates and edits low-risk nodes while preserving group membership', () => {
    const store = createDocumentStore({ id: 'canvas-1', nodes: [], connections: [], updated_at: 1 });
    const promptId = store.getState().addNode('prompt', { x: 10, y: 20 })!;
    const loopId = store.getState().addNode('loop', { x: 400, y: 20 })!;
    store.getState().updateNode(promptId, { text: 'first prompt', future: 7 });
    store.getState().updateNode(loopId, { showPrompt: true, count: 5, variablePrompt: 'shot 《计数》' });
    expect(store.getState().connectNodes(promptId, loopId)).toBe(true);
    store.getState().updateNode(loopId, { showPrompt: false });
    expect(store.getState().document?.connections).toEqual([]);

    const secondPromptId = store.getState().addNode('prompt', { x: 40, y: 260 })!;
    const groupId = store.getState().groupPromptNodes([promptId, secondPromptId])!;
    const before = store.getState().document?.nodes.find((node) => node.id === secondPromptId);
    store.getState().moveNode(groupId, 100, 100);
    const after = store.getState().document?.nodes.find((node) => node.id === secondPromptId);
    expect(Number(after?.x) - Number(before?.x)).toBe(114);
    expect(Number(after?.y) - Number(before?.y)).toBe(138);

    const clipboard = store.getState().copyNodes([groupId]);
    const pasted = store.getState().pasteNodes(clipboard);
    expect(pasted).toHaveLength(3);
    store.getState().deleteNode(groupId);
    expect(store.getState().document?.nodes.some((node) => [groupId, promptId, secondPromptId].includes(node.id))).toBe(false);
    expect(store.getState().document?.nodes.find((node) => node.id === pasted[0])).toBeTruthy();
  });

  it('creates generator, ModelScope and output nodes with executable defaults', () => {
    const store = createDocumentStore({ id: 'canvas-1', nodes: [], connections: [] });
    const ids = ['generator', 'msgen', 'output'].map((type, index) => store.getState().addNode(type as 'generator' | 'msgen' | 'output', { x: index * 100, y: 0 }));
    expect(store.getState().document?.nodes).toMatchObject([
      { id: ids[0], type: 'generator', ratio: 'square', resolution: '1k', count: 1, fitImage: false },
      { id: ids[1], type: 'msgen', msgenModel: 'zimage', msRatio: 'square', count: 1, msLoraEnabled: false, msCustomRatio: '' },
      { id: ids[2], type: 'output', images: [], imageComparisons: {} },
    ]);
  });

  it('creates video, Comfy and LLM nodes with legacy-compatible fields', () => {
    const store = createDocumentStore({ id: 'canvas-1', nodes: [], connections: [] });
    const ids = ['video', 'comfy', 'llm'].map((type, index) => store.getState().addNode(type as 'video' | 'comfy' | 'llm', { x: index * 100, y: 0 }));
    expect(store.getState().document?.nodes).toMatchObject([
      { id: ids[0], type: 'video', duration: 5, aspectRatio: '16:9', taskMode: 'auto', manualVideoUrls: [], tempShLinks: [] },
      { id: ids[1], type: 'comfy', mode: 'text', width: 1024, height: 1024, comfyParams: {}, comfyRandomActive: {} },
      { id: ids[2], type: 'llm', mode: 'node', showSystem: false, messages: [], outputText: '' },
    ]);
  });

  it('owns media groups and LTX timeline defaults', () => {
    const store = createDocumentStore({ id: 'canvas-1', nodes: [], connections: [] });
    const first = store.getState().addNode('image', { x: 10, y: 20 })!;
    const second = store.getState().addNode('image', { x: 300, y: 20 })!;
    const ltx = store.getState().addNode('ltxDirector', { x: 10, y: 400 })!;
    store.getState().updateNode(first, { url: '/first.png', mediaKind: 'image' });
    store.getState().updateNode(second, { url: '/second.mp4', mediaKind: 'video' });
    const group = store.getState().groupNodes([first, second])!;
    expect(store.getState().document?.nodes.find((node) => node.id === group)).toMatchObject({ type: 'group', items: [first, second] });
    expect(store.getState().document?.nodes.find((node) => node.id === ltx)).toMatchObject({ type: 'ltxDirector', durationFrames: 120, frameRate: 24, w: 1000, h: 800 });
    store.getState().deleteNode(group);
    expect(store.getState().document?.nodes.map((node) => node.id)).toEqual([ltx]);
  });
});
