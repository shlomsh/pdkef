import { describe, expect, it } from 'vitest';
import { lockedViewportContent } from './viewportLock.ts';

describe('lockedViewportContent', () => {
  it('sets initial/minimum/maximum-scale to 1 on the production static content', () => {
    const content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    expect(lockedViewportContent(content)).toBe(
      'width=device-width, initial-scale=1, viewport-fit=cover, minimum-scale=1, maximum-scale=1'
    );
  });

  it('preserves viewport-fit=cover and its position', () => {
    const content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    const result = lockedViewportContent(content);
    expect(result).toContain('viewport-fit=cover');
    expect(result.indexOf('viewport-fit=cover')).toBeLessThan(result.indexOf('minimum-scale=1'));
  });

  it('overrides an existing minimum-scale/maximum-scale that would allow zoom', () => {
    const content = 'width=device-width, initial-scale=1, minimum-scale=0.5, maximum-scale=2';
    expect(lockedViewportContent(content)).toBe(
      'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1'
    );
  });

  it('preserves other keys and their relative order, appending new locked keys after them', () => {
    const content = 'user-scalable=no, width=device-width';
    expect(lockedViewportContent(content)).toBe(
      'user-scalable=no, width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1'
    );
  });

  it('is idempotent', () => {
    const content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    const once = lockedViewportContent(content);
    const twice = lockedViewportContent(once);
    expect(twice).toBe(once);
  });

  it('handles an empty string by appending all three locked keys', () => {
    expect(lockedViewportContent('')).toBe('initial-scale=1, minimum-scale=1, maximum-scale=1');
  });
});
