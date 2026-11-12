import { describe, expect, it } from 'vitest';
import { analyticsOrigin } from './analyticsOrigin.mjs';

describe('analyticsOrigin', () => {
  it('is null when the variable is unset or empty', () => {
    expect(analyticsOrigin({})).toBeNull();
    expect(analyticsOrigin({ PUBLIC_ANALYTICS_HOST: '' })).toBeNull();
  });

  it('returns the origin of an https URL', () => {
    expect(analyticsOrigin({ PUBLIC_ANALYTICS_HOST: 'https://e.example.test/x' })).toBe('https://e.example.test');
  });

  it('throws, naming the variable, for http or garbage', () => {
    expect(() => analyticsOrigin({ PUBLIC_ANALYTICS_HOST: 'http://e.example.test' })).toThrow(/PUBLIC_ANALYTICS_HOST/);
    expect(() => analyticsOrigin({ PUBLIC_ANALYTICS_HOST: 'nonsense' })).toThrow(/PUBLIC_ANALYTICS_HOST/);
  });
});
