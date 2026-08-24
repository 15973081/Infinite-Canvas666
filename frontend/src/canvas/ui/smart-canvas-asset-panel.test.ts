import { describe, expect, it } from 'vitest';
import type { CanvasAssetCategory, CanvasAssetItem } from '../infrastructure/asset-library-client';
import { smartCanvasAssetAvatarState, smartCanvasAssetItems } from './smart-canvas-asset-panel';

describe('SmartCanvasAssetPanel', () => {
  const items: CanvasAssetItem[] = [
    { id: 'a', kind: 'image', name: 'Face Portrait.png', registrations: { volcengine: { asset_uri: 'asset://face', status: 'Active' } }, url: '/face.png' },
    { id: 'b', kind: 'image', name: 'Landscape.png', registrations: { volcengine: { status: 'Processing' } }, url: '/landscape.png' },
  ];
  const category: CanvasAssetCategory = { id: 'images', items, name: '素材', type: 'image' };

  it('filters the active legacy category by asset name', () => {
    expect(smartCanvasAssetItems(category, 'portrait')).toEqual([items[0]]);
    expect(smartCanvasAssetItems(category, ' LAND ')).toEqual([items[1]]);
  });

  it('maps active, processing, failed and absent avatar registration states', () => {
    expect(smartCanvasAssetAvatarState(items[0])).toBe('active');
    expect(smartCanvasAssetAvatarState(items[1])).toBe('processing');
    expect(smartCanvasAssetAvatarState({ ...items[0], asset_uris: undefined, registrations: { volcengine: { status: 'Failed' } } })).toBe('failed');
    expect(smartCanvasAssetAvatarState({ ...items[0], asset_uris: undefined, registrations: undefined })).toBe('none');
  });
});
