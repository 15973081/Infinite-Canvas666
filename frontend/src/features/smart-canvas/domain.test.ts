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

  it('preserves unfinished legacy tasks as recoverable V2 output work', () => {
    const migrated = migrateLegacySmartDocument({
      id: 'pending-smart', kind: 'smart', schemaVersion: 1,
      settings: { engine: 'api', provider_id: 'provider', model: 'image-v1' },
      connections: [],
      nodes: [{
        id: 'target', type: 'smart-image', images: [], runStartedAt: 123,
        pendingTasks: [{ taskId: 'task-42', kind: 'image', providerId: 'provider' }],
      }],
    });

    expect(migrated.nodes.find((node) => node.id === 'target__generator')).toMatchObject({
      type: 'generator', runStatus: 'recovering', legacySmartNodeId: 'target',
    });
    expect(migrated.nodes.find((node) => node.id === 'target')).toMatchObject({
      type: 'output', running: false,
      _pending: [{ canvasTaskId: 'task-42', canvasTaskType: 'image', nodeId: 'target__generator', recoveryStatus: 'interrupted', startedAt: 123 }],
    });
  });

  it('keeps legacy history groups as output-only nodes', () => {
    const migrated = migrateLegacySmartDocument({
      id: 'history-smart', kind: 'smart', schemaVersion: 1, connections: [],
      nodes: [{ id: 'history', type: 'smart-image', historyFor: 'source', runSettings: { engine: 'api' }, images: [{ url: '/old.png' }] }],
    });

    expect(migrated.nodes).toHaveLength(1);
    expect(migrated.nodes[0]).toMatchObject({ id: 'history', type: 'output', historyFor: 'source' });
  });
});
