import { describe, expect, it } from 'vitest';
import { HINT_KEY, HINT_MS, hintSeen, markHintSeen } from './hint.ts';

function store(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => { data[k] = v; },
  };
}

describe('hint', () => {
  it('lasts four seconds', () => {
    expect(HINT_MS).toBe(4000);
  });
  it('is unseen in an empty store, seen after it is marked', () => {
    const s = store();
    expect(hintSeen(s)).toBe(false);
    markHintSeen(s);
    expect(s.data[HINT_KEY]).toBe('1');
    expect(hintSeen(s)).toBe(true);
  });
  it('with no storage at all it is unseen and marking does not throw', () => {
    expect(hintSeen(null)).toBe(false);
    expect(() => markHintSeen(null)).not.toThrow();
  });
  it('storage that throws reads as unseen and marking does not throw', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(hintSeen(broken)).toBe(false);
    expect(() => markHintSeen(broken)).not.toThrow();
  });
});
