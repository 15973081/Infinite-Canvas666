import { decodeCanvasDocument } from './canvas/domain/document-codec';
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

declare global {
  interface Window {
    CanvasLegacyBridge?: LegacyBridge;
    CanvasModernCore?: {
      compareOrder(kind: OrderKind, targetId: string, legacyOrder?: string[]): OrderComparison | null;
      getShadowReport(): ShadowReport;
      observeOrder(kind: OrderKind, targetId: string, legacyOrder: string[]): void;
      version: 2;
    };
  }
}

const shadowEnabled = new URLSearchParams(window.location.search).get('canvas_modern_core') === 'shadow';
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
  version: 2 as const,
  compareOrder,
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
});

document.documentElement.dataset.canvasModernCore = '2';
document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? 'ready' : 'missing';
document.documentElement.dataset.canvasModernShadow = shadowEnabled ? 'enabled' : 'disabled';
window.dispatchEvent(new CustomEvent('canvas-modern-core-ready'));
