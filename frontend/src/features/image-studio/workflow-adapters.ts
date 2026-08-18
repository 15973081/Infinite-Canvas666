import { jsonRequest, requestJson } from '../../shared/http';
import { normalizeImageResult, outputSize } from './domain';
import { uploadWorkflowBlob, uploadWorkflowReference } from './client';
import type { ImageStudioAdapter, StudioGenerateInput, StudioImageItem, StudioReference } from './types';

const clientId = () => crypto.randomUUID();
const referenceSource = (reference: StudioReference) => reference.data_url || reference.url || '';
const originalSource = (input: StudioGenerateInput) => referenceSource(input.references[0]);
const savedMode = (id: string) => typeof localStorage !== 'undefined' && localStorage.getItem(`${id}_engine`) === 'cloud' ? 'cloud' : 'local';

async function modelscopeToken(): Promise<string> {
  return (await requestJson<{ token?: string }>('/api/config/token')).token || '';
}

function withOriginal(result: unknown, input: StudioGenerateInput, type: string): StudioImageItem {
  return { ...normalizeImageResult(result, input.prompt, type), original_url: originalSource(input) };
}

export function anglePrompt(base: string, horizontal: number, vertical: number, distance: number): string {
  const parts: string[] = [];
  if (horizontal) parts.push(`将相机向${horizontal > 0 ? '右' : '左'}旋转${Math.abs(horizontal)}度`);
  if (vertical) parts.push(`${vertical > 0 ? '俯视' : '仰视'}${Math.abs(vertical)}度`);
  if (distance > 4) parts.push('使用广角镜头并拉远画面');
  if (distance < 4) parts.push('使用特写镜头并靠近主体');
  return [base.trim(), parts.join('，')].filter(Boolean).join('\n');
}

async function generateEnhance(input: StudioGenerateInput, onStatus: (status: string) => void): Promise<StudioImageItem> {
  const reference = input.references[0];
  if (input.mode === 'cloud') {
    onStatus('ModelScope 增强处理中…');
    const result = await requestJson<unknown>('/api/ms/generate', jsonRequest('POST', {
      prompt: input.prompt, api_key: await modelscopeToken(), model: 'black-forest-labs/FLUX.2-klein-9B',
      image_urls: [referenceSource(reference)], width: input.width, height: input.height,
      loras: { 'Daniel8152/Klein-enhance': Number(input.extras.strength ?? 0.8) }, client_id: clientId(),
    }));
    return withOriginal(result, input, 'enhance');
  }
  if (!reference.comfy_name) throw new Error('本地增强需要可用的 ComfyUI 后端，请重新上传图片');
  onStatus('第一阶段：细节增强…');
  let result = await requestJson<unknown>('/api/generate', jsonRequest('POST', {
    workflow_json: 'Z-Image-Enhance.json', params: { '15': { image: reference.comfy_name }, '204': { value: Number(input.extras.strength ?? 0.5) } },
    type: 'enhance', client_id: clientId(),
  }));
  if (input.extras.upscale === true) {
    const first = normalizeImageResult(result, input.prompt, 'enhance');
    onStatus('第二阶段：上传增强结果…');
    const response = await fetch(first.images[0]); if (!response.ok) throw new Error('无法读取第一阶段增强结果');
    const uploaded = await uploadWorkflowBlob(await response.blob(), 'enhance-upscale-input.png');
    onStatus('第二阶段：高分辨率放大…');
    result = await requestJson<unknown>('/api/generate', jsonRequest('POST', {
      workflow_json: 'upscale.json', params: { '15': { image: uploaded }, '172': { seed: Math.floor(Math.random() * 4_294_967_295), resolution: Number(input.extras.upscaleFactor ?? 2048) } },
      type: 'enhance', client_id: clientId(),
    }));
  }
  return withOriginal(result, input, 'enhance');
}

async function generateKlein(input: StudioGenerateInput, onStatus: (status: string) => void): Promise<StudioImageItem> {
  if (input.mode === 'cloud') {
    onStatus('FLUX.2 Klein 云端生成中…');
    const loras = input.extras.lora === true ? { 'Daniel8152/Klein-enhance': Number(input.extras.loraStrength ?? 0.8) } : undefined;
    const result = await requestJson<unknown>('/api/ms/generate', jsonRequest('POST', {
      prompt: input.prompt, api_key: await modelscopeToken(), model: 'black-forest-labs/FLUX.2-klein-9B',
      image_urls: input.references.map(referenceSource).filter(Boolean), width: input.width, height: input.height, loras, client_id: clientId(),
    }));
    return withOriginal(result, input, 'klein');
  }
  const [main, second, third] = input.references;
  if (!main?.comfy_name) throw new Error('本地 Klein 需要可用的 ComfyUI 后端，请重新上传主图');
  onStatus('Klein 本地工作流运行中…');
  const result = await requestJson<unknown>('/api/generate', jsonRequest('POST', {
    prompt: input.prompt, workflow_json: 'Flux2-Klein.json', type: 'klein', client_id: clientId(), params: {
      '168': { text: input.prompt }, '158': { noise_seed: Math.floor(Math.random() * 1_000_000) },
      '278': { image: main.comfy_name }, '270': { image: second?.comfy_name || '' }, '292': { image: third?.comfy_name || '' },
      '313': { value: Boolean(second?.comfy_name) }, '314': { value: Boolean(third?.comfy_name) },
    },
  }));
  return withOriginal(result, input, 'klein');
}

async function pollAngle(taskId: string, prompt: string, original: string, onStatus: (status: string) => void): Promise<StudioImageItem> {
  onStatus('继续等待 ModelScope 视角任务…');
  const result = await requestJson<Record<string, unknown>>('/api/angle/poll_status', jsonRequest('POST', { task_id: taskId, api_key: await modelscopeToken(), client_id: clientId() }));
  if (result.status === 'timeout' && result.task_id) return pollAngle(String(result.task_id), prompt, original, onStatus);
  sessionStorage.removeItem('angle-image-pending');
  return { ...normalizeImageResult(result, prompt, 'angle'), original_url: original };
}

async function generateAngle(input: StudioGenerateInput, onStatus: (status: string) => void): Promise<StudioImageItem> {
  const prompt = anglePrompt(input.prompt, Number(input.extras.horizontal || 0), Number(input.extras.vertical || 0), Number(input.extras.distance || 4));
  const original = originalSource(input);
  if (input.mode === 'cloud') {
    onStatus('Qwen 视角编辑云端运行中…');
    const result = await requestJson<Record<string, unknown>>('/api/angle/generate', jsonRequest('POST', {
      prompt, api_key: await modelscopeToken(), type: 'angle', model: 'Qwen/Qwen-Image-Edit-2511', image_urls: [original], resolution: outputSize(input.width, input.height), client_id: clientId(),
    }));
    if (result.status === 'timeout' && result.task_id) {
      sessionStorage.setItem('angle-image-pending', JSON.stringify({ taskId: result.task_id, prompt, original }));
      return pollAngle(String(result.task_id), prompt, original, onStatus);
    }
    return { ...normalizeImageResult(result, prompt, 'angle'), original_url: original };
  }
  const reference = input.references[0];
  if (!reference.comfy_name) throw new Error('本地视角编辑需要可用的 ComfyUI 后端，请重新上传图片');
  onStatus('本地视角工作流运行中…');
  const result = await requestJson<unknown>('/api/generate', jsonRequest('POST', {
    workflow_json: '2511.json', params: { '31': { image: reference.comfy_name }, '11': { prompt }, '14': { seed: Math.floor(Math.random() * 1_000_000_000_000_000) } },
    type: 'angle', client_id: clientId(),
  }));
  return { ...normalizeImageResult(result, prompt, 'angle'), original_url: original };
}

async function resumeAngle(onStatus: (status: string) => void): Promise<StudioImageItem | null> {
  const raw = sessionStorage.getItem('angle-image-pending'); if (!raw) return null;
  try { const value = JSON.parse(raw) as { taskId?: string; prompt?: string; original?: string }; return value.taskId ? pollAngle(value.taskId, value.prompt || '', value.original || '', onStatus) : null; }
  catch { sessionStorage.removeItem('angle-image-pending'); return null; }
}

const common = { supportsProviders: false, supportsQuality: false, supportsCount: false, uploadReference: uploadWorkflowReference };

export const enhanceAdapter: ImageStudioAdapter = {
  ...common, id: 'enhance', title: 'AI 图片增强', subtitle: '共享图片工作台驱动本地两阶段增强与 ModelScope 云端增强。', historyType: 'enhance', maxReferences: 1, minReferences: 1,
  modes: [{ id: 'local', label: '本地 ComfyUI' }, { id: 'cloud', label: 'ModelScope 云端' }], defaultMode: savedMode('enhance'),
  fields: [
    { id: 'strength', label: '增强强度', type: 'range', default: 0.8, min: 0.1, max: 1, step: 0.05 },
    { id: 'upscale', label: '增强后继续放大', type: 'toggle', default: false, modes: ['local'] },
    { id: 'upscaleFactor', label: '放大目标', type: 'select', default: '2048', modes: ['local'], options: [{ value: '2048', label: '2K' }, { value: '4096', label: '4K' }] },
  ], generate: generateEnhance,
};

export const kleinAdapter: ImageStudioAdapter = {
  ...common, id: 'klein', title: 'FLUX.2 Klein', subtitle: '最多三张参考图，本地工作流和 ModelScope 云端共用一套输入与历史。', historyType: 'klein', maxReferences: 3, minReferences: 1,
  modes: [{ id: 'local', label: '本地 ComfyUI' }, { id: 'cloud', label: 'ModelScope 云端' }], defaultMode: savedMode('klein'),
  fields: [
    { id: 'lora', label: '启用增强 LoRA', type: 'toggle', default: false, modes: ['cloud'] },
    { id: 'loraStrength', label: 'LoRA 强度', type: 'range', default: 0.8, min: 0.1, max: 1, step: 0.05, modes: ['cloud'] },
  ], generate: generateKlein,
};

export const angleAdapter: ImageStudioAdapter = {
  ...common, id: 'angle', title: 'AI 视角控制', subtitle: '使用水平、垂直和景别参数驱动本地或云端图片视角编辑。', historyType: 'angle', maxReferences: 1, minReferences: 1,
  modes: [{ id: 'local', label: '本地 ComfyUI' }, { id: 'cloud', label: 'ModelScope 云端' }], defaultMode: savedMode('angle'), resume: resumeAngle,
  fields: [
    { id: 'horizontal', label: '水平旋转', type: 'range', default: 0, min: -180, max: 180, step: 5 },
    { id: 'vertical', label: '垂直角度', type: 'range', default: 0, min: -90, max: 90, step: 5 },
    { id: 'distance', label: '镜头距离', type: 'range', default: 4, min: 1, max: 10, step: 0.5 },
  ], generate: generateAngle,
};
