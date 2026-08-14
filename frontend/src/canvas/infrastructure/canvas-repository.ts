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
  createBackup(canvasId: string, options?: RequestOptions): Promise<Record<string, unknown>>;
  get(canvasId: string, options?: RequestOptions): Promise<CanvasDocument>;
  listBackups(canvasId: string, options?: RequestOptions): Promise<CanvasBackup[]>;
  restoreBackup(canvasId: string, filename: string, options?: RequestOptions): Promise<CanvasDocument>;
  save(canvasId: string, payload: CanvasSavePayload, options?: RequestOptions): Promise<CanvasDocument>;
}

export function createCanvasRepository(fetcher: Fetcher = fetch): CanvasRepository {
  const path = (canvasId: string) => `/api/canvases/${encodeURIComponent(canvasId)}`;

  const get: CanvasRepository['get'] = async (canvasId, options) => {
    const response = await requestJson<{ canvas: unknown }>(fetcher, path(canvasId), {}, options);
    return decodeCanvasDocument(response.canvas);
  };

  const save: CanvasRepository['save'] = async (canvasId, payload, options) => {
    try {
      const response = await requestJson<{ canvas: unknown }>(fetcher, path(canvasId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, options);
      return decodeCanvasDocument(response.canvas);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'conflict') throw error;
      const detail = conflictDetail(error.details);
      const serverCanvas = detail.canvas ? decodeCanvasDocument(detail.canvas) : null;
      throw new CanvasConflictError(error.message, serverCanvas, Number(detail.updated_at || 0), error.details);
    }
  };

  const createBackup: CanvasRepository['createBackup'] = (canvasId, options) => requestJson(
    fetcher,
    `${path(canvasId)}/backup`,
    { method: 'POST' },
    options,
  );

  const listBackups: CanvasRepository['listBackups'] = async (canvasId, options) => {
    const response = await requestJson<{ backups?: CanvasBackup[] }>(fetcher, `${path(canvasId)}/backups`, {}, options);
    return Array.isArray(response.backups) ? response.backups : [];
  };

  const restoreBackup: CanvasRepository['restoreBackup'] = async (canvasId, filename, options) => {
    const response = await requestJson<{ canvas: unknown }>(
      fetcher,
      `${path(canvasId)}/backups/${encodeURIComponent(filename)}/restore`,
      { method: 'POST' },
      options,
    );
    return decodeCanvasDocument(response.canvas);
  };

  return { createBackup, get, listBackups, restoreBackup, save };
}

export function canvasDocumentSavePayload(document: CanvasDocument): CanvasSavePayload {
  return encodeCanvasDocument(document) as CanvasSavePayload;
}

function conflictDetail(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const detail = (value as Record<string, unknown>).detail;
  return detail && typeof detail === 'object' ? detail as Record<string, unknown> : {};
}
