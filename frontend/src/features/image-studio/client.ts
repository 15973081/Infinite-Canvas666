import { jsonRequest, requestJson } from '../../shared/http';
import { normalizeImageResult, normalizeProviders, outputSize } from './domain';
import type { StudioGenerateInput, StudioImageItem, StudioProvider, StudioReference } from './types';

export async function loadProviders(): Promise<StudioProvider[]> {
  return normalizeProviders(await requestJson<Record<string, unknown>>('/api/config'));
}

export async function loadHistory(type: string): Promise<StudioImageItem[]> {
  const data = await requestJson<unknown>(`/api/history?type=${encodeURIComponent(type)}`);
  return Array.isArray(data) ? data.filter((item): item is StudioImageItem => Boolean(item && typeof item === 'object' && Array.isArray((item as StudioImageItem).images))) : [];
}

export async function deleteHistory(timestamp: string | number): Promise<void> {
  const result = await requestJson<{ success?: boolean; message?: string }>('/api/history/delete', jsonRequest('POST', { timestamp }));
  if (!result.success) throw new Error(result.message || '删除历史记录失败');
}

export async function uploadReference(file: File): Promise<StudioReference> {
  const form = new FormData(); form.append('files', file);
  const result = await requestJson<{ files?: StudioReference[] }>('/api/ai/upload', { method: 'POST', body: form });
  const uploaded = result.files?.[0];
  if (!uploaded) throw new Error('上传没有返回文件');
  return uploaded;
}

export async function generateOnline(input: StudioGenerateInput, onStatus: (status: string) => void): Promise<StudioImageItem> {
  const body = {
    prompt: input.prompt, provider_id: input.providerId, model: input.model, size: outputSize(input.width, input.height),
    quality: input.quality, n: input.count, reference_images: input.references,
    idempotency_key: `online:${Date.now()}:${Math.random().toString(16).slice(2)}`,
  };
  const created = await requestJson<{ task_id?: string }>('/api/canvas-image-tasks', jsonRequest('POST', body));
  if (!created.task_id) throw new Error('创建生图任务失败');
  sessionStorage.setItem('online-image-pending', JSON.stringify({ taskId: created.task_id, prompt: input.prompt }));
  return pollOnlineImage(created.task_id, input.prompt, onStatus);
}

async function pollOnlineImage(taskId: string, prompt: string, onStatus: (status: string) => void): Promise<StudioImageItem> {
  for (let attempt = 0; attempt < 900; attempt += 1) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 2_000));
    const task = await requestJson<{ status?: string; result?: unknown; error?: string }>(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`);
    onStatus(task.status === 'queued' ? '任务排队中…' : '图片生成中…');
    if (task.status === 'succeeded') { sessionStorage.removeItem('online-image-pending'); return normalizeImageResult(task.result, prompt, 'online'); }
    if (task.status === 'failed' || task.status === 'interrupted') { sessionStorage.removeItem('online-image-pending'); throw new Error(task.error || '生成任务失败'); }
  }
  throw new Error('生成任务超时');
}

export async function resumeOnline(onStatus: (status: string) => void): Promise<StudioImageItem | null> {
  const raw = sessionStorage.getItem('online-image-pending');
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as { taskId?: string; prompt?: string };
    if (!pending.taskId) { sessionStorage.removeItem('online-image-pending'); return null; }
    onStatus('正在恢复未完成任务…');
    return await pollOnlineImage(pending.taskId, pending.prompt || '', onStatus);
  } catch (error) {
    if (error instanceof SyntaxError) sessionStorage.removeItem('online-image-pending');
    throw error;
  }
}

export async function generateZImage(input: StudioGenerateInput, _onStatus: (status: string) => void): Promise<StudioImageItem> {
  if (input.mode === 'cloud') {
    const token = await requestJson<{ token?: string }>('/api/config/token');
    if (!token.token) throw new Error('请先在 API 设置中配置 ModelScope Token');
    const result = await requestJson<unknown>('/generate', jsonRequest('POST', { prompt: input.prompt, api_key: token.token, resolution: outputSize(input.width, input.height) }));
    return normalizeImageResult(result, input.prompt, 'zimage');
  }
  const result = await requestJson<unknown>('/api/generate', jsonRequest('POST', {
    prompt: input.prompt, width: input.width, height: input.height, type: 'zimage', client_id: crypto.randomUUID(),
  }));
  return normalizeImageResult(result, input.prompt, 'zimage');
}
