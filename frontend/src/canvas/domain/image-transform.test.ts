import { describe, expect, it } from 'vitest';
import { binaryMaskPixels, circledNumber, gridSplitRects, normalizeCrop, normalizeOutpaint, transformedImageName } from './image-transform';

describe('canvas image transforms', () => {
  it('clamps crop regions inside the source image', () => {
    expect(normalizeCrop({ x: 90, y: -4, width: 40, height: 500 }, { width: 100, height: 80 })).toEqual({
      x: 90, y: 0, width: 10, height: 80,
    });
  });

  it('keeps outpaint canvases within 4K and the source inside the result', () => {
    expect(normalizeOutpaint({ width: 5000, height: 100, offsetX: 9000, offsetY: -1 }, { width: 640, height: 480 })).toEqual({
      width: 4096, height: 480, offsetX: 3456, offsetY: 0,
    });
  });

  it('creates stable PNG names for transformed uploads', () => {
    expect(transformedImageName('portrait.jpeg', 'crop')).toBe('portrait_crop.png');
    expect(transformedImageName('', 'outpaint')).toBe('image_outpaint.png');
  });

  it('converts painted alpha into the legacy black and white mask', () => {
    expect([...binaryMaskPixels(new Uint8ClampedArray([
      255, 255, 255, 0,
      10, 20, 30, 8,
      10, 20, 30, 9,
    ]))]).toEqual([
      0, 0, 0, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
  });

  it('keeps the legacy circled labels for the first twenty brush markers', () => {
    expect(circledNumber(1)).toBe('①');
    expect(circledNumber(20)).toBe('⑳');
    expect(circledNumber(21)).toBe('21');
  });

  it('keeps regular grid gaps centered on each split line', () => {
    expect(gridSplitRects(100, 80, { rows: 2, cols: 2, gap: 10 })).toEqual([
      { row: 0, col: 0, x: 0, y: 0, w: 45, h: 35 },
      { row: 0, col: 1, x: 55, y: 0, w: 45, h: 35 },
      { row: 1, col: 0, x: 0, y: 45, w: 45, h: 35 },
      { row: 1, col: 1, x: 55, y: 45, w: 45, h: 35 },
    ]);
  });

  it('sorts custom grid lines and keeps their row and column metadata', () => {
    expect(gridSplitRects(100, 80, { gap: 0, lines: [{ type: 'v', pos: 0.75 }, { type: 'h', pos: 0.25 }, { type: 'v', pos: 0.25 }] })).toHaveLength(6);
    expect(gridSplitRects(100, 80, { gap: 0, lines: [{ type: 'h', pos: 0.25 }] })[1]).toEqual({ row: 1, col: 0, x: 0, y: 20, w: 100, h: 60 });
  });
});
