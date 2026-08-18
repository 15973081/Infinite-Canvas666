import { describe, expect, it } from 'vitest';
import { boundedDimension, normalizeImageResult, normalizeProviders, outputSize } from './domain';

describe('image studio domain', () => {
  it('normalizes provider model catalogs', () => {
    expect(normalizeProviders({ api_providers: [{ id: 'one', name: 'One', image_models: ['a', 'b'] }] })).toEqual([
      { id: 'one', name: 'One', protocol: undefined, base_url: undefined, image_models: ['a', 'b'] },
    ]);
  });
  it('normalizes direct and task image responses', () => {
    expect(normalizeImageResult({ url: '/output/a.png' }, 'hello', 'zimage')).toMatchObject({ prompt: 'hello', images: ['/output/a.png'], type: 'zimage' });
    expect(() => normalizeImageResult({ images: [] }, 'bad')).toThrow('没有返回图片');
  });
  it('bounds dimensions on a 16 pixel grid', () => {
    expect(boundedDimension(1023)).toBe(1024);
    expect(outputSize(1, 9000)).toBe('64x8192');
  });
});
