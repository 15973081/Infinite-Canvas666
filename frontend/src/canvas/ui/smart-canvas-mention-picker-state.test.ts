import { describe, expect, it } from 'vitest';
import type { CanvasDocument, CanvasNode } from '../domain/types';
import { movedReferenceOrder, promptHtmlWithMentionTokens, smartCanvasComposerReferences, smartCanvasMentionCandidates, smartCanvasReferenceKey } from './smart-canvas-mention-picker-state';

const imageA = { id: 'image-a', type: 'image', name: '山谷', url: '/a.png' } satisfies CanvasNode;
const imageB = { id: 'image-b', type: 'output', images: [{ name: '海面', url: '/b.png' }] } satisfies CanvasNode;
const generator = { id: 'generator', type: 'generator' } satisfies CanvasNode;
const output = { id: 'output', type: 'output', images: [] } satisfies CanvasNode;

function documentWith(outputPatch: Record<string, unknown> = {}): CanvasDocument {
  return {
    schemaVersion: 1,
    nodes: [imageA, imageB, generator, { ...output, ...outputPatch }],
    connections: [
      { from: 'image-a', to: 'generator', kind: 'input' },
      { from: 'image-b', to: 'generator', kind: 'input' },
      { from: 'generator', to: 'output' },
    ],
  };
}

describe('SmartCanvasMentionPicker state', () => {
  it('collects canvas mention candidates in graph order and keeps their node identity', () => {
    const document = documentWith();
    const result = smartCanvasMentionCandidates(document, document.nodes[3], generator);
    expect(result.map((item) => [item.nodeId, item.url])).toEqual([['image-a', '/a.png'], ['image-b', '/b.png']]);
  });

  it('restores persisted composer reference order', () => {
    const keyA = smartCanvasReferenceKey({ imageIndex: 0, nodeId: 'image-a', url: '/a.png' });
    const keyB = smartCanvasReferenceKey({ imageIndex: 0, nodeId: 'image-b', url: '/b.png' });
    const document = documentWith({ inputRefOrder: [keyB, keyA] });
    expect(smartCanvasComposerReferences(document, document.nodes[3], generator).map((item) => item.url)).toEqual(['/b.png', '/a.png']);
  });

  it('moves a dragged reference before or after the target', () => {
    const items = smartCanvasComposerReferences(documentWith(), output, generator);
    expect(movedReferenceOrder(items, 0, 1, 'after')).toEqual(['image-b|0', 'image-a|0']);
  });

  it('rebuilds saved @ references as the original mention token DOM', () => {
    const html = promptHtmlWithMentionTokens('让@山谷变成冬天', [{ imageIndex: 0, kind: 'image', name: '山谷', nodeId: 'image-a', url: '/a.png' }]);
    expect(html).toContain('class="mention-image-token"');
    expect(html).toContain('data-node-id="image-a"');
    expect(html).toContain('<span>山谷</span>');
    expect(html).not.toContain('@山谷');
  });
});
