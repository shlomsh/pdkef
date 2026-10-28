import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_CHANGE_PREFIX, getTabWriterId, notifyDraftChange } from './draftChanges.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

describe('draftChanges', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('writes the advisory change record under the per-tool key', () => {
    const change = { kind: 'saved' as const, revision: 3, updatedAt: 10, writerId: 'w' };
    notifyDraftChange('sign', change);
    const stored = (localStorage as unknown as ReturnType<typeof memoryStorage>).map.get(`${DRAFT_CHANGE_PREFIX}sign`);
    expect(JSON.parse(stored as string)).toEqual(change);
  });

  it('does not throw when localStorage is blocked', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked'); } });
    expect(() => notifyDraftChange('sign', { kind: 'deleted', revision: 1, updatedAt: 1, writerId: 'w' })).not.toThrow();
  });

  it('gives this tab one stable writer id', () => {
    expect(getTabWriterId()).toBe(getTabWriterId());
  });
});
