import { describe, expect, it } from 'vitest';
import { createExecutionState, transitionExecution } from './execution';

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
});
