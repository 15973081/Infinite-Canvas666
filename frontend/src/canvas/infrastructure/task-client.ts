import { ApiError, requestJson, type Fetcher, type RequestOptions } from './http';

export type CanvasTaskKind = 'image' | 'video';
export type CanvasTaskStatus = 'cancelled' | 'failed' | 'queued' | 'running' | 'succeeded';

export interface CanvasTaskRecord {
  error?: string;
  id?: string;
  result?: unknown;
  status: CanvasTaskStatus;
  task_id?: string;
  upstream_task_id?: string;
  recoverable?: boolean;
  recovered_after_restart?: boolean;
  recovery_status?: string;
  [key: string]: unknown;
}

export interface TaskWaitOptions extends RequestOptions {
  intervalMs?: number;
  maxPollErrors?: number;
  requestTimeoutMs?: number;
}

export interface TaskSubmitOptions extends RequestOptions {
  idempotencyKey?: string;
  retryCount?: number;
}

export interface TaskReference {
  id: string;
  kind: CanvasTaskKind;
}

export interface TaskClientDiagnostics {
  activeSubmissions: number;
  activeWatches: number;
  cancelledWatches: number;
  deduplicatedSubmissions: number;
  deduplicatedWatches: number;
  pollErrors: number;
  polls: number;
  recoveredTasks: number;
  resumeRequests: number;
  resumedTasks: number;
  submissions: number;
  submissionRetries: number;
}

export interface TaskClient {
  cancel(kind: CanvasTaskKind, taskId: string): boolean;
  get(kind: CanvasTaskKind, taskId: string, options?: RequestOptions): Promise<CanvasTaskRecord>;
  getDiagnostics(): TaskClientDiagnostics;
  resume(tasks: readonly TaskReference[], options?: TaskWaitOptions): Promise<PromiseSettledResult<CanvasTaskRecord>[]>;
  submit(kind: CanvasTaskKind, payload: unknown, options?: TaskSubmitOptions): Promise<CanvasTaskRecord>;
  wait(kind: CanvasTaskKind, taskId: string, options?: TaskWaitOptions): Promise<CanvasTaskRecord>;
  waitForResult(kind: CanvasTaskKind, taskId: string, options?: TaskWaitOptions): Promise<unknown>;
  watch(kind: CanvasTaskKind, taskId: string, options?: TaskWaitOptions): Promise<CanvasTaskRecord>;
}

const taskPaths: Record<CanvasTaskKind, string> = {
  image: '/api/canvas-image-tasks',
  video: '/api/canvas-video-tasks',
};

export function createTaskClient(fetcher: Fetcher = fetch): TaskClient {
  const active = new Map<string, { controller: AbortController; promise: Promise<CanvasTaskRecord> }>();
  const activeSubmissions = new Map<string, Promise<CanvasTaskRecord>>();
  const diagnostics = {
    cancelledWatches: 0, deduplicatedSubmissions: 0, deduplicatedWatches: 0,
    pollErrors: 0, polls: 0, recoveredTasks: 0, resumeRequests: 0, resumedTasks: 0,
    submissions: 0, submissionRetries: 0,
  };

  const submit: TaskClient['submit'] = (kind, payload, options = {}) => {
    const idempotencyKey = String(options.idempotencyKey || '').trim();
    const activeKey = idempotencyKey ? `${kind}:${idempotencyKey}` : '';
    const existing = activeKey ? activeSubmissions.get(activeKey) : undefined;
    if (existing) {
      diagnostics.deduplicatedSubmissions += 1;
      return existing;
    }
    const body = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>), ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) }
      : payload ?? {};
    const request = async () => {
      const retryCount = Math.max(0, Math.min(2, Number(options.retryCount ?? (idempotencyKey ? 1 : 0))));
      let attempt = 0;
      while (true) {
        try {
          diagnostics.submissions += 1;
          const task = await requestJson<CanvasTaskRecord>(fetcher, taskPaths[kind], {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          }, options);
          requireTaskId(task);
          return task;
        } catch (error) {
          if (!(error instanceof ApiError) || !error.retryable || attempt++ >= retryCount) throw error;
          diagnostics.submissionRetries += 1;
        }
      }
    };
    const promise = request().finally(() => { if (activeKey) activeSubmissions.delete(activeKey); });
    if (activeKey) activeSubmissions.set(activeKey, promise);
    return promise;
  };

  const get: TaskClient['get'] = (kind, taskId, options) => {
    if (!taskId) return Promise.reject(new TypeError('Task ID is required'));
    return requestJson(fetcher, `${taskPaths[kind]}/${encodeURIComponent(taskId)}`, {}, options);
  };

  const wait: TaskClient['wait'] = async (kind, taskId, options = {}) => {
    const { intervalMs = kind === 'video' ? 2_500 : 1_800, maxPollErrors = 3, requestTimeoutMs = 30_000 } = options;
    const startedAt = Date.now();
    let pollErrors = 0;
    while (true) {
      throwIfStopped(options.signal, startedAt, options.timeoutMs);
      try {
        diagnostics.polls += 1;
        const task = await get(kind, taskId, { signal: options.signal, timeoutMs: requestTimeoutMs });
        pollErrors = 0;
        if (task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled') return task;
      } catch (error) {
        diagnostics.pollErrors += 1;
        if (!(error instanceof ApiError) || !error.retryable || pollErrors++ >= maxPollErrors) throw error;
      }
      await delay(intervalMs, options.signal, startedAt, options.timeoutMs);
    }
  };

  const watch: TaskClient['watch'] = (kind, taskId, options = {}) => {
    const key = `${kind}:${taskId}`;
    const existing = active.get(key);
    if (existing) {
      diagnostics.deduplicatedWatches += 1;
      return existing.promise;
    }
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const promise = wait(kind, taskId, { ...options, signal: controller.signal }).finally(() => {
      options.signal?.removeEventListener('abort', abort);
      active.delete(key);
    });
    active.set(key, { controller, promise });
    return promise;
  };

  const cancel: TaskClient['cancel'] = (kind, taskId) => {
    const tracked = active.get(`${kind}:${taskId}`);
    if (!tracked) return false;
    tracked.controller.abort();
    diagnostics.cancelledWatches += 1;
    return true;
  };

  const waitForResult: TaskClient['waitForResult'] = async (kind, taskId, options) => {
    const task = await wait(kind, taskId, options);
    if (task.status !== 'succeeded') {
      throw new ApiError(task.error || 'Task failed', 'task-failed', 0, task);
    }
    return task.result;
  };

  const resume: TaskClient['resume'] = async (tasks, options) => {
    diagnostics.resumeRequests += 1;
    diagnostics.resumedTasks += tasks.length;
    const results = await Promise.allSettled(tasks.map(({ kind, id }) => watch(kind, id, options)));
    diagnostics.recoveredTasks += results.filter((result) =>
      result.status === 'fulfilled' && result.value.recovered_after_restart
    ).length;
    return results;
  };

  const getDiagnostics = (): TaskClientDiagnostics => ({ activeSubmissions: activeSubmissions.size, activeWatches: active.size, ...diagnostics });

  return { cancel, get, getDiagnostics, resume, submit, wait, waitForResult, watch };
}

function requireTaskId(task: CanvasTaskRecord): string {
  const taskId = String(task.task_id || task.id || '');
  if (!taskId) throw new ApiError('Task response did not include an ID', 'validation', 200, task);
  return taskId;
}

function throwIfStopped(signal: AbortSignal | undefined, startedAt: number, timeoutMs = 0): void {
  if (signal?.aborted) throw new ApiError('Task polling aborted', 'aborted');
  if (timeoutMs > 0 && Date.now() - startedAt >= timeoutMs) throw new ApiError('Task polling timed out', 'timeout');
}

function delay(ms: number, signal: AbortSignal | undefined, startedAt: number, timeoutMs = 0): Promise<void> {
  throwIfStopped(signal, startedAt, timeoutMs);
  const remaining = timeoutMs > 0 ? Math.max(0, timeoutMs - (Date.now() - startedAt)) : ms;
  const duration = Math.min(Math.max(0, ms), remaining || ms);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, duration);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new ApiError('Task polling aborted', 'aborted'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
