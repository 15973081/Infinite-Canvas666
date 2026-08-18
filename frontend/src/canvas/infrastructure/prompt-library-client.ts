export interface PromptCategory { id: string; name: string }
export interface PromptItem { category: string; created_at?: number; id: string; name: string; negative: string; positive: string; scene: string }
export interface PromptLibrary { categories: PromptCategory[]; id: string; items: PromptItem[]; name: string; readonly?: boolean; system?: boolean }
export interface PromptLibraryState { active_library_id: string; libraries: PromptLibrary[] }

type PromptResponse = { item?: PromptItem; library: PromptLibraryState; removed?: number };

export const promptLibraryClient = {
  list: () => request<PromptResponse>('/api/prompt-libraries'),
  createLibrary: (name: string) => request<PromptResponse>('/api/prompt-libraries', json('POST', { name })),
  renameLibrary: (id: string, name: string) => request<PromptResponse>(`/api/prompt-libraries/${encodeURIComponent(id)}`, json('PATCH', { name })),
  deleteLibrary: (id: string) => request<PromptResponse>(`/api/prompt-libraries/${encodeURIComponent(id)}`, json('DELETE')),
  savePrompt: (libraryId: string, item: Omit<PromptItem, 'id'> & { id?: string }) => request<PromptResponse>(item.id
    ? `/api/prompt-libraries/items/${encodeURIComponent(item.id)}`
    : '/api/prompt-libraries/items', json(item.id ? 'PATCH' : 'POST', { library_id: libraryId, ...item })),
  deletePrompts: (ids: string[]) => request<PromptResponse>('/api/prompt-libraries/items/delete', json('POST', { ids })),
  createCategory: (libraryId: string, name: string) => request<PromptResponse>('/api/prompt-libraries/categories', json('POST', { library_id: libraryId, name })),
};

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => ({})) as T & { detail?: string };
  if (!response.ok) throw new Error(payload.detail || `请求失败 (${response.status})`);
  return payload;
}

function json(method: string, body?: unknown): RequestInit {
  return { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) };
}
