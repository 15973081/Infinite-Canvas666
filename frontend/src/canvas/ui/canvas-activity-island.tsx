import { useStore } from 'zustand';
import { createRoot, type Root } from 'react-dom/client';
import type { ActivityStore } from '../stores/activity-store';
import type { DocumentStore } from '../stores/document-store';

export function mountCanvasActivityIsland(
  element: HTMLElement,
  activityStore: ActivityStore,
  documentStore: DocumentStore,
  close: () => void,
): Root {
  const root = createRoot(element);
  root.render(<CanvasActivityIsland activityStore={activityStore} close={close} documentStore={documentStore} />);
  return root;
}

function formatCost(micros: number): string {
  return `¥${new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  }).format(micros / 1_000_000)}`;
}

function CanvasActivityIsland({
  activityStore,
  close,
  documentStore,
}: {
  activityStore: ActivityStore;
  close: () => void;
  documentStore: DocumentStore;
}) {
  const { costs, logs, mode } = useStore(activityStore, ({ snapshot }) => snapshot);
  const title = useStore(documentStore, ({ document }) => String(document?.title || '当前画布'));

  return (
    <section
      className={`log-panel${mode === 'cost' ? ' cost-mode' : ''}`}
      data-testid="canvas-activity-island"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="log-head">
        <div>
          <div className="log-title">{mode === 'cost' ? '费用仪表盘' : '生成日志'}</div>
          <div className="log-cost-summary">{title} · 总计 {formatCost(costs.total)}</div>
        </div>
        <button aria-label="关闭日志" className="preview-icon-btn" onClick={close} type="button">×</button>
      </header>
      <div className="cost-dashboard" aria-live="polite">
        <div className="cost-card cost-card-total"><span>预估总费用</span><strong>{formatCost(costs.total)}</strong><small>{costs.estimated ? `含预估 ${formatCost(costs.estimated)}` : '按调用时价格统计'}</small></div>
        <div className="cost-card"><span>图片费用</span><strong>{formatCost(costs.image)}</strong></div>
        <div className="cost-card"><span>视频费用</span><strong>{formatCost(costs.video)}</strong></div>
        <div className="cost-card"><span>计费调用</span><strong>{costs.calls}</strong><small>{costs.unknown ? `${costs.unknown} 笔待定价` : ''}</small></div>
      </div>
      <div className="log-list">
        {logs.length ? logs.map((log) => (
          <article className={`log-item${log.status === 'failed' ? ' failed' : ''}`} key={log.id}>
            <div className="log-main">
              <div className="log-meta">
                <span className={`log-chip ${log.status === 'failed' ? 'status-failed' : 'status-ok'}`}>{log.status === 'failed' ? '失败' : '成功'}</span>
                <span className="log-chip">{log.platform || '-'}</span>
                {log.model ? <span className="log-chip">{log.model}</span> : null}
                {log.costMicros === null ? <span className="log-chip cost-unknown">待定价</span> : <span className={`log-chip${log.costSource === 'estimated' ? ' cost-estimated' : ''}`}>{formatCost(log.costMicros)}</span>}
              </div>
              <div className="log-subline"><span>{new Date(log.createdAt).toLocaleString('zh-CN')}</span><span>输出 {log.outputCount}</span><span>{Math.round(log.runMs / 1000)}s</span></div>
              {log.error ? <div className="log-error">{log.error}</div> : null}
              <div className="log-prompt" title={log.prompt}>{log.prompt || '无提示词元数据'}</div>
            </div>
          </article>
        )) : <div className="log-empty">暂无生成日志</div>}
      </div>
    </section>
  );
}
