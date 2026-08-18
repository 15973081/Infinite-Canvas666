import { describe, expect, it } from 'vitest';
import { createProvider, normalizeProvider, providerId, setModelPrice, uniqueModels } from './domain';

describe('provider studio domain', () => {
  it('derives stable provider ids and unique model catalogs', () => {
    expect(providerId(' My API 平台 ')).toBe('my-api');
    expect(uniqueModels(['a', ' a ', '', 'b'])).toEqual(['a', 'b']);
  });
  it('normalizes legacy or partial providers', () => {
    expect(normalizeProvider({ id: 'Demo', image_models: ['x', 'x'], protocol: 'gemini' })).toMatchObject({ id: 'demo', name: 'demo', protocol: 'gemini', image_models: ['x'], enabled: true });
  });
  it('creates collision-free providers and updates active prices', () => {
    const provider = createProvider([normalizeProvider({ id: 'provider-2' })]);
    expect(provider.id).toBe('provider-3');
    expect(setModelPrice(provider, 'image', 'img', '0.25', 'per_image').model_prices).toEqual([{ kind: 'image', model: 'img', unit_price: '0.25', billing_type: 'per_image', currency: 'CNY' }]);
  });
});
