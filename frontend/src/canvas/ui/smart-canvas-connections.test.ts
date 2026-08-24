import { describe, expect, it } from 'vitest';
import type { CanvasDocument } from '../domain/types';
import { smartCascadeConnectionKeys, smartCascadeEdgeState, smartConnectionGeometry, smartPortDragPath } from './smart-canvas-connections';

describe('SmartCanvasConnections legacy geometry', () => {
  it('uses the original horizontal and history bezier paths', () => {
    expect(smartConnectionGeometry({ from: 'a', to: 'b' }, { x: 10, y: 20, width: 100, height: 80 }, { x: 300, y: 160, width: 120, height: 60 }).curve)
      .toBe('M110 60 C 195.5 60, 214.5 190, 300 190');
    expect(smartConnectionGeometry({ from: 'a', kind: 'history', to: 'b' }, { x: 10, y: 20, width: 100, height: 80 }, { x: 300, y: 160, width: 120, height: 60 }).curve)
      .toBe('M60 100 C 60 136, 360 124, 360 160');
  });

  it('uses the original temporary port curve in either direction', () => {
    const rect = { x: 10, y: 20, width: 100, height: 80 };
    expect(smartPortDragPath({ currentWorld: { x: 300, y: 190 }, fromId: 'a', fromPort: 'out' }, rect)).toBe('M110 60 C 195.5 60, 214.5 190, 300 190');
    expect(smartPortDragPath({ currentWorld: { x: 300, y: 190 }, fromId: 'a', fromPort: 'in' }, rect)).toBe('M10 60 C -120.5 60, 430.5 190, 300 190');
  });

  it('marks downstream loop connections and preserves explicit cascade states', () => {
    const document = {
      connections: [{ from: 'loop', to: 'image' }, { from: 'image', to: 'output' }, { from: 'history', kind: 'history', to: 'image' }],
      nodes: [{ id: 'loop', type: 'loop' }, { id: 'image', type: 'smart-image' }, { id: 'output', type: 'smart-image' }, { id: 'history', type: 'smart-image' }],
    } as Pick<CanvasDocument, 'connections' | 'nodes'>;
    expect([...smartCascadeConnectionKeys(document)]).toEqual(['loop->image', 'image->output']);
    expect(smartCascadeEdgeState({ cascadeState: 'active', from: 'loop', to: 'image' }, document.nodes[0], document.nodes[1])).toBe('active');
    expect(smartCascadeEdgeState({ from: 'loop', to: 'image' }, { ...document.nodes[0], runStatus: 'done' }, { ...document.nodes[1], runStatus: 'done' })).toBe('done');
  });
});
