import {
  loadCanvasRolloutPolicy,
  resolveCanvasV2Rollout,
  type CanvasRolloutPolicy,
} from './canvas/infrastructure/rollout';
import './canvas/ui/canvas.css';

declare global {
  interface Window {
    __CanvasBootstrapRolloutPolicy?: CanvasRolloutPolicy | null;
    __loadCanvasLegacyFallback?: () => Promise<void>;
  }
}

const policy = await loadCanvasRolloutPolicy();
window.__CanvasBootstrapRolloutPolicy = policy;
const decision = resolveCanvasV2Rollout(
  window.location.search,
  window.localStorage,
  window.sessionStorage.getItem('canvasClientId') || window.location.pathname,
  policy,
);

let legacyLoad: Promise<void> | null = null;
window.__loadCanvasLegacyFallback = () => {
  legacyLoad ??= (async () => {
    for (const source of [
    '/static/js/canvas-core.js?v=2026.07.06.1',
    '/static/js/canvas-api.js?v=2026.07.06.1',
    '/static/js/ltx-director-timeline.js?v=2026.06.10.1.1781494198',
    '/static/js/canvas.js?v=2026.07.23.4',
    ]) await loadClassicScript(source);
    if (document.readyState === 'complete') await runLegacyInitializer();
  })();
  return legacyLoad;
};

if (!decision.enabled) await window.__loadCanvasLegacyFallback();

await import('./main');
if (!decision.enabled) await runLegacyInitializer();

function loadClassicScript(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Classic Canvas dependency: ${source}`));
    document.body.appendChild(script);
  });
}

async function runLegacyInitializer(): Promise<void> {
  const initializer = window.onload;
  if (typeof initializer !== 'function') return;
  window.onload = null;
  await initializer.call(window, new Event('load'));
}
