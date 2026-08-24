import { describe, expect, it } from 'vitest';
import type { CanvasDocument, CanvasNode } from '../domain/types';
import { isLikelyPanorama, smartPreviewCompareSources, smartPreviewDownloadPayload } from './smart-canvas-preview';

const document = (nodes: CanvasNode[], connections: CanvasDocument['connections'] = []): CanvasDocument => ({ id: 'preview', kind: 'smart', schemaVersion: 1, nodes, connections });

describe('SmartCanvasPreview legacy data parity', () => {
  it('prefers persisted input references and deduplicates image comparison sources', () => {
    const target: CanvasNode = { id: 'target', type: 'smart-image', images: [{ url: '/result.png' }], runInputRefs: [{ url: '/saved.png' }, { url: '/saved.png' }, { kind: 'video', url: '/ignored.mp4' }] };
    const source: CanvasNode = { id: 'source', type: 'smart-image', images: [{ url: '/upstream.png' }] };
    expect(smartPreviewCompareSources(document([source, target], [{ from: 'source', to: 'target' }]), target, '/result.png')).toEqual([{ url: '/saved.png' }]);
  });

  it('keeps batch download items in legacy grid row and column order', () => {
    const payload = smartPreviewDownloadPayload({ id: 'group', title: 'Grid', type: 'smart-image', images: [
      { grid: { row: 1, col: 0 }, name: 'b.png', url: '/b.png' },
      { grid: { row: 0, col: 1 }, name: 'a2.png', url: '/a2.png' },
      { grid: { row: 0, col: 0 }, name: 'a1.png', url: '/a1.png' },
    ] });
    expect(payload.filename).toBe('Grid.zip');
    expect(payload.urls).toEqual(['/a1.png', '/a2.png', '/b.png']);
    expect(payload.items.map((item) => item.name)).toEqual(['a1.png', 'a2.png', 'b.png']);
  });

  it('detects explicit and 2:1 panorama images without changing media data', () => {
    expect(isLikelyPanorama({ id: 'one', type: 'smart-image', runPrompt: '360 panorama' }, { url: '/wide.png' })).toBe(true);
    expect(isLikelyPanorama({ id: 'two', type: 'smart-image' }, { url: '/wide.png', natural_w: 4096, natural_h: 2048 })).toBe(true);
    expect(isLikelyPanorama({ id: 'three', type: 'smart-image' }, { url: '/square.png', natural_w: 1024, natural_h: 1024 })).toBe(false);
  });
});
