import { describe, expect, it } from 'vitest';
import { isForwardableEvent, normalizePageId, pageFromHash, routeHash } from './domain';

describe('site shell routing', () => {
  it('normalizes storage and hash routes', () => {
    expect(normalizePageId('canvas')).toBe('canvas');
    expect(normalizePageId('missing')).toBe('online');
    expect(pageFromHash('#/gpt-chat')).toBe('gpt-chat');
    expect(routeHash('asset-manager')).toBe('#/asset-manager');
  });
  it('only forwards bounded studio events', () => {
    expect(isForwardableEvent({ type: 'assets-changed' })).toBe(true);
    expect(isForwardableEvent({ type: 'arbitrary-message' })).toBe(false);
  });
});

