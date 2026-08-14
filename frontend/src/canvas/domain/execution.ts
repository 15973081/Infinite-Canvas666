export type ExecutionMode = 'parallel' | 'retry' | 'serial';
export type ExecutionStatus = 'idle' | 'queued' | 'running' | 'stopping' | 'done' | 'failed' | 'stopped';
export type ExecutionTerminalStatus = Extract<ExecutionStatus, 'done' | 'failed' | 'stopped'>;

export interface ExecutionState {
  error: string;
  mode: ExecutionMode;
  order: string[];
  status: ExecutionStatus;
  targetId: string;
}

export type ExecutionEvent =
  | { type: 'queue'; targetId: string; order: string[]; mode: ExecutionMode }
  | { type: 'start' }
  | { type: 'request-stop' }
  | { type: 'finish'; status: ExecutionTerminalStatus; error?: string };

export function createExecutionState(): ExecutionState {
  return { error: '', mode: 'serial', order: [], status: 'idle', targetId: '' };
}

export function transitionExecution(state: ExecutionState, event: ExecutionEvent): ExecutionState {
  if (event.type === 'queue') {
    if (!['idle', 'done', 'failed', 'stopped'].includes(state.status)) invalidTransition(state, event);
    if (!event.targetId || !event.order.length) throw new Error('Execution queue requires a target and order');
    return {
      error: '',
      mode: event.mode,
      order: [...event.order],
      status: 'queued',
      targetId: event.targetId,
    };
  }

  if (event.type === 'start') {
    if (state.status !== 'queued') invalidTransition(state, event);
    return { ...state, status: 'running' };
  }

  if (event.type === 'request-stop') {
    if (state.status === 'stopping') return state;
    if (state.status !== 'running') invalidTransition(state, event);
    return { ...state, status: 'stopping' };
  }

  if (state.status !== 'running' && state.status !== 'stopping') invalidTransition(state, event);
  if (state.status === 'stopping' && event.status === 'done') invalidTransition(state, event);
  return { ...state, error: event.error || '', status: event.status };
}

function invalidTransition(state: ExecutionState, event: ExecutionEvent): never {
  throw new Error(`Invalid execution transition: ${state.status} -> ${event.type}`);
}
