import { describe, expect, it } from 'vitest';
import type { CanvasDocument } from '../domain/types';
import { groupSmartCanvasImageNodes, ungroupSmartCanvasImageNode } from './canvas-board-v2';

function documentFixture(): CanvasDocument {
  return {
    connections: [{ from: 'left', to: 'target', kind: 'input' }, { from: 'right', to: 'target', kind: 'input' }],
    id: 'shortcuts',
    kind: 'smart',
    nodes: [
      { id: 'left', type: 'smart-image', x: 100, y: 200, images: [{ name: 'left.png', runPrompt: 'remove', url: '/left.png' }] },
      { id: 'right', type: 'smart-image', x: 400, y: 220, images: [{ name: 'right.png', url: '/right.png' }] },
      { id: 'target', type: 'smart-image', x: 800, y: 220, images: [] },
    ],
    schemaVersion: 1,
    title: 'Shortcut behavior',
  };
}

describe('legacy Smart Canvas grouping shortcuts', () => {
  it('groups Smart image nodes and remaps duplicate connections', () => {
    const grouped = groupSmartCanvasImageNodes(documentFixture(), ['left', 'right'])!;
    const node = grouped.document.nodes.find((item) => item.id === grouped.id)!;
    expect(node).toMatchObject({ type: 'smart-image', x: 100, y: 200, title: 'Group', scale: 0.8 });
    expect(node.images).toEqual([{ name: 'left.png', url: '/left.png' }, { name: 'right.png', url: '/right.png' }]);
    expect(grouped.document.connections).toEqual([{ from: grouped.id, to: 'target', kind: 'input' }]);
  });

  it('ungroups every image into selected Smart image nodes and removes group edges', () => {
    const grouped = groupSmartCanvasImageNodes(documentFixture(), ['left', 'right'])!;
    const ungrouped = ungroupSmartCanvasImageNode(grouped.document, grouped.id)!;
    expect(ungrouped.ids).toHaveLength(2);
    expect(ungrouped.document.nodes.filter((node) => ungrouped.ids.includes(node.id))).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'smart-image', title: 'Image', scale: 2, images: [{ name: 'left.png', url: '/left.png' }] }),
      expect.objectContaining({ type: 'smart-image', title: 'Image', scale: 2, images: [{ name: 'right.png', url: '/right.png' }] }),
    ]));
    expect(ungrouped.document.connections).toEqual([]);
  });
});
