import { bindExecutionEvents, createExecutionStore } from '../stores/execution-store';
import { bindCanvasStatusEvents, createSessionStore, type CanvasStatus } from '../stores/session-store';
import { mountCanvasStatusIsland } from './canvas-status-island';
import { mountCanvasToolbarIsland } from './canvas-toolbar-island';
import { mountExecutionStatusIsland } from './execution-status-island';

export function mountReactExecutionIsland(element: HTMLElement): () => void {
  const store = createExecutionStore();
  const unbind = bindExecutionEvents(window, store);
  const root = mountExecutionStatusIsland(element, store);
  element.hidden = false;
  return () => {
    unbind();
    root.unmount();
  };
}

export function mountReactStatusIsland(element: HTMLElement): () => void {
  const initial = window.CanvasLegacyBridge?.getStatusSnapshot?.() as CanvasStatus | undefined;
  const store = createSessionStore(initial);
  const unbind = bindCanvasStatusEvents(window, store);
  const root = mountCanvasStatusIsland(element, store);
  element.hidden = false;
  return () => {
    unbind();
    root.unmount();
  };
}

export function mountReactToolbarIsland(element: HTMLElement): () => void {
  const bridge = window.CanvasLegacyBridge;
  if (!bridge) throw new Error('Canvas legacy bridge is unavailable');
  const legacyButtons = ['canvasCostToggle', 'canvasLogToggle', 'canvasBackupToggle']
    .map((id) => document.getElementById(id))
    .filter((button): button is HTMLElement => Boolean(button));
  const hiddenStates = legacyButtons.map((button) => button.hidden);
  legacyButtons.forEach((button) => { button.hidden = true; });
  const previousDisplay = element.style.display;
  element.style.display = 'contents';
  element.hidden = false;
  const root = mountCanvasToolbarIsland(element, (command) => { void bridge.runCommand(command); });
  return () => {
    root.unmount();
    element.style.display = previousDisplay;
    legacyButtons.forEach((button, index) => { button.hidden = hiddenStates[index]; });
  };
}
