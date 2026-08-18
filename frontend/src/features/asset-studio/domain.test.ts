import { describe, expect, it } from 'vitest';
import { flattenTree, itemsForFolder, mediaMatches, promptMatches } from './domain';

describe('asset studio domain', () => {
  it('filters media and local folders', () => {
    const items = [{ id: '1', name: 'Hero.png', url: '/hero.png', kind: 'image' as const, folder: 'people', caption: 'red coat' }];
    expect(mediaMatches(items[0], 'COAT')).toBe(true);
    expect(itemsForFolder(items, 'people')).toHaveLength(1);
    expect(itemsForFolder(items, 'other')).toHaveLength(0);
  });

  it('flattens nested folders and searches prompt content', () => {
    const child = { id: 'b', name: 'B', path: 'b', items: [], children: [] };
    expect(flattenTree({ id: 'a', name: 'A', path: '', items: [], children: [child] })).toEqual([expect.objectContaining({ id: 'a' }), child]);
    expect(promptMatches({ name: 'portrait', positive: 'cinematic light' }, 'LIGHT')).toBe(true);
  });
});

