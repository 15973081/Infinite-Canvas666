import { describe, expect, it } from 'vitest';
import { binaryMaskPixels, circledNumber, normalizeCrop, normalizeOutpaint, transformedImageName } from './image-transform';

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
});
