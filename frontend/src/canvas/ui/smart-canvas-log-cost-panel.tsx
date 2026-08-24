import { useEffect, useState } from 'react';

export interface SmartCanvasCostTotals { calls: number; estimated: number; image: number; total: number; unknown: number; video: number }
type LogCost = { amount_micros: number; kind: string; source: string; status: 'priced' } | { kind: string; source: string; status: 'unknown' } | null;

export function SmartCanvasLogCostPanel({ document, mode, onClose }: { document: Record<string, unknown>; mode: 'cost' | 'logs'; onClose(): void }) {
  const logs = Array.isArray(document.logs) ? document.logs.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object')) : [];
  const totals = smartCanvasLogCostTotals(logs);
  const [copiedId, setCopiedId] = useState('');
  useEffect(() => { window.requestAnimationFrame(() => (window as typeof window & { lucide?: { createIcons(): void } }).lucide?.createIcons()); }, [logs.length, mode]);
  const copyPrompt = (id: string, prompt: string) => {
    if (prompt) void navigator.clipboard?.writeText(prompt).catch(() => undefined);
    setCopiedId(id); window.setTimeout(() => setCopiedId((current) => current === id ? '' : current), 900);
  };
  return <div className="log-modal open" id="smartLogModal" onClick={onClose}>
    <div className={`log-panel ${mode === 'cost' ? 'cost-mode' : ''}`} id="smartLogPanel" onClick={(event) => event.stopPropagation()}>
      <div className="log-head"><div><div className="log-title" id="smartLogTitle">{mode === 'cost' ? '费用仪表盘' : '生成日志'}</div><div className="log-cost-summary" id="smartCostSummary">{`总计 ${formatSmartCanvasCost(totals.total)} · 已计费 ${totals.calls} 次${totals.unknown ? ` · 待定价 ${totals.unknown} 笔` : ''}`}</div></div><button className="preview-icon-btn" onClick={onClose} title="关闭" type="button"><i className="w-4 h-4" data-lucide="x" /></button></div>
      <div className="cost-dashboard" id="smartCostDashboard"><div className="cost-card cost-card-total"><span>画布总费用</span><strong id="smartCostTotal">{formatSmartCanvasCost(totals.total)}</strong><small id="smartCostMeta">{totals.estimated ? `含历史预估 ${formatSmartCanvasCost(totals.estimated)}` : '按调用时价格快照'}</small></div><div className="cost-card"><span>图片费用</span><strong id="smartCostImage">{formatSmartCanvasCost(totals.image)}</strong><small>按张 / 次</small></div><div className="cost-card"><span>视频费用</span><strong id="smartCostVideo">{formatSmartCanvasCost(totals.video)}</strong><small>按秒 / 次</small></div><div className="cost-card"><span>已计费调用</span><strong id="smartCostCalls">{totals.calls}</strong><small id="smartCostUnknown">待定价 {totals.unknown} 笔</small></div></div>
      <div className="log-list" id="smartLogList">{logs.length ? logs.map((log, index) => {
        const id = String(log.id || index);
        const failed = ['error', 'failed'].includes(String(log.status || '').toLowerCase());
        const request = object(log.request);
        const outputs = (Array.isArray(log.outputs) ? log.outputs : []).flatMap(outputItem);
        const cost = smartCanvasGenerationLogCost(log);
        const taskId = String(request.task_id || request.taskId || request.prompt_id || request.promptId || '');
        const backend = String(request.workflow_json || request.workflow || request.provider_id || request.providerId || request.backend || '');
        const subParts = [formatLogDate(log.createdAt || log.created_at), `输出 ${outputs.length}`, taskId ? `ID ${taskId}` : '', backend].filter(Boolean);
        const prompt = String(log.prompt || '暂无提示词信息');
        return <div className={`log-item ${failed ? 'failed' : ''}`} data-log-id={id} key={id}>
          <div className="log-main"><div className="log-meta"><span className={`log-chip ${failed ? 'status-failed' : 'status-ok'}`}>{failed ? '失败' : '成功'}</span><span className="log-chip">{String(log.platform || '-')}</span>{log.model ? <span className="log-chip">{String(log.model)}</span> : null}{cost?.status === 'priced' ? <span className={`log-chip ${cost.source === 'estimated' ? 'cost-estimated' : ''}`} title={cost.source === 'estimated' ? '根据历史价格回算' : '调用时价格快照'}>{`${formatSmartCanvasCost(cost.amount_micros)}${cost.source === 'estimated' ? ' 预估' : ''}`}</span> : cost?.status === 'unknown' ? <span className="log-chip cost-unknown">待定价</span> : null}<span className="log-chip">{formatRunDuration(Number(log.runMs || log.run_ms || 0))}</span></div><div className="log-subline">{subParts.map((part, partIndex) => <span key={partIndex} title={part}>{part}</span>)}</div>{log.error ? <div className="log-error" title={String(log.error)}>{String(log.error)}</div> : null}<div className={`log-prompt ${copiedId === id ? 'copied' : ''}`} data-prompt={String(log.prompt || '')} onClick={() => copyPrompt(id, String(log.prompt || ''))} title={prompt}>{copiedId === id ? '已复制' : prompt}</div></div>
          <div className="log-thumbs">{outputs.slice(0, 8).map((output, outputIndex) => output.kind === 'video' ? <video data-kind="video" data-url={output.url} key={`${output.url}-${outputIndex}`} muted onClick={() => openLogOutput(document, log, output.url)} preload="metadata" src={output.url} /> : <img alt="output" data-kind="image" data-url={output.url} key={`${output.url}-${outputIndex}`} loading="lazy" onClick={() => openLogOutput(document, log, output.url)} src={output.url} />)}</div>
        </div>;
      }) : <div className="log-empty">暂无生成日志</div>}</div>
    </div>
  </div>;
}

export function smartCanvasGenerationLogCost(log: Record<string, unknown>): LogCost {
  if (['error', 'failed'].includes(String(log.status || '').toLowerCase())) return null;
  const cost = object(log.cost);
  const kind = String(cost.kind || log.billingKind || log.kind || object(log.request).kind || inferKind(log));
  const source = String(cost.source || 'actual');
  if (String(cost.status || '') === 'priced' && Number.isFinite(Number(cost.amount_micros))) return { amount_micros: Math.max(0, Number(cost.amount_micros)), kind, source, status: 'priced' };
  const legacy = typeof log.cost === 'number' ? Number(log.cost) : Number(log.cost_cny || 0);
  if (Number.isFinite(legacy) && legacy > 0) return { amount_micros: Math.round(legacy * 1_000_000), kind, source, status: 'priced' };
  return { kind, source: source || 'estimated', status: 'unknown' };
}

export function smartCanvasLogCostTotals(logs: unknown[]): SmartCanvasCostTotals {
  return logs.reduce<SmartCanvasCostTotals>((totals, value) => {
    if (!value || typeof value !== 'object') return totals;
    const cost = smartCanvasGenerationLogCost(value as Record<string, unknown>);
    if (cost?.status === 'priced') {
      totals.total += cost.amount_micros;
      if (cost.kind === 'video') totals.video += cost.amount_micros; else totals.image += cost.amount_micros;
      totals.calls += 1;
      if (cost.source === 'estimated') totals.estimated += cost.amount_micros;
    } else if (cost?.status === 'unknown') totals.unknown += 1;
    return totals;
  }, { calls: 0, estimated: 0, image: 0, total: 0, unknown: 0, video: 0 });
}

export function formatSmartCanvasCost(amountMicros: number): string {
  return `¥${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(amountMicros || 0) / 1_000_000)}`;
}

function outputItem(value: unknown): Array<{ kind: 'image' | 'video'; url: string }> {
  const record = object(value); const url = typeof value === 'string' ? value : String(record.url || '');
  if (!url) return [];
  return [{ kind: String(record.kind || '').toLowerCase() === 'video' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ? 'video' : 'image', url }];
}
function inferKind(log: Record<string, unknown>) { return (Array.isArray(log.outputs) ? log.outputs : []).some((value) => outputItem(value)[0]?.kind === 'video') ? 'video' : 'image'; }
function formatLogDate(value: unknown) { const timestamp = Number(value || Date.now()); return new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toLocaleString('zh-CN'); }
function formatRunDuration(ms: number) { if (!ms) return '0.0s'; if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`; return `${Math.floor(ms / 60_000)}m ${Math.floor(ms % 60_000 / 1_000)}s`; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function openLogOutput(document: Record<string, unknown>, log: Record<string, unknown>, url: string) {
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const node = nodes.find((value) => value && typeof value === 'object' && String((value as Record<string, unknown>).id || '') === String(log.nodeId || '')) as Record<string, unknown> | undefined;
  if (node) window.CanvasBoardV2?.openOutputLightbox(node, url);
}
