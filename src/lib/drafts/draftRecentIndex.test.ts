import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RECENT_FILES, clearCurrentEntry, readCurrentEntryId, readIndexEntries, recentFileKey,
  removeRecentMeta, setCurrentEntry, updateIndexHasWork, upsertIndexEntry,
} from './draftRecentIndex.ts';

const row = (id: string, savedAt: number) => ({ id, tool: 'sign', fileName: `${id}.pdf`, fileType: 'application/pdf', savedAt });

describe('draftRecentIndex', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps a per-tool current-entry pointer', () => {
    expect(readCurrentEntryId('sign')).toBeNull();
    setCurrentEntry('sign', 'sha256:a');
    expect(readCurrentEntryId('sign')).toBe('sha256:a');
    clearCurrentEntry('sign');
    expect(readCurrentEntryId('sign')).toBeNull();
  });

  it('prefixes IndexedDB keys for recent entries', () => {
    expect(recentFileKey('x')).toBe('recent:x');
  });

  it('orders by savedAt and caps the index at MAX_RECENT_FILES', () => {
    const now = Date.now();
    for (let i = 0; i < MAX_RECENT_FILES + 2; i += 1) upsertIndexEntry(row(`f${i}`, now - 1000 + i));
    const ids = readIndexEntries().map((e) => e.id);
    expect(ids).toHaveLength(MAX_RECENT_FILES);
    expect(ids[0]).toBe(`f${MAX_RECENT_FILES + 1}`);
  });

  it('patches and removes rows', () => {
    const now = Date.now();
    upsertIndexEntry({ ...row('a', now), hasWork: ['sign'] });
    updateIndexHasWork('a', []);
    expect(readIndexEntries()[0].hasWork).toBeUndefined();
    removeRecentMeta('a');
    expect(readIndexEntries()).toEqual([]);
  });
});
