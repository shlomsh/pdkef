// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fillStorage } from '../../test/support/fullStorage.ts';
import { DRAFT_CHANGE_PREFIX, getTabWriterId, notifyDraftChange } from './draftChanges.ts';

describe('draftChanges', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('writes the advisory change record under the per-tool key', () => {
    const change = { kind: 'saved' as const, revision: 3, updatedAt: 10, writerId: 'w' };
    notifyDraftChange('sign', change);
    const stored = localStorage.getItem(`${DRAFT_CHANGE_PREFIX}sign`);
    expect(JSON.parse(stored as string)).toEqual(change);
  });

  it('does not throw when localStorage is blocked', () => {
    fillStorage(localStorage);
    // Live control: a write that grows the full storage really throws.
    expect(() => localStorage.setItem('control', 'x')).toThrow();
    expect(() => notifyDraftChange('sign', { kind: 'deleted', revision: 1, updatedAt: 1, writerId: 'w' })).not.toThrow();
    expect(localStorage.getItem(`${DRAFT_CHANGE_PREFIX}sign`)).toBeNull();
  });

  it('gives this tab one stable writer id', () => {
    expect(getTabWriterId()).toBe(getTabWriterId());
  });
});
