import { useStore } from 'zustand';
import { createRoot, type Root } from 'react-dom/client';
import type { ExecutionState } from '../domain/execution';
import type { ExecutionStore } from '../stores/execution-store';

const statusLabels: Record<ExecutionState['status'], string> = {
  idle: '等待运行',
  queued: '排队中',
  running: '运行中',
  stopping: '正在停止',
  done: '已完成',
  failed: '运行失败',
  stopped: '已停止',
};

type ExecutionCommand = 'retry-execution' | 'stop-execution';

export function mountExecutionStatusIsland(
  element: HTMLElement,
  store: ExecutionStore,
  runCommand: (command: ExecutionCommand, payload: { targetId: string }) => void,
): Root {
  const root = createRoot(element);
  root.render(<ExecutionStatusIsland runCommand={runCommand} store={store} />);
  return root;
}

function ExecutionStatusIsland({
  runCommand,
  store,
}: {
  runCommand: (command: ExecutionCommand, payload: { targetId: string }) => void;
  store: ExecutionStore;
}) {
  const runs = useStore(store, ({ runs }) => runs);
  const values = Object.values(runs);
  const active = values.filter(({ status }) => ['queued', 'running', 'stopping'].includes(status));
  const current = active.at(-1) ?? values.at(-1);
  const progress = current?.mode === 'parallel'
    ? `${current.completedRounds} 轮完成`
    : `${current?.completedNodeIds.length ?? 0}/${current?.order.length ?? 0} 节点`;

  return (
    <section
      aria-live="polite"
      className="panel"
      data-testid="execution-status-island"
      style={{ alignItems: 'center', display: 'flex', gap: 8, minHeight: 42, padding: '7px 12px' }}
    >
      <span aria-hidden="true" style={{ color: active.length ? '#2563eb' : '#64748b' }}>●</span>
      <span style={{ display: 'grid', lineHeight: 1.2 }}>
        <strong style={{ fontSize: 12 }}>{current ? statusLabels[current.status] : '现代执行已就绪'}</strong>
        <small style={{ color: '#64748b', fontSize: 10 }}>
          {current ? `${active.length || 1} 个工作流 · ${progress}` : '等待运行事件'}
        </small>
        {current?.error ? <small style={{ color: '#dc2626', fontSize: 10 }}>{current.error}</small> : null}
      </span>
      {current && ['queued', 'running', 'stopping'].includes(current.status) ? (
        <button
          className="tool-btn"
          disabled={current.status === 'stopping'}
          onClick={() => runCommand('stop-execution', { targetId: current.targetId })}
          type="button"
        >
          停止
        </button>
      ) : null}
      {current?.status === 'failed' ? (
        <button
          className="tool-btn"
          onClick={() => runCommand('retry-execution', { targetId: current.targetId })}
          type="button"
        >
          重试
        </button>
      ) : null}
    </section>
  );
}
