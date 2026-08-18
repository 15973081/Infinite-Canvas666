import type { ApiProvider, ModelKind, ModelPrice, ProviderProtocol } from './types';

export const PROTOCOLS: Array<{ value: ProviderProtocol; label: string }> = [
  { value: 'openai', label: 'OpenAI 兼容' }, { value: 'apimart', label: 'APIMart 异步' },
  { value: 'gemini', label: 'Gemini' }, { value: 'volcengine', label: '火山方舟' },
];

export function providerId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

export function uniqueModels(values: unknown): string[] {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value).trim()).filter(Boolean))];
}

export function normalizeProvider(raw: Partial<ApiProvider>, index = 0): ApiProvider {
  const protocol = PROTOCOLS.some(item => item.value === raw.protocol) ? raw.protocol as ProviderProtocol : 'openai';
  const id = providerId(raw.id || raw.name || `provider-${index + 1}`) || `provider-${index + 1}`;
  return {
    ...raw, id, name: String(raw.name || id), base_url: String(raw.base_url || ''), protocol,
    image_request_mode: raw.image_request_mode === 'openai-json' ? 'openai-json' : 'openai', proxy_url: String(raw.proxy_url || ''),
    enabled: raw.enabled !== false, primary: raw.primary === true,
    image_models: uniqueModels(raw.image_models), chat_models: uniqueModels(raw.chat_models), video_models: uniqueModels(raw.video_models),
    model_prices: Array.isArray(raw.model_prices) ? raw.model_prices.filter(price => !price.effective_to) : [],
    model_protocols: raw.model_protocols && typeof raw.model_protocols === 'object' ? raw.model_protocols : {},
    ms_loras: Array.isArray(raw.ms_loras) ? raw.ms_loras : [], ms_defaults_version: Number(raw.ms_defaults_version || 0),
    volcengine_project_name: String(raw.volcengine_project_name || ''), volcengine_region: String(raw.volcengine_region || ''),
  };
}

export function createProvider(existing: ApiProvider[]): ApiProvider {
  let suffix = existing.length + 1; while (existing.some(item => item.id === `provider-${suffix}`)) suffix += 1;
  return normalizeProvider({ id: `provider-${suffix}`, name: `新平台 ${suffix}`, base_url: 'https://api.example.com/v1' });
}

export const modelKey = (kind: ModelKind): 'image_models' | 'chat_models' | 'video_models' => `${kind}_models`;

export function modelPrice(provider: ApiProvider, kind: ModelKind, model: string): ModelPrice | undefined {
  return provider.model_prices.find(price => price.kind === kind && price.model === model && !price.effective_to);
}

export function setModelPrice(provider: ApiProvider, kind: ModelKind, model: string, unitPrice: string, billingType: string): ApiProvider {
  if (kind === 'chat') return provider;
  const remaining = provider.model_prices.filter(price => !(price.kind === kind && price.model === model && !price.effective_to));
  const value = Number(unitPrice);
  if (!Number.isFinite(value) || value <= 0) return { ...provider, model_prices: remaining };
  return { ...provider, model_prices: [...remaining, { kind, model, unit_price: unitPrice, billing_type: ['per_image','per_second','per_call'].includes(billingType) ? billingType as ModelPrice['billing_type'] : 'per_call', currency: 'CNY' }] };
}
