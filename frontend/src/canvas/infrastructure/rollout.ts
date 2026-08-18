export interface CanvasRolloutDecision {
  bucket: number;
  enabled: boolean;
  forced: boolean;
  percentage: number;
  source: 'default' | 'query' | 'storage';
}

export function resolveCanvasV2Rollout(
  search: string, storage: Pick<Storage, 'getItem'> | null, identity: string,
): CanvasRolloutDecision {
  const params = new URLSearchParams(search);
  const forced = params.get('canvas_v2');
  const queryPercentage = numericPercentage(params.get('canvas_v2_rollout'));
  const storedPercentage = numericPercentage(safeGet(storage, 'canvasV2RolloutPercentage'));
  const percentage = queryPercentage ?? storedPercentage ?? 0;
  const source = queryPercentage !== null ? 'query' : storedPercentage !== null ? 'storage' : 'default';
  const bucket = hashBucket(identity || 'anonymous');
  if (forced === '1' || forced === '0') {
    return { bucket, enabled: forced === '1', forced: true, percentage, source: 'query' };
  }
  return { bucket, enabled: bucket < percentage, forced: false, percentage, source };
}

function numericPercentage(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.floor(number))) : null;
}

function hashBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function safeGet(storage: Pick<Storage, 'getItem'> | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
