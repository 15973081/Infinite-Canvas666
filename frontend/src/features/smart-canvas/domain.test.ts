import { describe, expect, it } from 'vitest';
import { migrateLegacySmartDocument } from './domain';

describe('migrateLegacySmartDocument', () => {
  it('maps legacy prompt, loop and media nodes without losing results', () => {
    const migrated = migrateLegacySmartDocument({
      id: 'smart', kind: 'smart', schemaVersion: 1,
      connections: [],
      nodes: [
        { id: 'prompt', type: 'smart-prompt', text: 'hello' },
        { id: 'loop', type: 'smart-loop', loopCount: 3 },
        { id: 'media', type: 'smart-image', images: [{ url: '/a.png', name: 'A' }, { url: '/b.mp4' }] },
      ],
    });

    expect(migrated.nodes.find((node) => node.id === 'prompt')).toMatchObject({ type: 'prompt', text: 'hello' });
    expect(migrated.nodes.find((node) => node.id === 'loop')).toMatchObject({ type: 'loop', count: 3 });
    expect(migrated.nodes.find((node) => node.id === 'media')).toMatchObject({
      type: 'output', images: [{ url: '/a.png', name: 'A', kind: 'image' }, { url: '/b.mp4', kind: 'video' }],
    });
  });

  it('inserts the matching V2 generator and rewires legacy inputs', () => {
    const migrated = migrateLegacySmartDocument({
      id: 'smart', kind: 'smart', schemaVersion: 1,
      settings: { engine: 'modelscope', msModel: 'custom', model: 'org/model', width: 768, height: 512 },
      connections: [{ from: 'prompt', to: 'target' }],
      nodes: [
        { id: 'prompt', type: 'smart-prompt', text: 'hello' },
        { id: 'target', type: 'smart-image', images: [] },
      ],
    });

    expect(migrated.nodes.find((node) => node.id === 'target__generator')).toMatchObject({
      type: 'msgen', msCustomModel: 'org/model', msHeight: 512, msWidth: 768,
    });
    expect(migrated.connections).toEqual([
      { from: 'prompt', to: 'target__generator' },
      { from: 'target__generator', to: 'target' },
    ]);
  });

  it('leaves V2 and classic documents untouched', () => {
    const document = { id: 'v2', kind: 'smart', schemaVersion: 1, connections: [], nodes: [{ id: 'p', type: 'prompt' }] };
    expect(migrateLegacySmartDocument(document)).toBe(document);
  });
});
