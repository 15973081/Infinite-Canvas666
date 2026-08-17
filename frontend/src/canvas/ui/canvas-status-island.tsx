import { useStore } from 'zustand';
import { createRoot, type Root } from 'react-dom/client';
import type { SessionStore } from '../stores/session-store';

const colors = {
  error: '#dc2626',
  info: '#64748b',
  pending: '#d97706',
  success: '#16a34a',
};

export function mountCanvasStatusIsland(element: HTMLElement, store: SessionStore): Root {
  const root = createRoot(element);
  root.render(<CanvasStatusIsland store={store} />);
  return root;
}

function CanvasStatusIsland({ store }: { store: SessionStore }) {
  const status = useStore(store, ({ status }) => status);
  return (
    <span
      aria-live="polite"
      data-testid="canvas-status-island"
      role="status"
      style={{ alignItems: 'center', color: colors[status.kind], display: 'inline-flex', fontSize: 11, fontWeight: 700, gap: 5 }}
    >
      <span aria-hidden="true">●</span>
      {status.text || 'Ready'}
    </span>
  );
}
