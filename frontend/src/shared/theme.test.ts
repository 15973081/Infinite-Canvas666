import { describe, expect, it } from 'vitest';
import { normalizeStudioTheme } from './theme';

describe('studio theme', () => {
  it('normalizes unknown themes without page-specific globals', () => {
    expect(normalizeStudioTheme('unknown')).toBe('light');
    expect(normalizeStudioTheme('dark')).toBe('dark');
  });
});
