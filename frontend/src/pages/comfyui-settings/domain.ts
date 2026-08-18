import type { FieldType, RunAsset, WorkflowField, WorkflowGraph } from './types';

export const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: '单行文本' }, { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' }, { value: 'slider', label: '滑块' },
  { value: 'boolean', label: '开关' }, { value: 'dropdown', label: '下拉选项' },
  { value: 'image', label: '图片' }, { value: 'video', label: '视频' }, { value: 'audio', label: '音频' },
];

export function isWorkflowLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number';
}

export function configurableInputs(graph: WorkflowGraph, nodeId: string): Array<[string, unknown]> {
  return Object.entries(graph[nodeId]?.inputs ?? {}).filter(([, value]) => !isWorkflowLink(value));
}

export function guessFieldType(value: unknown, inputName = ''): FieldType {
  const name = inputName.toLowerCase();
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return /strength|cfg|denoise/.test(name) ? 'slider' : 'number';
  if (typeof value === 'string') {
    if (/video|movie|mp4|webm|mov|m4v|vhs/.test(name) || /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/i.test(value)) return 'video';
    if (/audio|sound|music|voice|wav|mp3/.test(name) || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(value)) return 'audio';
    if (/image|img|mask|filename|file/.test(name) || /\.(png|jpe?g|webp|gif|bmp|tiff?)(\?|$)/i.test(value)) return 'image';
    if (/prompt|text|description/.test(name) || value.length > 60) return 'textarea';
  }
  return 'text';
}

export function makeField(node: string, input: string, value: unknown): WorkflowField {
  const type = guessFieldType(value, input);
  return {
    id: `f_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`}`,
    node, input, name: input, type, default: value,
    min: typeof value === 'number' ? 0 : null,
    max: typeof value === 'number' ? Math.max(100, value * 2) : null,
    step: typeof value === 'number' && !Number.isInteger(value) ? 0.01 : 1,
    options: [], random_enabled: /seed|noise_seed/.test(input.toLowerCase()),
  };
}

export function graphLayers(graph: WorkflowGraph): string[][] {
  const ids = Object.keys(graph);
  const dependencies = new Map(ids.map(id => [id, new Set<string>()]));
  for (const id of ids) {
    for (const value of Object.values(graph[id]?.inputs ?? {})) {
      if (isWorkflowLink(value) && dependencies.has(value[0])) dependencies.get(id)?.add(value[0]);
    }
  }
  const remaining = new Set(ids);
  const layers: string[][] = [];
  while (remaining.size) {
    const layer = [...remaining].filter(id => [...(dependencies.get(id) ?? [])].every(dep => !remaining.has(dep)));
    const selected = layer.length ? layer : [[...remaining].sort()[0]];
    layers.push(selected.sort());
    selected.forEach(id => remaining.delete(id));
  }
  return layers;
}

function classifyUrl(url: string): RunAsset['kind'] {
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return 'video';
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url)) return 'audio';
  return 'image';
}

export function extractRunAssets(payload: unknown): RunAsset[] {
  const seen = new Set<string>();
  const assets: RunAsset[] = [];
  const visit = (value: unknown, hint?: RunAsset['kind']) => {
    if (typeof value === 'string' && (/^(https?:|\/)/.test(value) || /\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav)(\?|$)/i.test(value))) {
      if (!seen.has(value)) { seen.add(value); assets.push({ url: value, kind: hint ?? classifyUrl(value) }); }
      return;
    }
    if (Array.isArray(value)) { value.forEach(item => visit(item, hint)); return; }
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        const nextHint = /video/i.test(key) ? 'video' : /audio/i.test(key) ? 'audio' : /image/i.test(key) ? 'image' : hint;
        visit(item, nextHint);
      }
    }
  };
  visit(payload);
  return assets;
}

export function randomValue(field: WorkflowField): number {
  const min = Number.isFinite(field.min) ? Number(field.min) : 0;
  const max = Number.isFinite(field.max) ? Number(field.max) : 2_147_483_647;
  const step = Number.isFinite(field.step) && Number(field.step) > 0 ? Number(field.step) : 1;
  const slots = Math.max(0, Math.floor((max - min) / step));
  return min + Math.floor(Math.random() * (slots + 1)) * step;
}
