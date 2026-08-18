export type ProviderProtocol = 'openai' | 'apimart' | 'gemini' | 'volcengine';
export type ModelKind = 'image' | 'chat' | 'video';
export type BillingType = 'per_image' | 'per_second' | 'per_call';

export interface ModelPrice {
  kind: 'image' | 'video'; model: string; billing_type: BillingType; unit_price: string; currency?: string; effective_from?: number; effective_to?: number;
}

export interface ModelScopeLora {
  id: string; name: string; target_model: string; strength: number; enabled: boolean; note: string;
}

export interface ApiProvider {
  id: string; name: string; base_url: string; protocol: ProviderProtocol; image_request_mode: 'openai' | 'openai-json'; proxy_url: string;
  enabled: boolean; primary: boolean; image_models: string[]; chat_models: string[]; video_models: string[];
  model_prices: ModelPrice[]; model_protocols: Record<string, 'openai' | 'gemini'>; ms_loras: ModelScopeLora[]; ms_defaults_version: number;
  volcengine_project_name: string; volcengine_region: string;
  has_key?: boolean; key_preview?: string; key_env?: string; api_key?: string; clear_key?: boolean;
  has_volcengine_access_key?: boolean; volcengine_access_key_preview?: string; volcengine_access_key_id?: string; clear_volcengine_access_key_id?: boolean;
  has_volcengine_secret_key?: boolean; volcengine_secret_key_preview?: string; volcengine_secret_access_key?: string; clear_volcengine_secret_access_key?: boolean;
}

export interface ProviderProbeResult {
  ok?: boolean; status?: number; status_code?: number; message?: string; protocol?: ProviderProtocol;
  model_count?: number; total?: number; image_models?: string[]; chat_models?: string[]; video_models?: string[]; all?: string[]; image_request_mode?: string;
}
