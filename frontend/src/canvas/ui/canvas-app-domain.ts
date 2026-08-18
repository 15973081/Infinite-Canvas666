export interface CanvasAssetInboxItem {
  kind: string;
  name: string;
  url: string;
}

export function canvasDocumentCost(document: Record<string, unknown>): number {
  return (Array.isArray(document.logs) ? document.logs : []).reduce((sum, value) => {
    if (!value || typeof value !== 'object') return sum;
    const log = value as Record<string, unknown>;
    if (['cancelled', 'error', 'failed'].includes(String(log.status || '').toLowerCase())) return sum;
    const cost = log.cost;
    if (cost && typeof cost === 'object') {
      const record = cost as Record<string, unknown>;
      if (String(record.status || 'priced') === 'priced' && Number.isFinite(Number(record.amount_micros))) {
        return sum + Math.max(0, Number(record.amount_micros)) / 1_000_000;
      }
    }
    const cny = typeof cost === 'number' ? cost : Number(log.cost_cny || 0);
    return sum + (Number.isFinite(cny) ? Math.max(0, cny) : 0);
  }, 0);
}

export function readCanvasAssetInbox(key: string, now = Date.now()): CanvasAssetInboxItem[] {
  if (!key) return [];
  try {
    const payload = JSON.parse(localStorage.getItem(key) || 'null') as Record<string, unknown> | null;
    const createdAt = Number(payload?.created_at || payload?.ts || 0);
    if (createdAt && now - createdAt > 30 * 60 * 1000) return [];
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Record<string, unknown>;
      const url = String(item.url || '').trim();
      if (!url) return [];
      return [{
        kind: String(item.kind || item.type || 'image'),
        name: String(item.name || item.title || '素材'),
        url,
      }];
    });
  } catch {
    return [];
  }
}
