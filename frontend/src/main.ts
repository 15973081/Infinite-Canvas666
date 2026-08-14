import { decodeCanvasDocument } from './canvas/domain/document-codec';
import { createGraphModel } from './canvas/domain/graph';

interface LegacyBridge {
  computeCascadeOrder(targetId: string): string[];
  getDocumentSnapshot(): unknown | null;
}

interface CascadeComparison {
  legacy: string[];
  matches: boolean;
  modern: string[];
}

declare global {
  interface Window {
    CanvasLegacyBridge?: LegacyBridge;
    CanvasModernCore?: {
      compareCascadeOrder(targetId: string): CascadeComparison | null;
      version: 1;
    };
  }
}

window.CanvasModernCore = Object.freeze({
  version: 1 as const,
  compareCascadeOrder(targetId: string): CascadeComparison | null {
    const bridge = window.CanvasLegacyBridge;
    const snapshot = bridge?.getDocumentSnapshot();
    if (!bridge || !snapshot) return null;
    const modern = createGraphModel(decodeCanvasDocument(snapshot)).cascadeOrder(targetId);
    const legacy = bridge.computeCascadeOrder(targetId);
    return {
      legacy,
      modern,
      matches: legacy.length === modern.length && legacy.every((id, index) => id === modern[index]),
    };
  },
});

document.documentElement.dataset.canvasModernCore = '1';
document.documentElement.dataset.canvasLegacyBridge = window.CanvasLegacyBridge ? 'ready' : 'missing';
window.dispatchEvent(new CustomEvent('canvas-modern-core-ready'));
