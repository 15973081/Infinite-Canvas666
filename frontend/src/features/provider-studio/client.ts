import { jsonRequest, requestJson } from '../../shared/http';
import type { ApiProvider, ProviderProbeResult } from './types';

export const providerClient = {
  async list(): Promise<ApiProvider[]> { return (await requestJson<{ providers?: ApiProvider[] }>('/api/providers')).providers ?? []; },
  async save(providers: ApiProvider[]): Promise<ApiProvider[]> {
    return (await requestJson<{ providers?: ApiProvider[] }>('/api/providers', jsonRequest('PUT', providers))).providers ?? providers;
  },
  test(provider: ApiProvider): Promise<ProviderProbeResult> {
    return requestJson('/api/providers/test-connection', jsonRequest('POST', probePayload(provider)));
  },
  probeAsync(provider: ApiProvider): Promise<ProviderProbeResult> {
    return requestJson('/api/providers/probe-async', jsonRequest('POST', probePayload(provider)));
  },
  fetchModels(provider: ApiProvider): Promise<ProviderProbeResult> {
    return requestJson('/api/providers/fetch-models', jsonRequest('POST', probePayload(provider)));
  },
};

function probePayload(provider: ApiProvider) {
  return { base_url: provider.base_url, api_key: provider.api_key || '', provider_id: provider.id, protocol: provider.protocol, image_request_mode: provider.image_request_mode, proxy_url: provider.proxy_url };
}
