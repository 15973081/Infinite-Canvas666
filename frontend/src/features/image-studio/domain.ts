import type { StudioImageItem, StudioProvider } from './types';

export function normalizeProviders(config: Record<string, unknown>): StudioProvider[] {
  const providers = Array.isArray(config.api_providers) ? config.api_providers : [];
  const fallbackModels = Array.isArray(config.image_models) ? config.image_models.filter((item): item is string => typeof item === 'string') : [];
  return providers.map((raw, index) => {
    const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const models = (Array.isArray(value.image_models) ? value.image_models : Array.isArray(value.models) ? value.models : fallbackModels)
      .filter((item): item is string => typeof item === 'string');
    return {
      id: String(value.id || `provider-${index + 1}`), name: String(value.name || value.id || `平台 ${index + 1}`),
      protocol: typeof value.protocol === 'string' ? value.protocol : undefined,
      base_url: typeof value.base_url === 'string' ? value.base_url : undefined, image_models: models,
    };
  }).filter(provider => provider.image_models.length > 0);
}

export function normalizeImageResult(payload: unknown, prompt: string, type?: string): StudioImageItem {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const rawImages = Array.isArray(value.images) ? value.images : typeof value.url === 'string' ? [value.url] : [];
  const images = rawImages.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (!images.length) throw new Error('生成任务没有返回图片');
  return {
    ...value, timestamp: typeof value.timestamp === 'string' || typeof value.timestamp === 'number' ? value.timestamp : Date.now(),
    prompt: typeof value.prompt === 'string' ? value.prompt : prompt, images, type: typeof value.type === 'string' ? value.type : type,
  };
}

export function boundedDimension(value: number): number {
  if (!Number.isFinite(value)) return 1024;
  return Math.max(64, Math.min(8192, Math.round(value / 16) * 16));
}

export function outputSize(width: number, height: number): string {
  return `${boundedDimension(width)}x${boundedDimension(height)}`;
}
