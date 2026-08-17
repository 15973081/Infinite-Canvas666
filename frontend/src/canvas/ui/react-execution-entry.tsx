import { bindExecutionEvents, createExecutionStore } from '../stores/execution-store';
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
