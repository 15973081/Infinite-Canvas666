import { describe, expect, it } from 'vitest';
import { legacyGridJoinLayout } from './legacy-image-transform-dialog';

describe('SmartCanvasImageEditor legacy grid join parity', () => {
  it('keeps the legacy 420px cell cap, gap and visual order', () => {
    const layout = legacyGridJoinLayout([
      { natural_h: 800, natural_w: 1200, url: '/one.png' },
      { natural_h: 600, natural_w: 600, url: '/two.png' },
      { natural_h: 1600, natural_w: 800, url: '/three.png' },
    ], [2, 0, 1], 2, 2, 12);
    expect(layout).toMatchObject({ cols: 2, gap: 12, rows: 2, width: 642, height: 852 });
    expect(layout.items.map((item) => item.index)).toEqual([2, 0, 1]);
    expect(layout.items.map(({ x, y }) => [x, y])).toEqual([[0, 0], [327, 0], [0, 432]]);
  });

  it('expands rows when a selected preset has fewer cells than images', () => {
    const layout = legacyGridJoinLayout(Array.from({ length: 3 }, (_, index) => ({ url: `/${index}.png` })), [0, 1, 2], 1, 2, 0);
    expect(layout.rows).toBe(2);
    expect(layout.items[2]).toMatchObject({ x: 0, y: 420 });
  });
});
