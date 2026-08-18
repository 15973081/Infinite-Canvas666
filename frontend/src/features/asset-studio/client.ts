import { jsonRequest, requestJson } from '../../shared/http';
import type { AssetLibraryState, CanvasAssetState, FolderNode, MediaItem, PromptItem, PromptLibraryState, SharedFolder } from './types';

type LibraryResponse = { library: AssetLibraryState };
type PromptResponse = { library: PromptLibraryState };

export const assetClient = {
  assets: () => requestJson<LibraryResponse>('/api/asset-library'),
  createLibrary: (name: string) => requestJson<LibraryResponse>('/api/asset-library/libraries', jsonRequest('POST', { name })),
  renameLibrary: (id: string, name: string) => requestJson<LibraryResponse>(`/api/asset-library/libraries/${encodeURIComponent(id)}`, jsonRequest('PATCH', { name })),
  deleteLibrary: (id: string) => requestJson<LibraryResponse>(`/api/asset-library/libraries/${encodeURIComponent(id)}`, jsonRequest('DELETE')),
  createCategory: (library_id: string, name: string, type: 'image' | 'workflow') => requestJson<LibraryResponse>('/api/asset-library/categories', jsonRequest('POST', { library_id, name, type })),
  renameCategory: (library_id: string, id: string, name: string) => requestJson<LibraryResponse>(`/api/asset-library/categories/${encodeURIComponent(id)}`, jsonRequest('PATCH', { library_id, name })),
  deleteCategory: (library_id: string, id: string) => requestJson<LibraryResponse>(`/api/asset-library/categories/${encodeURIComponent(id)}?library_id=${encodeURIComponent(library_id)}`, jsonRequest('DELETE')),
  addUrl: (library_id: string, category_id: string, url: string, name: string) => requestJson<LibraryResponse>('/api/asset-library/items', jsonRequest('POST', { library_id, category_id, url, name })),
  renameItem: (id: string, name: string) => requestJson<LibraryResponse>(`/api/asset-library/items/${encodeURIComponent(id)}`, jsonRequest('PATCH', { name })),
  deleteItems: (library_id: string, ids: string[]) => requestJson<LibraryResponse>('/api/asset-library/items/delete', jsonRequest('POST', { library_id, ids })),
  moveItems: (library_id: string, ids: string[], target_library_id: string, target_category_id: string) => requestJson<LibraryResponse>('/api/asset-library/items/move', jsonRequest('POST', { library_id, ids, target_library_id, target_category_id })),
  uploadWorkflows: async (libraryId: string, categoryId: string, files: FileList) => { const body = new FormData(); body.set('library_id', libraryId); body.set('category_id', categoryId); Array.from(files).forEach(file => body.append('files', file)); return requestJson<LibraryResponse>('/api/asset-library/workflows/upload', { method: 'POST', body }); },
  prompts: () => requestJson<PromptResponse>('/api/prompt-libraries'),
  createPromptLibrary: (name: string) => requestJson<PromptResponse>('/api/prompt-libraries', jsonRequest('POST', { name })),
  renamePromptLibrary: (id: string, name: string) => requestJson<PromptResponse>(`/api/prompt-libraries/${encodeURIComponent(id)}`, jsonRequest('PATCH', { name })),
  deletePromptLibrary: (id: string) => requestJson<PromptResponse>(`/api/prompt-libraries/${encodeURIComponent(id)}`, jsonRequest('DELETE')),
  savePrompt: (library_id: string, item: Omit<PromptItem, 'id'> & { id?: string }) => requestJson<PromptResponse>(item.id ? `/api/prompt-libraries/items/${encodeURIComponent(item.id)}` : '/api/prompt-libraries/items', jsonRequest(item.id ? 'PATCH' : 'POST', { library_id, ...item })),
  deletePrompts: (ids: string[]) => requestJson<PromptResponse>('/api/prompt-libraries/items/delete', jsonRequest('POST', { ids })),
  createPromptCategory: (library_id: string, name: string) => requestJson<PromptResponse>('/api/prompt-libraries/categories', jsonRequest('POST', { library_id, name })),
  local: () => requestJson<{ items: MediaItem[]; tree: FolderNode }>('/api/local-assets'),
  uploadLocal: async (folder: string, files: FileList) => { const body = new FormData(); body.set('folder', folder); Array.from(files).forEach(file => body.append('files', file)); return requestJson<{ files: MediaItem[] }>('/api/local-assets/upload', { method: 'POST', body }); },
  deleteLocal: (names: string[]) => requestJson<{ deleted: string[] }>('/api/local-assets/delete', jsonRequest('POST', { names })),
  createLocalFolder: (parent: string, name: string) => requestJson<{ items: MediaItem[]; tree: FolderNode }>('/api/local-assets/folders', jsonRequest('POST', { parent, name })),
  saveCaption: (name: string, caption: string) => requestJson<{ caption: string }>('/api/local-assets/caption', jsonRequest('PATCH', { name, caption })),
  shared: () => requestJson<{ folders: SharedFolder[] }>('/api/shared-folders'),
  registerShared: (path: string, name: string) => requestJson<{ folder: SharedFolder }>('/api/shared-folders', jsonRequest('POST', { path, name })),
  removeShared: (id: string) => requestJson<{ ok: boolean }>(`/api/shared-folders/${encodeURIComponent(id)}`, jsonRequest('DELETE')),
  sharedTree: (id: string) => requestJson<{ tree: FolderNode }>(`/api/shared-folders/${encodeURIComponent(id)}/tree`),
  importShared: (library_id: string, category_id: string, folder_id: string, paths: string[]) => requestJson<LibraryResponse>('/api/shared-folders/import', jsonRequest('POST', { library_id, category_id, folder_id, paths })),
  canvas: () => requestJson<CanvasAssetState>('/api/canvas-assets'),
  downloadCanvas: async (items: MediaItem[]) => { const response = await fetch('/api/canvas-assets/download', jsonRequest('POST', { items: items.map(item => ({ url: item.url, name: item.name })) })); if (!response.ok) throw new Error('下载失败'); const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'canvas-assets.zip'; anchor.click(); URL.revokeObjectURL(url); },
};

