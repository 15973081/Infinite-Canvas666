import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '../domain/types';
import { smartImageMediaKind, smartImageNodeLayout, smartImageTaskPatch } from './smart-image-node';

describe('SmartImageNode', () => {
  it('preserves the legacy empty, single and group layout defaults', () => {
    expect(smartImageNodeLayout({ id: 'empty', type: 'smart-image', images: [], scale: 2 })).toMatchObject({ width: 316, height: 194 });
    expect(smartImageNodeLayout({ id: 'single', type: 'smart-image', images: [{ url: '/a.png', natural_w: 1200, natural_h: 800 }], scale: 2 })).toMatchObject({ width: 520, height: 347 });
    expect(smartImageNodeLayout({ id: 'group', type: 'smart-image', images: ['/a.png', '/b.png', '/c.png'], scale: 0.8 })).toMatchObject({ cols: 2, rows: 2, thumb: 179 });
  });

  it('detects image, video and audio media from explicit kind or URL', () => {
    expect(smartImageMediaKind({ url: '/a.png' })).toBe('image');
    expect(smartImageMediaKind({ url: '/a.webm' })).toBe('video');
    expect(smartImageMediaKind({ kind: 'audio', url: '/asset/1' })).toBe('audio');
  });

  it('finalizes a recovered task on the same smart-image data structure', () => {
    const node = { id: 'pending', type: 'smart-image', images: [], pending: 1, runStartedAt: 100, pendingTasks: [{ taskId: 'task-1', kind: 'video' }] } satisfies CanvasNode;
    const patch = smartImageTaskPatch(node, 'task-1', { images: [{ url: '/result.mp4' }] });
    expect(patch).toMatchObject({ pending: 0, pendingTasks: undefined, outputKind: 'video', running: false, title: 'Video' });
    expect(patch.images).toEqual([{ url: '/result.mp4', kind: 'video', name: 'output-1.mp4', generatedResult: true }]);
  });
});
