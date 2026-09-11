import { describe, it, expect } from 'vitest';
import { acceptQuality } from './acceptNegotiation.js';

describe('acceptQuality', () => {
  it('gives an exact type match q=1 when unqualified', () => {
    expect(acceptQuality('text/markdown', 'text/markdown')).toBe(1);
  });

  it('returns 0 when the target type is absent and no wildcard covers it', () => {
    expect(acceptQuality('application/json', 'text/markdown')).toBe(0);
    expect(acceptQuality('text/html', 'text/markdown')).toBe(0);
  });

  it('honors an explicit q-value', () => {
    expect(acceptQuality('text/markdown;q=0.5', 'text/markdown')).toBe(0.5);
  });

  it('picks the higher of two q-values for the same exact type', () => {
    expect(acceptQuality('text/markdown;q=0.3, text/markdown;q=0.9', 'text/markdown')).toBe(0.9);
  });

  it('falls back to a type/* wildcard when no exact entry exists', () => {
    expect(acceptQuality('text/*;q=0.7', 'text/markdown')).toBe(0.7);
  });

  it('falls back to */* when neither an exact nor a type/* entry exists', () => {
    expect(acceptQuality('*/*;q=0.8', 'text/markdown')).toBe(0.8);
  });

  it('prefers an exact match over a type/* or */* entry even at a lower q', () => {
    // RFC 9110 12.5.1: the most specific reference has precedence.
    expect(acceptQuality('text/markdown;q=0.4, text/*;q=0.9, */*;q=1', 'text/markdown')).toBe(0.4);
    expect(acceptQuality('text/*;q=0.4, */*;q=1', 'text/markdown')).toBe(0.4);
  });

  it('reproduces a typical browser Accept header: HTML wins over the trailing */*', () => {
    const browserAccept = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    expect(acceptQuality(browserAccept, 'text/html')).toBe(1);
    expect(acceptQuality(browserAccept, 'text/markdown')).toBe(0.8);
  });

  it('reproduces an agent explicitly preferring markdown over html', () => {
    const agentAccept = 'text/markdown, text/html;q=0.9';
    expect(acceptQuality(agentAccept, 'text/markdown')).toBe(1);
    expect(acceptQuality(agentAccept, 'text/html')).toBe(0.9);
  });

  it('ignores parameters other than q', () => {
    expect(acceptQuality('text/markdown;charset=utf-8;q=0.6', 'text/markdown')).toBe(0.6);
  });

  it('ignores a non-numeric q value rather than throwing', () => {
    expect(acceptQuality('text/markdown;q=not-a-number', 'text/markdown')).toBe(1);
  });
});
