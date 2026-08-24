export type CanvasAssetKind = 'audio' | 'image' | 'video' | 'workflow';

export interface CanvasAssetItem {
  asset_uris?: Record<string, string>;
  id: string;
  kind: CanvasAssetKind;
  name: string;
  readonly?: boolean;
  registrations?: Record<string, { asset_uri?: string; detail?: string; status?: string }>;
  thumbnail?: string;
  url: string;
}

export interface CanvasAssetCategory {
  id: string;
  items: CanvasAssetItem[];
  name: string;
  readonly?: boolean;
  type: 'image' | 'workflow';
}

export interface CanvasAssetLibrary {
  categories: CanvasAssetCategory[];
  id: string;
  name: string;
  readonly?: boolean;
}

export interface CanvasAssetLibraryState {
  active_library_id: string;
  libraries: CanvasAssetLibrary[];
}

type AssetResponse = { category?: CanvasAssetCategory; item?: CanvasAssetItem; library: CanvasAssetLibraryState; removed?: number };
export interface CanvasWorkflowLibraryPayload {
  connections: unknown[];
  filename: string;
  name: string;
  nodes: unknown[];
}

export const canvasAssetLibraryClient = {
  list: () => request<AssetResponse>('/api/asset-library'),
  createLibrary: (name: string) => request<AssetResponse>('/api/asset-library/libraries', json('POST', { name })),
  renameLibrary: (id: string, name: string) => request<AssetResponse>(`/api/asset-library/libraries/${encodeURIComponent(id)}`, json('PATCH', { name })),
  deleteLibrary: (id: string) => request<AssetResponse>(`/api/asset-library/libraries/${encodeURIComponent(id)}`, json('DELETE')),
  createCategory: (libraryId: string, name: string, type: 'image' | 'workflow' = 'image') => request<AssetResponse>('/api/asset-library/categories', json('POST', { library_id: libraryId, name, type })),
  renameCategory: (libraryId: string, id: string, name: string) => request<AssetResponse>(`/api/asset-library/categories/${encodeURIComponent(id)}`, json('PATCH', { library_id: libraryId, name })),
  deleteCategory: (libraryId: string, id: string) => request<AssetResponse>(`/api/asset-library/categories/${encodeURIComponent(id)}?library_id=${encodeURIComponent(libraryId)}`, json('DELETE')),
  addUrl: (libraryId: string, categoryId: string, url: string, name: string) => request<AssetResponse>('/api/asset-library/items', json('POST', { category_id: categoryId, library_id: libraryId, name, url })),
  addBatch: (libraryId: string, categoryId: string, items: Array<{ name: string; url: string }>) => request<AssetResponse>('/api/asset-library/items/batch', json('POST', { category_id: categoryId, items: items.map((item) => ({ ...item, category_id: categoryId, library_id: libraryId })), library_id: libraryId })),
  upload: async (files: File[]) => {
    const body = new FormData();
    files.forEach((file) => body.append('files', file, file.name || 'media'));
    return request<{ files?: Array<{ kind?: string; name?: string; url?: string }> }>('/api/ai/upload', { method: 'POST', body });
  },
  renameItem: (id: string, name: string) => request<AssetResponse>(`/api/asset-library/items/${encodeURIComponent(id)}`, json('PATCH', { name })),
  deleteItem: (libraryId: string, id: string) => request<AssetResponse>('/api/asset-library/items/delete', json('POST', { ids: [id], library_id: libraryId })),
  saveWorkflow: (libraryId: string, categoryId: string, workflow: CanvasWorkflowLibraryPayload) => request<AssetResponse>('/api/canvas-workflows/export-to-library', json('POST', {
    ...workflow, category_id: categoryId, include_resources: true, library_id: libraryId,
  })),
};

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => ({})) as T & { detail?: string | { message?: string } };
  if (!response.ok) {
    const detail = payload.detail;
    throw new Error(typeof detail === 'string' ? detail : detail?.message || `请求失败 (${response.status})`);
  }
  return payload;
}

function json(method: string, body?: unknown): RequestInit {
  return { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) };
}
