import { describe, expect, it } from 'vitest';
import { loadCanvasRolloutPolicy, resolveCanvasV2Rollout, type CanvasRolloutPolicy } from './rollout';

const serverPolicy: CanvasRolloutPolicy = {
  blocked_reasons: [],
  configured_percentage: 25,
  effective_percentage: 25,
  enabled: true,
  kill_switch: false,
  version: 1,
};

describe('Canvas V2 rollout', () => {
  it('stays disabled by default and honors explicit overrides', () => {
    expect(resolveCanvasV2Rollout('', null, 'client-a')).toMatchObject({ enabled: false, percentage: 0, source: 'default' });
    expect(resolveCanvasV2Rollout('?canvas_v2=1', null, 'client-a')).toMatchObject({ enabled: true, forced: true });
    expect(resolveCanvasV2Rollout('?canvas_v2=0&canvas_v2_rollout=100', null, 'client-a')).toMatchObject({ enabled: false, forced: true });
  });

  it('makes a stable percentage decision and accepts operator storage configuration', () => {
    const storage = { getItem: () => '37' };
    const first = resolveCanvasV2Rollout('', storage, 'stable-client');
    const second = resolveCanvasV2Rollout('', storage, 'stable-client');
    expect(second).toEqual(first);
    expect(first).toMatchObject({ percentage: 37, source: 'storage' });
    expect(first.enabled).toBe(first.bucket < 37);
  });

  it('clamps rollout percentages', () => {
    expect(resolveCanvasV2Rollout('?canvas_v2_rollout=999', null, 'client')).toMatchObject({ enabled: true, percentage: 100 });
    expect(resolveCanvasV2Rollout('?canvas_v2_rollout=-1', null, 'client')).toMatchObject({ enabled: false, percentage: 0 });
  });

  it('uses a loaded server policy instead of stale operator storage', () => {
    const storage = { getItem: () => '100' };
    const first = resolveCanvasV2Rollout('', storage, 'stable-client', serverPolicy);
    const second = resolveCanvasV2Rollout('', storage, 'stable-client', serverPolicy);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ percentage: 25, policyLoaded: true, source: 'server' });
    expect(first.enabled).toBe(first.bucket < 25);
  });

  it('gives the server kill switch priority over every query override', () => {
    const policy = { ...serverPolicy, blocked_reasons: ['kill-switch'], effective_percentage: 0, kill_switch: true };
    expect(resolveCanvasV2Rollout('?canvas_v2=1&canvas_v2_rollout=100', null, 'client', policy)).toMatchObject({
      blockedReasons: ['kill-switch'],
      enabled: false,
      forced: false,
      killSwitch: true,
      percentage: 0,
      source: 'server',
    });
  });

  it('loads and validates the remote policy without breaking startup on failure', async () => {
    const fetcher = async () => new Response(JSON.stringify(serverPolicy), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
    expect(await loadCanvasRolloutPolicy(fetcher)).toEqual(serverPolicy);
    expect(await loadCanvasRolloutPolicy(async () => { throw new Error('offline'); })).toBeNull();
    expect(await loadCanvasRolloutPolicy(async () => new Response('{}'))).toBeNull();
  });
});
