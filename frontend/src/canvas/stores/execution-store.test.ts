import { describe, expect, it } from 'vitest';
import { createExecutionState } from '../domain/execution';
import { createExecutionStore } from './execution-store';

describe('execution store', () => {
  it('keeps a detached UI projection per execution target', () => {
    const store = createExecutionStore();
    const source = {
      ...createExecutionState(),
      targetId: 'target-1',
      status: 'running' as const,
      order: ['a', 'b'],
      completedNodeIds: ['a'],
    };

    store.getState().project(source);
    source.order.push('later');
    source.completedNodeIds.push('later');

    expect(store.getState().runs['target-1']).toMatchObject({
      targetId: 'target-1',
      status: 'running',
      order: ['a', 'b'],
      completedNodeIds: ['a'],
    });
  });
});
