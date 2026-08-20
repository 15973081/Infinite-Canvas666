import { describe, expect, it } from 'vitest';
import { legacyCanvasUrl } from './legacy-fallback';

describe('legacyCanvasUrl', () => {
  it('moves rollback traffic to the physically isolated legacy page', () => {
    expect(legacyCanvasUrl('http://localhost/static/canvas.html?canvas_v2=0&id=canvas-1#node')).toBe(
      '/static/canvas-legacy.html?id=canvas-1#node',
    );
  });

  it('removes rollout controls while preserving unrelated query parameters', () => {
    expect(legacyCanvasUrl('http://localhost/static/canvas.html?canvas_v2=1&canvas_v2_rollout=20&folder=x')).toBe(
      '/static/canvas-legacy.html?folder=x',
    );
  });
});
