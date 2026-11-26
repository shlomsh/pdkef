// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheRecentFile, loadRecentFile, peekHandoff, readRecentFiles, saveHandoff } from '../drafts/draftStore.ts';

// The real store runs on fake-indexeddb; a spy lets a test see what the recents write answered.
vi.mock('../drafts/draftStore.ts', { spy: true });

import { settleHandoff } from './settleHandoff.ts';

const bytes = () => new TextEncoder().encode('%PDF-1.7 settle').buffer;

beforeEach(() => {
  indexedDB = new IDBFactory();
  localStorage.clear();
});

describe('settleHandoff', () => {
  it('commits a multi record at once without caching its members (they must not take recents slots)', async () => {
    const files = [{ fileName: 'a.pdf', fileBytes: bytes() }, { fileName: 'b.pdf', fileBytes: bytes() }];
    await saveHandoff('merge', { files });
    await settleHandoff('merge', { files });
    expect(await peekHandoff('merge')).toBeNull();
    expect(readRecentFiles()).toEqual([]);
  });

  it('writes a bare entry: no preview, the type defaulted', async () => {
    await saveHandoff('sign', { fileName: 'a.pdf', fileBytes: bytes() });
    await settleHandoff('sign', { fileName: 'a.pdf', fileBytes: bytes() });
    const [entry] = readRecentFiles();
    expect(entry).toMatchObject({ tool: 'sign', fileName: 'a.pdf', fileType: 'application/pdf' });
    expect(entry.preview).toBeUndefined();
    const stored = await loadRecentFile(entry.id);
    expect(stored?.fileType).toBe('application/pdf');
    expect(new Uint8Array(stored!.fileBytes!)).toEqual(new Uint8Array(bytes()));
    expect(await peekHandoff('sign')).toBeNull();
  });

  it('skips non-PDF entries but still commits', async () => {
    await saveHandoff('compress', { fileName: 'a.png', fileType: 'image/png', fileBytes: bytes() });
    await settleHandoff('compress', { fileName: 'a.png', fileType: 'image/png', fileBytes: bytes() });
    expect(readRecentFiles()).toEqual([]);
    expect(await peekHandoff('compress')).toBeNull();
  });

  it('commits even when the cache write throws', async () => {
    // A record whose bytes are not an ArrayBuffer cannot be hashed, so the real recents write answers false.
    const unhashable = { fileName: 'a.pdf', fileBytes: new Uint8Array(bytes()) as never };
    await saveHandoff('sign', unhashable);
    await settleHandoff('sign', unhashable);
    expect(await vi.mocked(cacheRecentFile).mock.results[0].value).toBe(false);
    expect(readRecentFiles()).toEqual([]);
    expect(await peekHandoff('sign')).toBeNull();
  });
});
