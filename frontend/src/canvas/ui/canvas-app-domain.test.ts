import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCanvasAssetInbox } from './canvas-app-domain';

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
});

afterEach(() => storage.clear());

describe('readCanvasAssetInbox', () => {
  it('normalizes the asset manager payload', () => {
    storage.set('inbox', JSON.stringify({
      created_at: 1_000,
      items: [{ url: '/a.png', name: 'A', kind: 'image' }, { url: '', name: 'empty' }, { url: '/b.mp4', type: 'video' }],
    }));

    expect(readCanvasAssetInbox('inbox', 2_000)).toEqual([
      { url: '/a.png', name: 'A', kind: 'image' },
      { url: '/b.mp4', name: '素材', kind: 'video' },
    ]);
  });

  it('accepts the legacy timestamp and rejects expired or malformed payloads', () => {
    storage.set('inbox', JSON.stringify({ ts: 1_000, items: [{ url: '/a.png' }] }));
    expect(readCanvasAssetInbox('inbox', 1_000 + 30 * 60 * 1_000 + 1)).toEqual([]);
    storage.set('inbox', '{');
    expect(readCanvasAssetInbox('inbox')).toEqual([]);
  });
});
