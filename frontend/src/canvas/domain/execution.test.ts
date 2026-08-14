import { describe, expect, it } from 'vitest';
import { createExecutionState, runSerialExecution, transitionExecution } from './execution';

function runningState() {
  const queued = transitionExecution(createExecutionState(), {
    type: 'queue',
    targetId: 'target',
    order: ['a', 'target'],
    mode: 'serial',
  });
  return transitionExecution(queued, { type: 'start' });
}

describe('execution state', () => {
  it('runs a queued workflow to completion', () => {
    const running = runningState();
    expect(running).toMatchObject({ status: 'running', targetId: 'target', order: ['a', 'target'] });
    expect(transitionExecution(running, { type: 'finish', status: 'done' }).status).toBe('done');
  });

  it('tracks stop requests and rejects completion after stopping begins', () => {
    const stopping = transitionExecution(runningState(), { type: 'request-stop' });
    expect(stopping.status).toBe('stopping');
    expect(transitionExecution(stopping, { type: 'finish', status: 'stopped' }).status).toBe('stopped');
    expect(() => transitionExecution(stopping, { type: 'finish', status: 'done' })).toThrow(
      'Invalid execution transition',
    );
  });

  it('rejects starting an idle run', () => {
    expect(() => transitionExecution(createExecutionState(), { type: 'start' })).toThrow(
      'Invalid execution transition',
    );
  });

  it('executes nodes serially in order', async () => {
    const calls: string[] = [];
    const state = await runSerialExecution('target', ['a', 'b'], async (nodeId) => {
      calls.push(nodeId);
    });

    expect(calls).toEqual(['a', 'b']);
    expect(state).toMatchObject({ status: 'done', completedNodeIds: ['a', 'b'], currentNodeId: '' });
  });

  it('stops at the failed node without calling downstream', async () => {
    const calls: string[] = [];
    const state = await runSerialExecution('target', ['a', 'b', 'c'], async (nodeId) => {
      calls.push(nodeId);
      if (nodeId === 'b') throw new Error('failed b');
    });

    expect(calls).toEqual(['a', 'b']);
    expect(state).toMatchObject({
      status: 'failed',
      completedNodeIds: ['a'],
      currentNodeId: 'b',
      error: 'failed b',
    });
  });

  it('does not schedule nodes after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const calls: string[] = [];
    const state = await runSerialExecution('target', ['a', 'b'], async (nodeId) => {
      calls.push(nodeId);
    }, controller.signal);

    expect(calls).toEqual([]);
    expect(state.status).toBe('stopped');
  });
});
