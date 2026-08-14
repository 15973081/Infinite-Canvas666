import { describe, expect, it } from 'vitest';
import { decodeCanvasDocument, encodeCanvasDocument } from './document-codec';
import { createGraphModel } from './graph';
import type { CanvasDocument } from './types';

function document(nodes: Array<[string, string]>, connections: Array<[string, string]>): CanvasDocument {
  return {
    schemaVersion: 1,
    nodes: nodes.map(([id, type]) => ({ id, type })),
    connections: connections.map(([from, to]) => ({ from, to })),
  };
}

describe('document codec', () => {
  it('preserves unknown fields and unknown node types', () => {
    const input = {
      id: 'fixture',
      futureTopLevelField: { enabled: true },
      nodes: [{ id: 'custom-1', type: 'future-node', futureNodeField: ['kept'] }],
      connections: [],
    };

    expect(encodeCanvasDocument(decodeCanvasDocument(input))).toEqual({
      ...input,
      schemaVersion: 1,
    });
  });

  it('rejects malformed persisted graph data', () => {
    expect(() => decodeCanvasDocument({ nodes: [{ id: 'missing-type' }], connections: [] })).toThrow(
      'nodes[0].type',
    );
  });
});

describe('graph model', () => {
  it.each([
    {
      name: 'linear',
      graph: document(
        [['a', 'generator'], ['b', 'video']],
        [['a', 'b']],
      ),
      target: 'b',
      expected: ['a', 'b'],
    },
    {
      name: 'branch merge without duplicates',
      graph: document(
        [['a', 'generator'], ['b', 'llm'], ['c', 'video']],
        [['a', 'b'], ['a', 'c'], ['b', 'c']],
      ),
      target: 'c',
      expected: ['a', 'b', 'c'],
    },
    {
      name: 'output passthrough',
      graph: document(
        [['a', 'generator'], ['out', 'output'], ['b', 'video']],
        [['a', 'out'], ['out', 'b']],
      ),
      target: 'b',
      expected: ['a', 'b'],
    },
  ])('$name cascade order', ({ graph, target, expected }) => {
    expect(createGraphModel(graph).cascadeOrder(target)).toEqual(expected);
  });

  it('detects direct and output-mediated cycles', () => {
    const graph = createGraphModel(
      document(
        [['a', 'generator'], ['out', 'output'], ['b', 'video']],
        [['a', 'out'], ['out', 'b']],
      ),
    );
    expect(graph.wouldCreateCycle('b', 'a')).toBe(true);
    expect(graph.wouldCreateCycle('a', 'b')).toBe(false);
  });

  it('matches legacy first-node behavior for duplicate ids and ignores missing nodes', () => {
    const graph: CanvasDocument = {
      schemaVersion: 1,
      nodes: [
        { id: 'a', type: 'generator' },
        { id: 'a', type: 'prompt' },
        { id: 'b', type: 'video' },
      ],
      connections: [
        { from: 'missing', to: 'b' },
        { from: 'a', to: 'b' },
      ],
    };
    expect(createGraphModel(graph).cascadeOrder('b')).toEqual(['a', 'b']);
  });
});
