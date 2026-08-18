import { decodeCanvasDocument } from './canvas/domain/document-codec';
import {
  createExecutionState,
  runOrderedExecution,
  runParallelExecution,
  transitionExecution,
  type ExecutionEvent,
  type ExecutionMode,
  type NodeExecutor,
  type OrderedExecutionMode,
  type ParallelNodeExecutor,
  type ExecutionState,
  type ExecutionTerminalStatus,
} from './canvas/domain/execution';
import { createGraphModel } from './canvas/domain/graph';
import {
  createCanvasRepository,
  type CanvasRepository,
  type CanvasRepositoryDiagnostics,
} from './canvas/infrastructure/canvas-repository';
import { createTaskClient, type TaskClient, type TaskClientDiagnostics } from './canvas/infrastructure/task-client';

interface LegacyBridge {
  computeCascadeOrder(targetId: string): string[];
  computeRetryCascadeOrder(nodeId: string): string[];
  getActivitySnapshot(): unknown;
  getDocumentSnapshot(): unknown | null;
  getStatusSnapshot(): { kind: 'error' | 'info' | 'pending' | 'success'; text: string };
  runCommand(
    command: 'close-log' | 'open-backups' | 'open-cost' | 'open-log' | 'retry-execution' | 'stop-execution',
    payload?: { targetId?: string },
  ): void | Promise<void>;
}

type OrderKind = 'cascade' | 'retry';

interface OrderComparison {
  kind: OrderKind;
  legacy: string[];
  matches: boolean;
  modern: string[];
  targetId: string;
}

interface ShadowReport {
  checks: number;
  enabled: boolean;
  errors: number;
  mismatches: OrderComparison[];
}

type ExecutionObservation =
  | { phase: 'begin'; targetId: string; order: string[]; mode: ExecutionMode }
  | { phase: 'node-start'; targetId: string; nodeId: string; roundId?: string }
  | { phase: 'node-done'; targetId: string; nodeId: string; roundId?: string }
  | { phase: 'stop'; targetId: string }
  | { phase: 'finish'; targetId: string; status: ExecutionTerminalStatus; error?: string };

interface ExecutionShadowReport {
  enabled: boolean;
  errors: number;
  events: number;
  runs: ExecutionState[];
}

interface M2Report {
  enabled: boolean;
  execution: {
    active: number;
    done: number;
    failed: number;
    stopped: number;
    transitions: number;
  };
  flags: {
    executionEngine: boolean;
    repository: boolean;
    taskClient: boolean;
  };
  repository: CanvasRepositoryDiagnostics;
  tasks: TaskClientDiagnostics;
}

interface OrderedExecutionRequest {
  execute: NodeExecutor;
  mode: OrderedExecutionMode;
  order: string[];
  signal?: AbortSignal;
  targetId: string;
}

interface ParallelExecutionRequest {
  execute: ParallelNodeExecutor<unknown>;
  limit: number;
  order: string[];
  roundId?: (round: unknown, index: number) => string;
  rounds: unknown[];
  signal?: AbortSignal;
  targetId: string;
}

declare global {
  interface Window {
    CanvasLegacyBridge?: LegacyBridge;
    CanvasModernCore?: {
      activeOrder(kind: OrderKind, targetId: string): string[] | null;
      canvasRepository: CanvasRepository;
      canvasRepositoryEnabled: boolean;
      compareOrder(kind: OrderKind, targetId: string, legacyOrder?: string[]): OrderComparison | null;
      executionEngineEnabled: boolean;
      getExecutionShadowReport(): ExecutionShadowReport;
      getM2Report(): M2Report;
      getShadowReport(): ShadowReport;
      m2Enabled: boolean;
      observeExecution(observation: ExecutionObservation): void;
      observeOrder(kind: OrderKind, targetId: string, legacyOrder: string[]): void;
      runOrdered(request: OrderedExecutionRequest): Promise<ExecutionState>;
      runParallel(request: ParallelExecutionRequest): Promise<ExecutionState>;
      taskClient: TaskClient;
      taskClientEnabled: boolean;
      version: 15;
    };
  }
}

const searchParams = new URLSearchParams(window.location.search);
const modernCoreMode = searchParams.get('canvas_modern_core');
const executionShadowEnabled = modernCoreMode === 'execution-shadow';
const graphOrderEnabled = modernCoreMode === 'graph-order';
const shadowEnabled = modernCoreMode === 'shadow';
const m2Requested = searchParams.get('canvas_m2') === '1';
const executionEngineEnabled = m2Requested || searchParams.get('canvas_execution_engine') === '1';
const taskClientEnabled = m2Requested || searchParams.get('canvas_task_client') === '1';
const canvasRepositoryEnabled = m2Requested || searchParams.get('canvas_repository') === '1';
const m2Enabled = executionEngineEnabled && taskClientEnabled && canvasRepositoryEnabled;
const reactIslandsEnabled = searchParams.get('canvas_react_islands') === '1';
const reactActivityIslandEnabled = reactIslandsEnabled || searchParams.get('canvas_react_activity') === '1';
const reactExecutionIslandEnabled = reactIslandsEnabled || searchParams.get('canvas_react_execution') === '1';
const reactStatusIslandEnabled = reactIslandsEnabled || searchParams.get('canvas_react_status') === '1';
const reactToolbarIslandEnabled = reactIslandsEnabled || searchParams.get('canvas_react_toolbar') === '1';
const taskClient = createTaskClient();
const canvasRepository = createCanvasRepository();
const executionRuns = new Map<string, ExecutionState>();
let executionEvents = 0;
let executionErrors = 0;
const mismatches: OrderComparison[] = [];
let shadowChecks = 0;
let shadowErrors = 0;
const modernExecutionRuns = new Map<string, Readonly<ExecutionState>>();
const modernExecutionTerminalCounts = { done: 0, failed: 0, stopped: 0 };
let modernExecutionTransitions = 0;

function compareOrder(kind: OrderKind, targetId: string, legacyOrder?: string[]): OrderComparison | null {
  const bridge = window.CanvasLegacyBridge;
  const snapshot = bridge?.getDocumentSnapshot();
  if (!bridge || !snapshot) return null;
  const graph = createGraphModel(decodeCanvasDocument(snapshot));
  const modern = kind === 'cascade' ? graph.cascadeOrder(targetId) : graph.retryCascadeOrder(targetId);
  const legacy = legacyOrder ?? (
    kind === 'cascade' ? bridge.computeCascadeOrder(targetId) : bridge.computeRetryCascadeOrder(targetId)
  );
  return {
    kind,
    legacy: [...legacy],
    modern,
    targetId,
    matches: legacy.length === modern.length && legacy.every((id, index) => id === modern[index]),
  };
}

window.CanvasModernCore = Object.freeze({
  version: 15 as const,
  canvasRepository,
  canvasRepositoryEnabled,
  executionEngineEnabled,
  m2Enabled,
  taskClient,
  taskClientEnabled,
  activeOrder(kind: OrderKind, targetId: string): string[] | null {
    if (!graphOrderEnabled) return null;
    try {
      const snapshot = window.CanvasLegacyBridge?.getDocumentSnapshot();
      if (!snapshot) return null;
      const graph = createGraphModel(decodeCanvasDocument(snapshot));
      return kind === 'cascade' ? graph.cascadeOrder(targetId) : graph.retryCascadeOrder(targetId);
    } catch (error) {
      console.warn('[canvas-modern-core] active graph order failed; using legacy order', error);
      return null;
    }
  },
  compareOrder,
  runOrdered(request: OrderedExecutionRequest): Promise<ExecutionState> {
    if (!executionEngineEnabled) return Promise.reject(new Error('Modern execution engine is disabled'));
    return runOrderedExecution(request.targetId, request.order, request.execute, {
      mode: request.mode,
      signal: request.signal,
      onTransition: emitExecutionTransition,
    });
  },
  runParallel(request: ParallelExecutionRequest): Promise<ExecutionState> {
    if (!executionEngineEnabled) return Promise.reject(new Error('Modern execution engine is disabled'));
    return runParallelExecution(request.targetId, request.order, request.rounds, request.execute, {
      limit: request.limit,
      roundId: request.roundId,
      signal: request.signal,
      onTransition: emitExecutionTransition,
    });
  },
  observeExecution(observation: ExecutionObservation): void {
    if (!executionShadowEnabled) return;
    try {
      let state = executionRuns.get(observation.targetId) ?? createExecutionState();
      if (observation.phase === 'begin') {
        state = transitionExecution(state, {
          type: 'queue',
          targetId: observation.targetId,
          order: observation.order,
          mode: observation.mode,
        });
        state = transitionExecution(state, { type: 'start' });
      } else if (observation.phase === 'node-start') {
        state = transitionExecution(state, {
          type: 'node-start',
          nodeId: observation.nodeId,
          roundId: observation.roundId,
        });
      } else if (observation.phase === 'node-done') {
        state = transitionExecution(state, {
          type: 'node-done',
          nodeId: observation.nodeId,
          roundId: observation.roundId,
        });
      } else if (observation.phase === 'stop') {
        state = transitionExecution(state, { type: 'request-stop' });
      } else {
        state = transitionExecution(state, {
          type: 'finish',
          status: observation.status,
          error: observation.error,
        });
      }
      executionRuns.set(observation.targetId, state);
      executionEvents += 1;
    } catch (error) {
      executionErrors += 1;
      console.warn('[canvas-modern-core] execution shadow transition failed', error, observation);
    }
  },
  observeOrder(kind: OrderKind, targetId: string, legacyOrder: string[]): void {
    if (!shadowEnabled) return;
    try {
      const comparison = compareOrder(kind, targetId, legacyOrder);
      if (!comparison) return;
      shadowChecks += 1;
      if (!comparison.matches) {
        if (mismatches.length < 50) mismatches.push(comparison);
        console.warn('[canvas-modern-core] graph order mismatch', comparison);
      }
    } catch (error) {
      shadowErrors += 1;
      console.warn('[canvas-modern-core] graph shadow check failed', error);
    }
  },
  getShadowReport(): ShadowReport {
    return {
      enabled: shadowEnabled,
      checks: shadowChecks,
      errors: shadowErrors,
      mismatches: mismatches.map((item) => ({
        ...item,
        legacy: [...item.legacy],
        modern: [...item.modern],
      })),
    };
  },
  getExecutionShadowReport(): ExecutionShadowReport {
    return {
      enabled: executionShadowEnabled,
      errors: executionErrors,
      events: executionEvents,
      runs: [...executionRuns.values()].map((state) => ({
        ...state,
        completedNodeIds: [...state.completedNodeIds],
        order: [...state.order],
        rounds: Object.fromEntries(Object.entries(state.rounds).map(([roundId, round]) => [
          roundId,
          { ...round, completedNodeIds: [...round.completedNodeIds] },
        ])),
      })),
    };
  },
  getM2Report(): M2Report {
    const active = [...modernExecutionRuns.values()].filter(({ status }) =>
      !['done', 'failed', 'stopped'].includes(status)
    ).length;
    return {
      enabled: m2Enabled,
      execution: { active, ...modernExecutionTerminalCounts, transitions: modernExecutionTransitions },
      flags: {
        executionEngine: executionEngineEnabled,
        repository: canvasRepositoryEnabled,
        taskClient: taskClientEnabled,
      },
      repository: canvasRepository.getDiagnostics(),
      tasks: taskClient.getDiagnostics(),
    };
  },
});

if (reactExecutionIslandEnabled) {
  const element = document.getElementById('canvasExecutionIsland');
  if (element) {
    void import('./canvas/ui/react-execution-entry').then(({ mountReactExecutionIsland }) => {
      const cleanup = mountReactExecutionIsland(element);
      window.addEventListener('pagehide', cleanup, { once: true });
    }).catch((error) => console.warn('[canvas-modern-core] React execution island failed to load', error));
  }
}

if (reactStatusIslandEnabled) {
  const element = document.getElementById('canvasStatusIsland');
  if (element) {
    void import('./canvas/ui/react-execution-entry').then(({ mountReactStatusIsland }) => {
      const cleanup = mountReactStatusIsland(element);
      window.addEventListener('pagehide', cleanup, { once: true });
    }).catch((error) => console.warn('[canvas-modern-core] React status island failed to load', error));
  }
}

if (reactToolbarIslandEnabled) {
  const element = document.getElementById('canvasToolbarIsland');
  if (element) {
    void import('./canvas/ui/react-execution-entry').then(({ mountReactToolbarIsland }) => {
      const cleanup = mountReactToolbarIsland(element);
      window.addEventListener('pagehide', cleanup, { once: true });
    }).catch((error) => console.warn('[canvas-modern-core] React toolbar island failed to load', error));
  }
}

if (reactActivityIslandEnabled) {
  const element = document.getElementById('canvasActivityIsland');
  if (element) {
    void import('./canvas/ui/react-execution-entry').then(({ mountReactActivityIsland }) => {
      const cleanup = mountReactActivityIsland(element);
      window.addEventListener('pagehide', cleanup, { once: true });
    }).catch((error) => console.warn('[canvas-modern-core] React activity island failed to load', error));
  }
}

function emitExecutionTransition(state: Readonly<ExecutionState>, event: ExecutionEvent): void {
  modernExecutionTransitions += 1;
  modernExecutionRuns.set(state.targetId, state);
  if (event.type === 'finish') modernExecutionTerminalCounts[event.status] += 1;
  window.dispatchEvent(new CustomEvent('canvas-modern-execution', { detail: { event, state } }));
}

document.documentElement.dataset.canvasModernCore = '15';
document.documentElement.dataset.canvasModernExecutionEngine = executionEngineEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernExecutionShadow = executionShadowEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? 'ready' : 'missing';
document.documentElement.dataset.canvasModernGraphOrder = graphOrderEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernM2 = m2Enabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernRepository = canvasRepositoryEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernReactActivity = reactActivityIslandEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernReactExecution = reactExecutionIslandEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernReactIslands = reactIslandsEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernReactStatus = reactStatusIslandEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernReactToolbar = reactToolbarIslandEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernShadow = shadowEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernTaskClient = taskClientEnabled ? 'enabled' : 'disabled';
window.dispatchEvent(new CustomEvent('canvas-modern-core-ready'));
