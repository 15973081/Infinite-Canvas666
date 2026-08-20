import {
  loadCanvasRolloutPolicy,
  resolveCanvasV2Rollout,
  type CanvasRolloutPolicy,
} from './canvas/infrastructure/rollout';
import { legacyCanvasUrl } from './canvas/infrastructure/legacy-fallback';
import './canvas/ui/canvas.css';

declare global {
  interface Window {
    __CanvasBootstrapRolloutPolicy?: CanvasRolloutPolicy | null;
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

if (!decision.enabled) {
  window.location.replace(legacyCanvasUrl());
} else {
  await import('./main');
}
