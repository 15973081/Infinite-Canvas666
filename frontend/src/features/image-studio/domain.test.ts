import { describe, expect, it } from 'vitest';
import { boundedDimension, normalizeImageResult, normalizeProviders, outputSize } from './domain';
import { anglePrompt } from './workflow-adapters';

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
  it('builds a stable angle instruction from reusable controls', () => {
    expect(anglePrompt('保留人物', 35, -10, 2)).toBe('保留人物\n将相机向右旋转35度，仰视10度，使用特写镜头并靠近主体');
  });
});
