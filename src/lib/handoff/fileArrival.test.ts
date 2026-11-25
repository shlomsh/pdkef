// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { consumeRecentOpen, markArrival, noteRecentOpen, resetFileArrivalForTests, takeArrival } from './fileArrival.ts';

beforeEach(() => {
  resetFileArrivalForTests();
  sessionStorage.clear();
});

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
});
