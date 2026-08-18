import { requestJson, type Fetcher } from './http';

export interface CanvasRolloutPolicy {
  blocked_reasons: string[];
  configured_percentage: number;
  effective_percentage: number;
  enabled: boolean;
  kill_switch: boolean;
  version: number;
}

export interface CanvasRolloutDecision {
  blockedReasons: string[];
  bucket: number;
  enabled: boolean;
  forced: boolean;
  killSwitch: boolean;
  percentage: number;
  policyLoaded: boolean;
  source: 'default' | 'query' | 'server' | 'storage';
}

export async function loadCanvasRolloutPolicy(fetcher: Fetcher = fetch): Promise<CanvasRolloutPolicy | null> {
  try {
    const payload = await requestJson<unknown>(fetcher, '/api/canvas-rollout', {}, { timeoutMs: 1_500 });
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    if (typeof record.enabled !== 'boolean' || typeof record.kill_switch !== 'boolean') return null;
    const effectivePercentage = numericValue(record.effective_percentage);
    const configuredPercentage = numericValue(record.configured_percentage);
    if (effectivePercentage === null || configuredPercentage === null) return null;
    return {
      blocked_reasons: Array.isArray(record.blocked_reasons)
        ? record.blocked_reasons.filter((reason): reason is string => typeof reason === 'string')
        : [],
      configured_percentage: configuredPercentage,
      effective_percentage: effectivePercentage,
      enabled: record.enabled,
      kill_switch: record.kill_switch,
      version: typeof record.version === 'number' ? record.version : 1,
    };
  } catch {
    return null;
  }
}

export function resolveCanvasV2Rollout(
  search: string,
  storage: Pick<Storage, 'getItem'> | null,
  identity: string,
  policy: CanvasRolloutPolicy | null = null,
): CanvasRolloutDecision {
  const params = new URLSearchParams(search);
  const forced = params.get('canvas_v2');
  const queryPercentage = numericPercentage(params.get('canvas_v2_rollout'));
  const storedPercentage = numericPercentage(safeGet(storage, 'canvasV2RolloutPercentage'));
  const policyLoaded = policy !== null;
  const blockedReasons = policy?.blocked_reasons ?? [];
  const bucket = hashBucket(identity || 'anonymous');

  if (policy?.kill_switch) {
    return decision(bucket, false, false, 0, 'server', true, blockedReasons, true);
  }

  const fallbackPercentage = policy?.effective_percentage ?? storedPercentage ?? 0;
  const fallbackSource = policy ? 'server' : storedPercentage !== null ? 'storage' : 'default';
  const percentage = queryPercentage ?? fallbackPercentage;
  if (forced === '1' || forced === '0') {
    return decision(bucket, forced === '1', true, percentage, 'query', policyLoaded, blockedReasons, false);
  }
  const source = queryPercentage !== null ? 'query' : fallbackSource;
  return decision(bucket, bucket < percentage, false, percentage, source, policyLoaded, blockedReasons, false);
}

function decision(
  bucket: number,
  enabled: boolean,
  forced: boolean,
  percentage: number,
  source: CanvasRolloutDecision['source'],
  policyLoaded: boolean,
  blockedReasons: string[],
  killSwitch: boolean,
): CanvasRolloutDecision {
  return { blockedReasons: [...blockedReasons], bucket, enabled, forced, killSwitch, percentage, policyLoaded, source };
}

function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.floor(value)))
    : null;
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
