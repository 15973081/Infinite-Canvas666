import { bindCanvasActivityEvents, createActivityStore, type CanvasActivitySnapshot } from '../stores/activity-store';
import { bindCanvasDocumentEvents, createDocumentStore } from '../stores/document-store';
import { bindExecutionEvents, createExecutionStore } from '../stores/execution-store';
import { bindCanvasStatusEvents, createSessionStore, type CanvasStatus } from '../stores/session-store';
import { mountCanvasActivityIsland } from './canvas-activity-island';
import { mountCanvasStatusIsland } from './canvas-status-island';
import { mountCanvasToolbarIsland } from './canvas-toolbar-island';
import { mountExecutionStatusIsland } from './execution-status-island';

export function mountReactExecutionIsland(element: HTMLElement): () => void {
  const bridge = window.CanvasLegacyBridge;
  if (!bridge) throw new Error('Canvas legacy bridge is unavailable');
  const store = createExecutionStore();
  const unbind = bindExecutionEvents(window, store);
  const root = mountExecutionStatusIsland(element, store, (command, payload) => {
    void bridge.runCommand(command, payload);
  });
  element.hidden = false;
  return () => {
    unbind();
    root.unmount();
  };
}

export function mountReactActivityIsland(element: HTMLElement): () => void {
  const bridge = window.CanvasLegacyBridge;
  if (!bridge) throw new Error('Canvas legacy bridge is unavailable');
  const activityStore = createActivityStore(bridge.getActivitySnapshot?.() as CanvasActivitySnapshot | undefined);
  const documentStore = createDocumentStore(bridge.getDocumentSnapshot());
  const unbindActivity = bindCanvasActivityEvents(window, activityStore);
  const unbindDocument = bindCanvasDocumentEvents(window, documentStore);
  const legacyPanel = element.parentElement?.querySelector<HTMLElement>(':scope > .log-panel') ?? null;
  const legacyDisplay = legacyPanel?.style.display ?? '';
  if (legacyPanel) legacyPanel.style.display = 'none';
  const previousDisplay = element.style.display;
  element.style.display = 'contents';
  element.hidden = false;
  const root = mountCanvasActivityIsland(
    element,
    activityStore,
    documentStore,
    () => { void bridge.runCommand('close-log'); },
  );
  return () => {
    unbindActivity();
    unbindDocument();
    root.unmount();
    element.hidden = true;
    element.style.display = previousDisplay;
    if (legacyPanel) legacyPanel.style.display = legacyDisplay;
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
