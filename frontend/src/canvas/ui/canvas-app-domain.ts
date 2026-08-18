export interface CanvasAssetInboxItem {
  kind: string;
  name: string;
  url: string;
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
