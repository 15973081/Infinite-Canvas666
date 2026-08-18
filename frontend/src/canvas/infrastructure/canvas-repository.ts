import { decodeCanvasDocument, encodeCanvasDocument } from '../domain/document-codec';
import type { CanvasDocument } from '../domain/types';
import { ApiError, requestJson, type Fetcher, type RequestOptions } from './http';

export interface CanvasSavePayload extends Record<string, unknown> {
  base_updated_at?: number;
  client_id?: string;
  connections: unknown[];
  nodes: unknown[];
}

export interface CanvasBackup {
  filename: string;
  [key: string]: unknown;
}

export interface CanvasRepositoryDiagnostics {
  audits: number;
  backupsCreated: number;
  backupsListed: number;
  backupsRestored: number;
  conflicts: number;
  errors: number;
  loads: number;
  saves: number;
}

export interface CanvasAuditOptions {
  includeDeleted?: boolean;
  includeDetails?: boolean;
  maxFiles?: number;
}

export interface CanvasAuditReport extends Record<string, unknown> {
  summary: {
    compatible: number;
    errors: number;
    files: number;
    incompatible: number;
    warnings: number;
    [key: string]: unknown;
  };
}

type CanvasRepositorySuccessCounter = Exclude<keyof CanvasRepositoryDiagnostics, 'conflicts' | 'errors'>;

export class CanvasConflictError extends ApiError {
  constructor(
    message: string,
    readonly serverCanvas: CanvasDocument | null,
    readonly updatedAt: number,
    details: unknown,
  ) {
    super(message, 'conflict', 409, details);
    this.name = 'CanvasConflictError';
  }
}

export interface CanvasRepository {
  audit(options?: CanvasAuditOptions, requestOptions?: RequestOptions): Promise<CanvasAuditReport>;
  createBackup(canvasId: string, options?: RequestOptions): Promise<Record<string, unknown>>;
  get(canvasId: string, options?: RequestOptions): Promise<CanvasDocument>;
  getDiagnostics(): CanvasRepositoryDiagnostics;
  listBackups(canvasId: string, options?: RequestOptions): Promise<CanvasBackup[]>;
  restoreBackup(canvasId: string, filename: string, options?: RequestOptions): Promise<CanvasDocument>;
  save(canvasId: string, payload: CanvasSavePayload, options?: RequestOptions): Promise<CanvasDocument>;
}

export function createCanvasRepository(fetcher: Fetcher = fetch): CanvasRepository {
  const path = (canvasId: string) => `/api/canvases/${encodeURIComponent(canvasId)}`;
  const diagnostics: CanvasRepositoryDiagnostics = {
    audits: 0,
    backupsCreated: 0,
    backupsListed: 0,
    backupsRestored: 0,
    conflicts: 0,
    errors: 0,
    loads: 0,
    saves: 0,
  };
  const request = async <T>(counter: CanvasRepositorySuccessCounter, ...args: Parameters<typeof requestJson<T>>) => {
    try {
      const response = await requestJson<T>(...args);
      diagnostics[counter] += 1;
      return response;
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'conflict') diagnostics.errors += 1;
      throw error;
    }
  };

  const get: CanvasRepository['get'] = async (canvasId, options) => {
    const response = await request<{ canvas: unknown }>('loads', fetcher, path(canvasId), {}, options);
    return decodeCanvasDocument(response.canvas);
  };

  const audit: CanvasRepository['audit'] = (options = {}, requestOptions) => {
    const query = new URLSearchParams({
      include_deleted: String(Boolean(options.includeDeleted)),
      include_details: String(options.includeDetails !== false),
      max_files: String(Math.max(1, Math.min(20_000, Number(options.maxFiles || 5000)))),
    });
    return request('audits', fetcher, `/api/canvas-audit?${query}`, {}, requestOptions);
  };

  const save: CanvasRepository['save'] = async (canvasId, payload, options) => {
    try {
      const response = await request<{ canvas: unknown }>('saves', fetcher, path(canvasId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, options);
      return decodeCanvasDocument(response.canvas);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'conflict') throw error;
      diagnostics.conflicts += 1;
      const detail = conflictDetail(error.details);
      const serverCanvas = detail.canvas ? decodeCanvasDocument(detail.canvas) : null;
      throw new CanvasConflictError(error.message, serverCanvas, Number(detail.updated_at || 0), error.details);
    }
  };

  const createBackup: CanvasRepository['createBackup'] = (canvasId, options) => request(
    'backupsCreated',
    fetcher,
    `${path(canvasId)}/backup`,
    { method: 'POST' },
    options,
  );

  const listBackups: CanvasRepository['listBackups'] = async (canvasId, options) => {
    const response = await request<{ backups?: CanvasBackup[] }>(
      'backupsListed', fetcher, `${path(canvasId)}/backups`, {}, options,
    );
    return Array.isArray(response.backups) ? response.backups : [];
  };

  const restoreBackup: CanvasRepository['restoreBackup'] = async (canvasId, filename, options) => {
    const response = await request<{ canvas: unknown }>(
      'backupsRestored',
      fetcher,
      `${path(canvasId)}/backups/${encodeURIComponent(filename)}/restore`,
      { method: 'POST' },
      options,
    );
    return decodeCanvasDocument(response.canvas);
  };

  const getDiagnostics = (): CanvasRepositoryDiagnostics => ({ ...diagnostics });

  return { audit, createBackup, get, getDiagnostics, listBackups, restoreBackup, save };
}

export function canvasDocumentSavePayload(document: CanvasDocument): CanvasSavePayload {
  return {
    ...encodeCanvasDocument(document),
    base_updated_at: Number(document.updated_at || 0),
  } as CanvasSavePayload;
}

function conflictDetail(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const detail = (value as Record<string, unknown>).detail;
  return detail && typeof detail === 'object' ? detail as Record<string, unknown> : {};
}
