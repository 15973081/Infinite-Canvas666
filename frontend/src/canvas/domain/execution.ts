export type ExecutionMode = 'parallel' | 'retry' | 'serial';
export type ExecutionStatus = 'idle' | 'queued' | 'running' | 'stopping' | 'done' | 'failed' | 'stopped';
export type ExecutionTerminalStatus = Extract<ExecutionStatus, 'done' | 'failed' | 'stopped'>;

export interface ExecutionRoundState {
  completedNodeIds: string[];
  currentNodeId: string;
}

export interface ExecutionState {
  completedNodeIds: string[];
  completedRounds: number;
  currentNodeId: string;
  error: string;
  mode: ExecutionMode;
  order: string[];
  rounds: Record<string, ExecutionRoundState>;
  status: ExecutionStatus;
  targetId: string;
}

export type ExecutionEvent =
  | { type: 'queue'; targetId: string; order: string[]; mode: ExecutionMode }
  | { type: 'start' }
  | { type: 'node-start'; nodeId: string; roundId?: string }
  | { type: 'node-done'; nodeId: string; roundId?: string }
  | { type: 'request-stop' }
  | { type: 'finish'; status: ExecutionTerminalStatus; error?: string };

export type NodeExecutor = (nodeId: string, signal?: AbortSignal) => Promise<void>;

export interface LimitedExecutionResult<T> {
  completed: T[];
  failure: { round: T; error: unknown } | null;
  stopped: boolean;
}

export interface ReservedExecutionResult {
  conflictNodeId: string | null;
  state: ExecutionState | null;
}

export function createExecutionState(): ExecutionState {
  return {
    completedNodeIds: [],
    completedRounds: 0,
    currentNodeId: '',
    error: '',
    mode: 'serial',
    order: [],
    rounds: {},
    status: 'idle',
    targetId: '',
  };
}

export function transitionExecution(state: ExecutionState, event: ExecutionEvent): ExecutionState {
  if (event.type === 'queue') {
    if (!['idle', 'done', 'failed', 'stopped'].includes(state.status)) invalidTransition(state, event);
    if (!event.targetId || !event.order.length) throw new Error('Execution queue requires a target and order');
    return {
      completedNodeIds: [],
      completedRounds: 0,
      currentNodeId: '',
      error: '',
      mode: event.mode,
      order: [...event.order],
      rounds: {},
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

  if (event.type === 'node-start') {
    if (state.mode === 'parallel') return transitionParallelNode(state, event);
    if (state.status !== 'running' || state.currentNodeId) invalidTransition(state, event);
    const completedNodeIds = state.completedNodeIds.length === state.order.length ? [] : state.completedNodeIds;
    const expected = state.order[completedNodeIds.length];
    if (event.nodeId !== expected) throw new Error(`Expected execution node ${expected || '<none>'}`);
    return { ...state, completedNodeIds, currentNodeId: event.nodeId };
  }

  if (event.type === 'node-done') {
    if (state.mode === 'parallel') return transitionParallelNode(state, event);
    if (state.status !== 'running' || state.currentNodeId !== event.nodeId) invalidTransition(state, event);
    const completedNodeIds = [...state.completedNodeIds, event.nodeId];
    return {
      ...state,
      completedNodeIds,
      completedRounds: state.completedRounds + (completedNodeIds.length === state.order.length ? 1 : 0),
      currentNodeId: '',
    };
  }

  if (state.status !== 'running' && state.status !== 'stopping') invalidTransition(state, event);
  if (state.status === 'stopping' && event.status === 'done') invalidTransition(state, event);
  return { ...state, error: event.error || '', status: event.status };
}

function transitionParallelNode(
  state: ExecutionState,
  event: Extract<ExecutionEvent, { type: 'node-start' | 'node-done' }>,
): ExecutionState {
  if (state.status !== 'running' || !event.roundId) invalidTransition(state, event);
  const round = state.rounds[event.roundId] ?? { completedNodeIds: [], currentNodeId: '' };
  if (event.type === 'node-start') {
    if (round.currentNodeId) invalidTransition(state, event);
    const expected = state.order[round.completedNodeIds.length];
    if (event.nodeId !== expected) throw new Error(`Expected execution node ${expected || '<none>'}`);
    return {
      ...state,
      rounds: { ...state.rounds, [event.roundId]: { ...round, currentNodeId: event.nodeId } },
    };
  }

  if (round.currentNodeId !== event.nodeId) invalidTransition(state, event);
  const completedNodeIds = [...round.completedNodeIds, event.nodeId];
  return {
    ...state,
    completedRounds: state.completedRounds + (completedNodeIds.length === state.order.length ? 1 : 0),
    rounds: {
      ...state.rounds,
      [event.roundId]: { completedNodeIds, currentNodeId: '' },
    },
  };
}

export async function runSerialExecution(
  targetId: string,
  order: string[],
  execute: NodeExecutor,
  signal?: AbortSignal,
): Promise<ExecutionState> {
  let state = transitionExecution(createExecutionState(), { type: 'queue', targetId, order, mode: 'serial' });
  state = transitionExecution(state, { type: 'start' });

  for (const nodeId of order) {
    if (signal?.aborted) return transitionExecution(state, { type: 'finish', status: 'stopped' });
    state = transitionExecution(state, { type: 'node-start', nodeId });
    try {
      await execute(nodeId, signal);
    } catch (error) {
      if (signal?.aborted) return transitionExecution(state, { type: 'finish', status: 'stopped' });
      return transitionExecution(state, {
        type: 'finish',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (signal?.aborted) return transitionExecution(state, { type: 'finish', status: 'stopped' });
    state = transitionExecution(state, { type: 'node-done', nodeId });
  }

  return transitionExecution(state, { type: 'finish', status: 'done' });
}

export function reserveExecutionNodes(
  reservations: Map<string, string>,
  targetId: string,
  order: readonly string[],
): string | null {
  const nodeIds = [...new Set(order)];
  const conflictNodeId = nodeIds.find((nodeId) => reservations.has(nodeId)) ?? null;
  if (conflictNodeId) return conflictNodeId;
  for (const nodeId of nodeIds) reservations.set(nodeId, targetId);
  return null;
}

export function releaseExecutionNodes(reservations: Map<string, string>, targetId: string): void {
  for (const [nodeId, ownerId] of reservations) {
    if (ownerId === targetId) reservations.delete(nodeId);
  }
}

export async function runReservedSerialExecution(
  reservations: Map<string, string>,
  targetId: string,
  order: string[],
  execute: NodeExecutor,
  signal?: AbortSignal,
): Promise<ReservedExecutionResult> {
  const conflictNodeId = reserveExecutionNodes(reservations, targetId, order);
  if (conflictNodeId) return { conflictNodeId, state: null };
  try {
    return { conflictNodeId: null, state: await runSerialExecution(targetId, order, execute, signal) };
  } finally {
    releaseExecutionNodes(reservations, targetId);
  }
}

export async function runLimitedExecutionRounds<T>(
  rounds: readonly T[],
  limit: number,
  execute: (round: T, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<LimitedExecutionResult<T>> {
  if (!rounds.length) return { completed: [], failure: null, stopped: Boolean(signal?.aborted) };

  const completed: T[] = [];
  let failure: LimitedExecutionResult<T>['failure'] = null;
  let next = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, rounds.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (!failure && !signal?.aborted && next < rounds.length) {
      const round = rounds[next++];
      try {
        await execute(round, signal);
      } catch (error) {
        if (!signal?.aborted && !failure) failure = { round, error };
        return;
      }
      if (!signal?.aborted) completed.push(round);
    }
  });

  await Promise.all(workers);
  return { completed, failure, stopped: Boolean(signal?.aborted) };
}

function invalidTransition(state: ExecutionState, event: ExecutionEvent): never {
  throw new Error(`Invalid execution transition: ${state.status} -> ${event.type}`);
}
