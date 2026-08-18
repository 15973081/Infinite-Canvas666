import { describe, expect, it } from 'vitest';
import { mergeCanvasDocuments } from './document-merge';

const base = {
  id: 'canvas-1', updated_at: 10, title: 'Base', custom: { base: true }, connections: [{ from: 'a', to: 'b' }],
  nodes: [{ id: 'a', type: 'prompt', text: 'old', x: 0 }, { id: 'b', type: 'generator', model: 'm1' }],
};

describe('canvas document three-way merge', () => {
  it('automatically rebases disjoint local and remote edits while preserving extensions', () => {
    const local = structuredClone(base);
    local.nodes[0].text = 'local';
    const remote = structuredClone(base);
    remote.updated_at = 20;
    remote.nodes[1].model = 'm2';
    (remote.custom as Record<string, unknown>).future = 7;

    const result = mergeCanvasDocuments(base, local, remote);

    expect(result.conflicts).toEqual([]);
    expect(result.document).toMatchObject({ updated_at: 20, custom: { base: true, future: 7 } });
    expect(result.document.nodes).toMatchObject([{ id: 'a', text: 'local' }, { id: 'b', model: 'm2' }]);
  });

  it('reports same-field conflicts and keeps the local value for explicit resolution', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.nodes[0].text = 'local';
    remote.nodes[0].text = 'remote';
    remote.updated_at = 20;

    const result = mergeCanvasDocuments(base, local, remote);

    expect(result.conflicts).toEqual(['nodes.a.text']);
    expect(result.document.nodes[0].text).toBe('local');
  });

  it('merges independent additions and deletions without resurrecting unchanged records', () => {
    const local = structuredClone(base);
    local.nodes = local.nodes.filter((node) => node.id !== 'a');
    const remote = structuredClone(base);
    remote.updated_at = 20;
    remote.nodes.push({ id: 'c', type: 'output' } as typeof remote.nodes[number]);

    const result = mergeCanvasDocuments(base, local, remote);

    expect(result.conflicts).toEqual([]);
    expect(result.document.nodes.map((node) => node.id)).toEqual(['b', 'c']);
  });
});
