export type ApiErrorCode =
  | 'aborted'
  | 'conflict'
  | 'network'
  | 'not-found'
  | 'server'
  | 'task-failed'
  | 'timeout'
  | 'unknown'
  | 'validation';

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode,
    readonly status = 0,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get retryable(): boolean {
    return this.code === 'network' || this.code === 'server' || this.code === 'timeout';
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function requestJson<T>(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const { signal, timeoutMs = 30_000 } = options;
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs) : undefined;

  try {
    const response = await fetcher(input, { ...init, signal: controller.signal });
    const body = await responseBody(response);
    if (!response.ok) {
      throw new ApiError(errorMessage(body, response.statusText), errorCode(response.status), response.status, body);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError('Request timed out', 'timeout');
    if (signal?.aborted || controller.signal.aborted) throw new ApiError('Request aborted', 'aborted');
    throw new ApiError(error instanceof Error ? error.message : String(error), 'network');
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorCode(status: number): ApiErrorCode {
  if (status === 409) return 'conflict';
  if (status === 404) return 'not-found';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body || fallback;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const detail = record.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && typeof (detail as Record<string, unknown>).message === 'string') {
      return (detail as Record<string, unknown>).message as string;
    }
    for (const key of ['message', 'error']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
  }
  return fallback || 'Request failed';
}
