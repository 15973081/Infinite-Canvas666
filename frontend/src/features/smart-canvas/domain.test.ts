import { describe, expect, it } from 'vitest';
import { migrateLegacySmartDocument } from './domain';

describe('migrateLegacySmartDocument', () => {
  it('maps legacy prompt and loop nodes while preserving smart-image results', () => {
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
      type: 'smart-image', images: [{ url: '/a.png', name: 'A', kind: 'image' }, { url: '/b.mp4', kind: 'video' }],
    });
  });

  it('keeps legacy inputs connected directly to the smart-image node', () => {
    const migrated = migrateLegacySmartDocument({
      id: 'smart', kind: 'smart', schemaVersion: 1,
      settings: { engine: 'modelscope', msModel: 'custom', model: 'org/model', width: 768, height: 512 },
      connections: [{ from: 'prompt', to: 'target' }],
      nodes: [
        { id: 'prompt', type: 'smart-prompt', text: 'hello' },
        { id: 'target', type: 'smart-image', images: [] },
      ],
    });

    expect(migrated.nodes).toHaveLength(2);
    expect(migrated.nodes.find((node) => node.id === 'target')).toMatchObject({ type: 'smart-image', images: [] });
    expect(migrated.connections).toEqual([{ from: 'prompt', to: 'target' }]);
  });

  it('leaves V2 and classic documents untouched', () => {
    const document = { id: 'v2', kind: 'smart', schemaVersion: 1, connections: [], nodes: [{ id: 'p', type: 'prompt' }] };
    expect(migrateLegacySmartDocument(document)).toBe(document);
  });

  it('preserves unfinished tasks on the original smart-image node', () => {
    const migrated = migrateLegacySmartDocument({
      id: 'pending-smart', kind: 'smart', schemaVersion: 1,
      settings: { engine: 'api', provider_id: 'provider', model: 'image-v1' },
      connections: [],
      nodes: [{
        id: 'target', type: 'smart-image', images: [], runStartedAt: 123,
        pendingTasks: [{ taskId: 'task-42', kind: 'image', providerId: 'provider' }],
      }],
    });

    expect(migrated.nodes.find((node) => node.id === 'target')).toMatchObject({
      type: 'smart-image', pendingTasks: [{ taskId: 'task-42', kind: 'image', providerId: 'provider' }], runStartedAt: 123,
    });
    expect(migrated.nodes).toHaveLength(1);
  });

  it('keeps legacy history groups as smart-image nodes', () => {
    const migrated = migrateLegacySmartDocument({
      id: 'history-smart', kind: 'smart', schemaVersion: 1, connections: [],
      nodes: [{ id: 'history', type: 'smart-image', historyFor: 'source', runSettings: { engine: 'api' }, images: [{ url: '/old.png' }] }],
    });

    expect(migrated.nodes).toHaveLength(1);
    expect(migrated.nodes[0]).toMatchObject({ id: 'history', type: 'smart-image', historyFor: 'source' });
  });
});
