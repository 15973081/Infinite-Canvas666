import { describe, expect, it } from 'vitest';
import { createCanvasRepository, CanvasConflictError, canvasDocumentSavePayload } from './canvas-repository';
import { ApiError, requestJson, type Fetcher } from './http';
import { createTaskClient } from './task-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('task client', () => {
  it('submits and polls an image task to completion with the current API contract', async () => {
    const requests: Array<{ method: string; url: string }> = [];
    const statuses: Array<'queued' | 'running' | 'succeeded'> = ['queued', 'running', 'succeeded'];
    const fetcher: Fetcher = async (input, init) => {
      const url = String(input);
      requests.push({ method: init?.method || 'GET', url });
      if (init?.method === 'POST') return jsonResponse({ task_id: 'image/1', status: 'queued' });
      const status = statuses.shift() || 'succeeded';
      return jsonResponse({ id: 'image/1', status, result: status === 'succeeded' ? { images: ['/output/a.png'] } : null });
    };
    const client = createTaskClient(fetcher);

    const submitted = await client.submit('image', { prompt: 'test' });
    const completed = await client.wait('image', submitted.task_id || '', { intervalMs: 0, timeoutMs: 100 });

    expect(completed).toMatchObject({ status: 'succeeded', result: { images: ['/output/a.png'] } });
    expect(requests).toEqual([
      { method: 'POST', url: '/api/canvas-image-tasks' },
      { method: 'GET', url: '/api/canvas-image-tasks/image%2F1' },
      { method: 'GET', url: '/api/canvas-image-tasks/image%2F1' },
      { method: 'GET', url: '/api/canvas-image-tasks/image%2F1' },
    ]);
    expect(client.getDiagnostics()).toEqual({
      activeSubmissions: 0,
      activeWatches: 0,
      cancelledWatches: 0,
      deduplicatedSubmissions: 0,
      deduplicatedWatches: 0,
      pollErrors: 0,
      polls: 3,
      recoveredTasks: 0,
      resumeRequests: 0,
      resumedTasks: 0,
      submissions: 1,
      submissionRetries: 0,
    });
  });

  it('deduplicates concurrent submissions and safely retries with one idempotency key', async () => {
    const bodies: Record<string, unknown>[] = [];
    let calls = 0;
    const client = createTaskClient(async (_input, init) => {
      calls += 1;
      bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
      if (calls === 1) throw new TypeError('connection lost after submit');
      return jsonResponse({ task_id: 'same-task', status: 'queued', deduplicated: true });
    });

    const first = client.submit('image', { prompt: 'same' }, { idempotencyKey: 'canvas:node:run' });
    const duplicate = client.submit('image', { prompt: 'same' }, { idempotencyKey: 'canvas:node:run' });

    expect(duplicate).toBe(first);
    await expect(first).resolves.toMatchObject({ task_id: 'same-task' });
    expect(bodies).toEqual([
      { prompt: 'same', idempotency_key: 'canvas:node:run' },
      { prompt: 'same', idempotency_key: 'canvas:node:run' },
    ]);
    expect(client.getDiagnostics()).toMatchObject({
      activeSubmissions: 0, deduplicatedSubmissions: 1, submissions: 2, submissionRetries: 1,
    });
  });

  it('retries transient polling failures but keeps missing tasks terminal', async () => {
    let calls = 0;
    const retrying = createTaskClient(async () => {
      calls += 1;
      return calls === 1 ? jsonResponse({ detail: 'busy' }, 503) : jsonResponse({ id: 'v1', status: 'succeeded', result: {} });
    });
    await expect(retrying.wait('video', 'v1', { intervalMs: 0, maxPollErrors: 1 })).resolves.toMatchObject({
      status: 'succeeded',
    });

    const missing = createTaskClient(async () => jsonResponse({ detail: '任务不存在' }, 404));
    await expect(missing.wait('image', 'gone', { intervalMs: 0 })).rejects.toMatchObject({
      code: 'not-found',
      retryable: false,
    });
  });

  it('cancels local tracking without pretending to cancel the backend task', async () => {
    const methods: string[] = [];
    const client = createTaskClient(async (_input, init) => {
      methods.push(init?.method || 'GET');
      return jsonResponse({ id: 'image-1', status: 'running' });
    });
    const pending = client.watch('image', 'image-1', { intervalMs: 10_000 });
    const duplicate = client.watch('image', 'image-1', { intervalMs: 10_000 });
    await Promise.resolve();

    expect(duplicate).toBe(pending);
    expect(client.cancel('image', 'image-1')).toBe(true);
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
    expect(methods).toEqual(['GET']);
    expect(client.getDiagnostics()).toMatchObject({
      activeWatches: 0,
      cancelledWatches: 1,
      deduplicatedWatches: 1,
      polls: 1,
    });
  });

  it('resumes persisted image and video task references', async () => {
    const client = createTaskClient(async (input) => jsonResponse({
      id: String(input).split('/').pop(),
      recovered_after_restart: String(input).includes('/i1'),
      status: 'succeeded',
      result: {},
    }));
    const results = await client.resume([
      { kind: 'image', id: 'i1' },
      { kind: 'video', id: 'v1' },
    ], { intervalMs: 0 });

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(client.getDiagnostics()).toMatchObject({ recoveredTasks: 1, resumeRequests: 1, resumedTasks: 2 });
  });
});

describe('canvas repository', () => {
  const serverCanvas = {
    id: 'canvas/1',
    title: 'Test',
    custom: { preserved: true },
    nodes: [{ id: 'node-1', type: 'future-node', future: 7 }],
    connections: [],
    updated_at: 20,
  };

  it('loads, saves and preserves unknown document fields', async () => {
    const requests: Array<{ body?: string; method: string; url: string }> = [];
    const repository = createCanvasRepository(async (input, init) => {
      requests.push({ body: init?.body as string | undefined, method: init?.method || 'GET', url: String(input) });
      return jsonResponse({ canvas: serverCanvas });
    });

    const loaded = await repository.get('canvas/1');
    const saved = await repository.save('canvas/1', canvasDocumentSavePayload(loaded));

    expect(saved.custom).toEqual({ preserved: true });
    expect(saved.nodes[0].future).toBe(7);
    expect(requests.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'GET', url: '/api/canvases/canvas%2F1' },
      { method: 'PUT', url: '/api/canvases/canvas%2F1' },
    ]);
    expect(JSON.parse(requests[1].body || '{}').custom).toEqual({ preserved: true });
    expect(JSON.parse(requests[1].body || '{}').base_updated_at).toBe(20);
    expect(repository.getDiagnostics()).toMatchObject({ loads: 1, saves: 1, conflicts: 0, errors: 0 });
  });

  it('runs a bounded read-only historical canvas audit', async () => {
    const urls: string[] = [];
    const repository = createCanvasRepository(async (input) => {
      urls.push(String(input));
      return jsonResponse({ summary: { files: 4, compatible: 3, incompatible: 1, errors: 2, warnings: 5 } });
    });

    const report = await repository.audit({ includeDeleted: true, includeDetails: false, maxFiles: 12 });

    expect(report.summary).toMatchObject({ files: 4, incompatible: 1 });
    expect(urls).toEqual(['/api/canvas-audit?include_deleted=true&include_details=false&max_files=12']);
    expect(repository.getDiagnostics()).toMatchObject({ audits: 1, errors: 0 });
  });

  it('returns the server document and timestamp on a 409 conflict', async () => {
    const repository = createCanvasRepository(async () => jsonResponse({
      detail: { message: 'conflict', canvas: serverCanvas, updated_at: 20 },
    }, 409));

    const error = await repository.save('canvas-1', {
      nodes: [],
      connections: [],
      base_updated_at: 10,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CanvasConflictError);
    expect(error).toMatchObject({ code: 'conflict', updatedAt: 20 });
    expect((error as CanvasConflictError).serverCanvas?.custom).toEqual({ preserved: true });
    expect(repository.getDiagnostics()).toMatchObject({ conflicts: 1, errors: 0, saves: 0 });
  });

  it('encodes backup paths and decodes restored documents', async () => {
    const urls: string[] = [];
    const repository = createCanvasRepository(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/backups')) return jsonResponse({ backups: [{ filename: 'one.json' }] });
      if (url.includes('/restore')) return jsonResponse({ canvas: serverCanvas });
      return jsonResponse({ ok: true, filename: 'one.json' });
    });

    await repository.createBackup('canvas/1');
    expect(await repository.listBackups('canvas/1')).toEqual([{ filename: 'one.json' }]);
    expect((await repository.restoreBackup('canvas/1', 'one copy.json')).id).toBe('canvas/1');
    expect(urls).toEqual([
      '/api/canvases/canvas%2F1/backup',
      '/api/canvases/canvas%2F1/backups',
      '/api/canvases/canvas%2F1/backups/one%20copy.json/restore',
    ]);
    expect(repository.getDiagnostics()).toMatchObject({
      backupsCreated: 1,
      backupsListed: 1,
      backupsRestored: 1,
    });
  });
});

describe('HTTP boundary', () => {
  it('classifies request timeouts', async () => {
    const fetcher: Fetcher = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });

    await expect(requestJson(fetcher, '/slow', {}, { timeoutMs: 1 })).rejects.toMatchObject({
      code: 'timeout',
      retryable: true,
    } satisfies Partial<ApiError>);
  });
});
