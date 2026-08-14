import { decodeCanvasDocument } from './canvas/domain/document-codec';
import {
  createExecutionState,
  transitionExecution,
  type ExecutionMode,
  type ExecutionState,
  type ExecutionTerminalStatus,
} from './canvas/domain/execution';
import { createGraphModel } from './canvas/domain/graph';

interface LegacyBridge {
  computeCascadeOrder(targetId: string): string[];
  computeRetryCascadeOrder(nodeId: string): string[];
  getDocumentSnapshot(): unknown | null;
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
  | { phase: 'stop'; targetId: string }
  | { phase: 'finish'; targetId: string; status: ExecutionTerminalStatus; error?: string };

interface ExecutionShadowReport {
  enabled: boolean;
  errors: number;
  events: number;
  runs: ExecutionState[];
}

declare global {
  interface Window {
    CanvasLegacyBridge?: LegacyBridge;
    CanvasModernCore?: {
      activeOrder(kind: OrderKind, targetId: string): string[] | null;
      compareOrder(kind: OrderKind, targetId: string, legacyOrder?: string[]): OrderComparison | null;
      getExecutionShadowReport(): ExecutionShadowReport;
      getShadowReport(): ShadowReport;
      observeExecution(observation: ExecutionObservation): void;
      observeOrder(kind: OrderKind, targetId: string, legacyOrder: string[]): void;
      version: 5;
    };
  }
}

const modernCoreMode = new URLSearchParams(window.location.search).get('canvas_modern_core');
const executionShadowEnabled = modernCoreMode === 'execution-shadow';
const graphOrderEnabled = modernCoreMode === 'graph-order';
const shadowEnabled = modernCoreMode === 'shadow';
const executionRuns = new Map<string, ExecutionState>();
let executionEvents = 0;
let executionErrors = 0;
const mismatches: OrderComparison[] = [];
let shadowChecks = 0;
let shadowErrors = 0;

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
  version: 5 as const,
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
      })),
    };
  },
});

document.documentElement.dataset.canvasModernCore = '5';
document.documentElement.dataset.canvasModernExecutionShadow = executionShadowEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? 'ready' : 'missing';
document.documentElement.dataset.canvasModernGraphOrder = graphOrderEnabled ? 'enabled' : 'disabled';
document.documentElement.dataset.canvasModernShadow = shadowEnabled ? 'enabled' : 'disabled';
window.dispatchEvent(new CustomEvent('canvas-modern-core-ready'));
