import { describe, expect, it } from 'vitest';
import { createCanvasManagementClient } from './canvas-management';

const response = (payload: unknown = {}) => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });

describe('Canvas management client', () => {
  it('owns list, create, trash and lock lifecycle without CanvasApi globals', async () => {
    const requests: Array<{ body: unknown; method: string; path: string }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      requests.push({ body: init?.body ? JSON.parse(String(init.body)) : null, method: init?.method || 'GET', path });
      if (path === '/api/canvases' && init?.method === 'POST') return response({ id: 'created', title: 'New' });
      if (path === '/api/canvases') return response({ canvases: [{ id: 'active' }] });
      if (path === '/api/canvases/trash') return response({ canvases: [{ id: 'deleted', deleted_at: 1 }] });
      if (path === '/api/canvases/active/meta') return response({ id: 'active', updated_at: 42 });
      if (path.endsWith('/lock') && init?.method === 'POST') return response({ ok: true });
      return response({ ok: true });
    };
    const client = createCanvasManagementClient(fetcher);

    expect(await client.list()).toEqual([{ id: 'active' }]);
    expect(await client.listTrash()).toMatchObject([{ id: 'deleted' }]);
    expect(await client.create('New')).toMatchObject({ id: 'created', title: 'New' });
    expect(await client.getMeta('active')).toEqual({ id: 'active', updated_at: 42 });
    expect(await client.acquireLock('active', 'client', 'User')).toEqual({ ok: true });
    await client.releaseLock('active', 'client', true);

    expect(requests).toContainEqual({ path: '/api/canvases/active/lock', method: 'POST', body: { client_id: 'client', username: 'User' } });
    expect(requests).toContainEqual({ path: '/api/canvases/active/lock/release', method: 'POST', body: { client_id: 'client' } });
  });

  it('returns the remote holder when the editing lock is already owned', async () => {
    const fetcher = async () => new Response(JSON.stringify({ detail: { message: 'locked', holder: { client_id: 'other', username: 'Alice' } } }), {
      status: 409, headers: { 'content-type': 'application/json' },
    });
    const client = createCanvasManagementClient(fetcher);

    await expect(client.acquireLock('active', 'client', 'Bob')).resolves.toEqual({
      ok: false, holder: { client_id: 'other', username: 'Alice' },
    });
  });
});
