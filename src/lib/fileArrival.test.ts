import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeRecentOpen, markArrival, noteRecentOpen, resetFileArrivalForTests, takeArrival } from './fileArrival.ts';

function fakeStorage(throws = false) {
  const m = new Map<string, string>();
  const fail = () => {
    if (throws) throw new Error('blocked');
  };
  return {
    getItem: (k: string) => (fail(), m.get(k) ?? null),
    setItem: (k: string, v: string) => (fail(), void m.set(k, v)),
    removeItem: (k: string) => (fail(), void m.delete(k)),
  };
}

beforeEach(() => {
  resetFileArrivalForTests();
  vi.stubGlobal('sessionStorage', fakeStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe('markArrival / takeArrival', () => {
  it('returns undefined when nothing was marked', () => {
    expect(takeArrival()).toBeUndefined();
  });
  it('the last mark wins', () => {
    markArrival('pick');
    markArrival('drop');
    expect(takeArrival()).toEqual({ source: 'drop' });
  });
  it('take consumes the mark', () => {
    markArrival('paste');
    takeArrival();
    expect(takeArrival()).toBeUndefined();
  });
  it('keeps from only for a handoff', () => {
    markArrival('handoff', 'merge');
    expect(takeArrival()).toEqual({ source: 'handoff', from: 'merge' });
    markArrival('pick', 'merge');
    expect(takeArrival()).toEqual({ source: 'pick' });
    markArrival('handoff');
    expect(takeArrival()).toEqual({ source: 'handoff' });
  });
});

describe('recent open marker', () => {
  it('is read once, and only for its tool', () => {
    noteRecentOpen('sign');
    expect(consumeRecentOpen('redact')).toBe(false);
    noteRecentOpen('sign');
    expect(consumeRecentOpen('sign')).toBe(true);
    expect(consumeRecentOpen('sign')).toBe(false);
  });
  it('is false when nothing was noted', () => {
    expect(consumeRecentOpen('sign')).toBe(false);
  });
  it('survives storage throwing', () => {
    vi.stubGlobal('sessionStorage', fakeStorage(true));
    expect(() => noteRecentOpen('sign')).not.toThrow();
    expect(consumeRecentOpen('sign')).toBe(false);
  });
});
