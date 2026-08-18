import { ApiError, requestJson, type Fetcher } from './http';

export interface CanvasSummary extends Record<string, unknown> {
  deleted_at?: number;
  folder_id?: string;
  id: string;
  kind?: 'classic' | 'smart';
  title?: string;
  updated_at?: number;
}

export interface CanvasCreateOptions {
  folderId?: string;
  icon?: string;
  kind?: 'classic' | 'smart';
}

export interface CanvasFolder extends Record<string, unknown> {
  id: string;
  name?: string;
  parent_id?: string;
}

export interface CanvasLockResult extends Record<string, unknown> {
  holder?: Record<string, unknown>;
  ok: boolean;
}

export interface CanvasMeta extends Record<string, unknown> {
  id: string;
  updated_at: number;
}

export interface CanvasManagementClient {
  acquireLock(canvasId: string, clientId: string, username?: string): Promise<CanvasLockResult>;
  create(title?: string, options?: CanvasCreateOptions): Promise<CanvasSummary>;
  createFolder(name: string, parentId?: string): Promise<CanvasFolder>;
  delete(canvasId: string): Promise<void>;
  deleteBackup(canvasId: string, filename: string): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  getMeta(canvasId: string): Promise<CanvasMeta>;
  list(): Promise<CanvasSummary[]>;
  listFolders(): Promise<CanvasFolder[]>;
  listTrash(): Promise<CanvasSummary[]>;
  moveToFolder(canvasId: string, folderId: string): Promise<void>;
  purge(canvasId: string): Promise<void>;
  releaseLock(canvasId: string, clientId: string, keepalive?: boolean): Promise<void>;
  restore(canvasId: string): Promise<void>;
  updateFolder(folderId: string, patch: Record<string, unknown>): Promise<CanvasFolder>;
}

export function createCanvasManagementClient(fetcher: Fetcher = fetch): CanvasManagementClient {
  const list = async () => listFrom(await requestJson<unknown>(fetcher, '/api/canvases'));
  const listTrash = async () => listFrom(await requestJson<unknown>(fetcher, '/api/canvases/trash'));
  const listFolders = async () => {
    const payload = await requestJson<unknown>(fetcher, '/api/canvas-folders');
    const record = object(payload);
    const values = Array.isArray(payload) ? payload : record.folders;
    return (Array.isArray(values) ? values : []).map(object).filter((item) => item.id).map((item) => item as CanvasFolder);
  };
  const create = async (title = '', options: CanvasCreateOptions = {}) => {
    const payload = await jsonRequest<unknown>(fetcher, '/api/canvases', 'POST', {
      title: title.trim() || undefined,
      folder_id: options.folderId || undefined,
      icon: options.icon || undefined,
      kind: options.kind || undefined,
    });
    return (object(payload).canvas ? object(object(payload).canvas) : object(payload)) as CanvasSummary;
  };
  const createFolder = async (name: string, parentId = '') => object(await jsonRequest(fetcher, '/api/canvas-folders', 'POST', { name, parent_id: parentId })) as CanvasFolder;
  const updateFolder = async (folderId: string, patch: Record<string, unknown>) => object(await jsonRequest(fetcher, `/api/canvas-folders/${encodeURIComponent(folderId)}`, 'PATCH', patch)) as CanvasFolder;
  const deleteFolder = (folderId: string) => emptyRequest(fetcher, `/api/canvas-folders/${encodeURIComponent(folderId)}`, 'DELETE');
  const remove = (canvasId: string) => emptyRequest(fetcher, `/api/canvases/${encodeURIComponent(canvasId)}`, 'DELETE');
  const restore = (canvasId: string) => emptyRequest(fetcher, `/api/canvases/${encodeURIComponent(canvasId)}/restore`, 'POST');
  const purge = (canvasId: string) => emptyRequest(fetcher, `/api/canvases/${encodeURIComponent(canvasId)}/purge`, 'DELETE');
  const moveToFolder = (canvasId: string, folderId: string) => jsonRequest(fetcher, `/api/canvases/${encodeURIComponent(canvasId)}/folder`, 'PATCH', { folder_id: folderId }).then(() => undefined);
  const deleteBackup = (canvasId: string, filename: string) => emptyRequest(fetcher, `/api/canvases/${encodeURIComponent(canvasId)}/backups/${encodeURIComponent(filename)}`, 'DELETE');
  const getMeta = async (canvasId: string) => object(await requestJson(fetcher, `/api/canvases/${encodeURIComponent(canvasId)}/meta`)) as CanvasMeta;
  const acquireLock = async (canvasId: string, clientId: string, username = '') => {
    try {
      return await jsonRequest<CanvasLockResult>(fetcher, `/api/canvases/${encodeURIComponent(canvasId)}/lock`, 'POST', { client_id: clientId, username });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      const details = object(error.details);
      const detail = object(details.detail);
      return { ok: false, holder: object(detail.holder || details.holder) };
    }
  };
  const releaseLock = async (canvasId: string, clientId: string, keepalive = false) => {
    if (keepalive) {
      await jsonRequest(fetcher, `/api/canvases/${encodeURIComponent(canvasId)}/lock/release`, 'POST', { client_id: clientId }, true);
      return;
    }
    await emptyRequest(fetcher, `/api/canvases/${encodeURIComponent(canvasId)}/lock?client_id=${encodeURIComponent(clientId)}`, 'DELETE');
  };
  return { acquireLock, create, createFolder, delete: remove, deleteBackup, deleteFolder, getMeta, list, listFolders, listTrash, moveToFolder, purge, releaseLock, restore, updateFolder };
}

function listFrom(payload: unknown): CanvasSummary[] {
  const record = object(payload);
  const values = Array.isArray(payload) ? payload : record.canvases;
  return (Array.isArray(values) ? values : []).map(object).filter((item) => item.id).map((item) => item as CanvasSummary);
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function jsonRequest<T>(fetcher: Fetcher, path: string, method: string, payload: unknown, keepalive = false): Promise<T> {
  return requestJson(fetcher, path, { method, keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload ?? {}) });
}

async function emptyRequest(fetcher: Fetcher, path: string, method: string): Promise<void> {
  await requestJson(fetcher, path, { method });
}
