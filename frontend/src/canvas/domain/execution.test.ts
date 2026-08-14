import { describe, expect, it } from 'vitest';
import {
  createExecutionState,
  runLimitedExecutionRounds,
  runReservedSerialExecution,
  runSerialExecution,
  transitionExecution,
} from './execution';

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

  it('tracks repeated serial loop rounds', () => {
    let state = runningState();
    for (const nodeId of ['a', 'target', 'a', 'target']) {
      state = transitionExecution(state, { type: 'node-start', nodeId });
      state = transitionExecution(state, { type: 'node-done', nodeId });
    }

    expect(state).toMatchObject({ completedRounds: 2, completedNodeIds: ['a', 'target'] });
  });

  it('tracks interleaved parallel rounds independently', () => {
    let state = transitionExecution(createExecutionState(), {
      type: 'queue',
      targetId: 'target',
      order: ['a', 'target'],
      mode: 'parallel',
    });
    state = transitionExecution(state, { type: 'start' });
    state = transitionExecution(state, { type: 'node-start', nodeId: 'a', roundId: '1' });
    state = transitionExecution(state, { type: 'node-start', nodeId: 'a', roundId: '2' });
    state = transitionExecution(state, { type: 'node-done', nodeId: 'a', roundId: '2' });
    state = transitionExecution(state, { type: 'node-done', nodeId: 'a', roundId: '1' });
    state = transitionExecution(state, { type: 'node-start', nodeId: 'target', roundId: '1' });
    state = transitionExecution(state, { type: 'node-done', nodeId: 'target', roundId: '1' });
    state = transitionExecution(state, { type: 'node-start', nodeId: 'target', roundId: '2' });
    state = transitionExecution(state, { type: 'node-done', nodeId: 'target', roundId: '2' });

    expect(state.completedRounds).toBe(2);
    expect(state.rounds['1'].completedNodeIds).toEqual(['a', 'target']);
    expect(state.rounds['2'].completedNodeIds).toEqual(['a', 'target']);
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

  it('limits parallel round concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const result = await runLimitedExecutionRounds([1, 2, 3, 4], 2, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    });

    expect(maxActive).toBe(2);
    expect([...result.completed].sort()).toEqual([1, 2, 3, 4]);
    expect(result.failure).toBeNull();
  });

  it('does not schedule new rounds after the first failure', async () => {
    const calls: number[] = [];
    let releaseFirst!: () => void;
    const firstRound = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const pending = runLimitedExecutionRounds([1, 2, 3, 4], 2, async (round) => {
      calls.push(round);
      if (round === 1) await firstRound;
      if (round === 2) throw new Error('failed round 2');
    });

    await Promise.resolve();
    releaseFirst();
    const result = await pending;

    expect(calls).toEqual([1, 2]);
    expect(result.completed).toEqual([1]);
    expect(result.failure?.round).toBe(2);
  });

  it('does not schedule parallel rounds when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const calls: number[] = [];
    const result = await runLimitedExecutionRounds([1, 2], 2, async (round) => {
      calls.push(round);
    }, controller.signal);

    expect(calls).toEqual([]);
    expect(result.stopped).toBe(true);
  });

  it('prevents concurrent workflows from executing a shared node', async () => {
    const reservations = new Map<string, string>();
    let releaseShared!: () => void;
    const sharedRun = new Promise<void>((resolve) => { releaseShared = resolve; });
    const first = runReservedSerialExecution(reservations, 'run-1', ['shared', 'a'], async (nodeId) => {
      if (nodeId === 'shared') await sharedRun;
    });
    const secondCalls: string[] = [];
    const second = await runReservedSerialExecution(reservations, 'run-2', ['shared', 'b'], async (nodeId) => {
      secondCalls.push(nodeId);
    });

    expect(second).toEqual({ conflictNodeId: 'shared', state: null });
    expect(secondCalls).toEqual([]);
    releaseShared();
    expect((await first).state?.status).toBe('done');
    expect(reservations.size).toBe(0);
  });

  it('releases node reservations after executor failure', async () => {
    const reservations = new Map<string, string>();
    const result = await runReservedSerialExecution(reservations, 'run-1', ['a'], async () => {
      throw new Error('failed');
    });

    expect(result.state?.status).toBe('failed');
    expect(reservations.size).toBe(0);
  });
});
