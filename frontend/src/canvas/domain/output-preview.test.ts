import { describe, expect, it } from 'vitest';
import { formatOutputRunDuration, outputComparisonUrl, outputDownloadName, outputPreviewItems, outputPreviewMeta } from './output-preview';

describe('output preview compatibility', () => {
  const node = {
    id: 'output-1',
    type: 'output',
    imageComparisons: { '/result.png': { name: 'input', url: '/input.png' } },
    images: [
      { kind: 'image', name: 'result.png', run: { prompt: 'legacy prompt' }, runMs: 65_000, url: '/result.png' },
      { kind: 'video', name: 'clip.mp4', url: '/clip.mp4' },
      { kind: 'audio', name: 'sound.wav', url: '/sound.wav' },
    ],
  };

  it('keeps the legacy image and video lightbox order', () => {
    expect(outputPreviewItems(node)).toEqual([
      expect.objectContaining({ kind: 'image', name: 'result.png', url: '/result.png' }),
      expect.objectContaining({ kind: 'video', name: 'clip.mp4', url: '/clip.mp4' }),
    ]);
    expect(outputPreviewMeta(node, '/result.png')).toMatchObject({ runMs: 65_000 });
  });

  it('resolves comparison metadata and legacy labels', () => {
    expect(outputComparisonUrl(node, '/result.png')).toBe('/input.png');
    expect(formatOutputRunDuration(65_000)).toBe('1m 05s');
    expect(outputDownloadName('/result.png?cache=1', 123)).toBe('canvas-output-123.png');
  });
});
