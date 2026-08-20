import { createModernCanvasRuntime, type CanvasRuntime } from './canvas/application/modern-canvas-runtime';
import { mergeCanvasDocuments, type CanvasMergeResult } from './canvas/domain/document-merge';
import {
  runOrderedExecution,
  runParallelExecution,
  type ExecutionEvent,
  type NodeExecutor,
  type OrderedExecutionMode,
  type ParallelNodeExecutor,
  type ExecutionState,
} from './canvas/domain/execution';
import {
  createCanvasRepository,
  type CanvasRepository,
  type CanvasRepositoryDiagnostics,
} from './canvas/infrastructure/canvas-repository';
import { createTaskClient, type TaskClient, type TaskClientDiagnostics } from './canvas/infrastructure/task-client';
import {
  loadCanvasRolloutPolicy,
  recordCanvasRolloutEvent,
  resolveCanvasV2Rollout,
  type CanvasRolloutDecision,
  type CanvasRolloutEvent,
  type CanvasRolloutEventPayload,
} from './canvas/infrastructure/rollout';

interface M2Report {
  enabled: boolean;
  rollout: CanvasRolloutDecision;
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
    CanvasLTXTimelineEditor?: new (node: Record<string, unknown>, container: HTMLElement, widget: null) => {
      _onCanvasCommit: null | (() => void);
      _onCanvasResize: null | (() => void);
      destroy(): void;
    };
    __CanvasBootstrapRolloutPolicy?: import('./canvas/infrastructure/rollout').CanvasRolloutPolicy | null;
    __loadCanvasLegacyFallback?: () => Promise<void>;
    openPromptTemplateModal?: (nodeId: string) => void;
    openCanvasPromptLibrary?: (request: { initialText?: string; onApply(text: string): void }) => void;
    openCanvasAssetLibrary?: (request: {
      onInsert?(item: { id: string; kind: 'audio' | 'image' | 'video' | 'workflow'; name: string; url: string }): void;
      saveItem?: { kind?: string; name?: string; url: string };
    }) => void;
    CanvasModernCore?: {
      canvasRepository: CanvasRepository;
      canvasRepositoryEnabled: boolean;
      canvasRuntime: CanvasRuntime;
      executionEngineEnabled: boolean;
      getM2Report(): M2Report;
      mergeConflict(base: unknown, local: unknown, remote: unknown): CanvasMergeResult;
      m2Enabled: boolean;
      recordRolloutEvent(event: CanvasRolloutEvent, payload?: CanvasRolloutEventPayload): void;
      runOrdered(request: OrderedExecutionRequest): Promise<ExecutionState>;
      runParallel(request: ParallelExecutionRequest): Promise<ExecutionState>;
      taskClient: TaskClient;
      taskClientEnabled: boolean;
      version: 30;
    };
  }
}

const searchParams = new URLSearchParams(window.location.search);
const rolloutPolicy = '__CanvasBootstrapRolloutPolicy' in window
  ? window.__CanvasBootstrapRolloutPolicy ?? null
  : await loadCanvasRolloutPolicy();
const rolloutDecision = resolveCanvasV2Rollout(
  window.location.search,
  window.localStorage,
  window.sessionStorage.getItem('canvasClientId') || window.location.pathname,
  rolloutPolicy,
);
void recordCanvasRolloutEvent('rollout-decision', {
  dimensions: {
    mode: rolloutDecision.enabled ? 'enabled' : 'disabled',
    reason: rolloutDecision.blockedReasons[0] || (rolloutDecision.policyLoaded ? 'none' : 'policy-unavailable'),
    source: rolloutDecision.source,
  },
});
const m2Requested = searchParams.get('canvas_m2') === '1' || (searchParams.get('canvas_m2') === null && rolloutDecision.enabled);
const executionEngineEnabled = m2Requested || searchParams.get('canvas_execution_engine') === '1';
const taskClientEnabled = m2Requested || searchParams.get('canvas_task_client') === '1';
const canvasRepositoryEnabled = m2Requested || searchParams.get('canvas_repository') === '1';
const m2Enabled = executionEngineEnabled && taskClientEnabled && canvasRepositoryEnabled;
const taskClient = createTaskClient();
const canvasRuntime = createModernCanvasRuntime(taskClient);
await canvasRuntime.initialize();
const canvasRepository = createCanvasRepository();
const modernExecutionRuns = new Map<string, Readonly<ExecutionState>>();
const modernExecutionTerminalCounts = { done: 0, failed: 0, stopped: 0 };
let modernExecutionTransitions = 0;

window.CanvasModernCore = Object.freeze({
  version: 30 as const,
  canvasRepository,
  canvasRepositoryEnabled,
  canvasRuntime,
  executionEngineEnabled,
  m2Enabled,
  taskClient,
  taskClientEnabled,
  recordRolloutEvent(event, payload): void {
    void recordCanvasRolloutEvent(event, {
      ...payload,
      dimensions: {
        ...payload?.dimensions,
        mode: m2Enabled ? 'enabled' : 'disabled',
        source: rolloutDecision.source,
      },
    });
  },
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
  getM2Report(): M2Report {
    const active = [...modernExecutionRuns.values()].filter(({ status }) =>
      !['done', 'failed', 'stopped'].includes(status)
    ).length;
    return {
      enabled: m2Enabled,
      rollout: rolloutDecision,
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
  mergeConflict(base, local, remote) {
    return mergeCanvasDocuments(base, local, remote);
  },
});

if (rolloutDecision.enabled) {
  const element = document.getElementById('canvasModernApp');
  const legacyShell = document.getElementById('shell');
  if (element) {
    if (legacyShell) legacyShell.hidden = true;
    element.hidden = false;
    void import('./canvas/ui/canvas-app-v2').then(({ mountCanvasAppV2 }) => {
      const cleanup = mountCanvasAppV2(element, { runtime: canvasRuntime, repository: canvasRepository });
      window.CanvasModernCore?.recordRolloutEvent('board-mounted', { dimensions: { reason: 'none' } });
      window.addEventListener('pagehide', cleanup, { once: true });
    }).catch(async (error) => {
      element.hidden = true;
      try {
        await window.__loadCanvasLegacyFallback?.();
        if (legacyShell) legacyShell.hidden = false;
      } catch (fallbackError) {
        console.error('[canvas-modern-core] Legacy Canvas fallback failed to load', fallbackError);
      }
      window.CanvasModernCore?.recordRolloutEvent('board-mount-failed', { dimensions: { reason: 'import-failed' } });
      console.warn('[canvas-modern-core] standalone Canvas V2 failed to load; restored Legacy Canvas', error);
    });
  }
}

function emitExecutionTransition(state: Readonly<ExecutionState>, event: ExecutionEvent): void {
  modernExecutionTransitions += 1;
  modernExecutionRuns.set(state.targetId, state);
  if (event.type === 'finish') {
    modernExecutionTerminalCounts[event.status] += 1;
    window.CanvasModernCore?.recordRolloutEvent(
      event.status === 'done' ? 'execution-succeeded' : event.status === 'failed' ? 'execution-failed' : 'execution-stopped',
      { dimensions: { reason: event.status === 'failed' ? 'execution-failed' : event.status === 'stopped' ? 'execution-stopped' : 'none' } },
    );
  }
  window.dispatchEvent(new CustomEvent('canvas-modern-execution', { detail: { event, state } }));
}

document.documentElement.dataset.canvasModernCore = '30';
document.documentElement.dataset.canvasModernExecutionEngine = executionEngineEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernM2 = m2Enabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernRepository = canvasRepositoryEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernTaskClient = taskClientEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasV2Rollout = rolloutDecision.enabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasV2RolloutBucket = String(rolloutDecision.bucket);
document.documentElement.dataset.canvasV2RolloutBlocked = rolloutDecision.blockedReasons.join(',') || 'none';
document.documentElement.dataset.canvasV2RolloutPercentage = String(rolloutDecision.percentage);
document.documentElement.dataset.canvasV2RolloutPolicy = rolloutDecision.policyLoaded ? 'loaded' : 'fallback';
window.addEventListener('pagehide', () => {
  const repository = canvasRepository.getDiagnostics();
  const tasks = taskClient.getDiagnostics();
  void recordCanvasRolloutEvent('page-summary', {
    counters: {
      execution_failed: modernExecutionTerminalCounts.failed,
      execution_runs: modernExecutionTerminalCounts.done + modernExecutionTerminalCounts.failed + modernExecutionTerminalCounts.stopped,
      repository_conflicts: repository.conflicts,
      repository_errors: repository.errors,
      repository_saves: repository.saves,
      task_poll_errors: tasks.pollErrors,
      task_polls: tasks.polls,
      task_recoveries: tasks.recoveredTasks,
      task_resumed: tasks.resumedTasks,
      task_submissions: tasks.submissions,
    },
    dimensions: {
      mode: m2Enabled ? 'enabled' : 'disabled',
      reason: 'none',
      source: rolloutDecision.source,
    },
  });
}, { once: true });
window.dispatchEvent(new CustomEvent('canvas-modern-core-ready'));
