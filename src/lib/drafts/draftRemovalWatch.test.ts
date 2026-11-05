import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { MERGE_DRAFT_MAX_BYTES, cacheRecentFile, loadDraft, readRecentFiles, saveDraft, sourceIdForBytes } from './draftStore.ts';
import { ENTRIES_REMOVED_KEY, forgetTabEntry } from './draftRemovalWatch.ts';
import { removeRecentEntry } from './draftRemoval.ts';

const bytesOf = (value: string) => new TextEncoder().encode(value).buffer;
const record = (name: string) => ({ fileName: `${name}.pdf`, fileType: 'application/pdf', fileBytes: bytesOf(`%PDF-1.4 ${name}`), elements: [] });

// What a peer tab's announcement looks like from here. A storage event never fires in the writer's own tab.
const peerRemoved = (removed: string[]) => window.dispatchEvent(new StorageEvent('storage', {
  key: ENTRIES_REMOVED_KEY, newValue: JSON.stringify({ removed }),
}));
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('an open tab whose file was removed', () => {
  const reload = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    indexedDB = new IDBFactory();
    reload.mockClear();
    forgetTabEntry();
    vi.stubGlobal('location', { ...window.location, reload });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reloads when a peer removes the entry it saved, and refuses to write it back', async () => {
    await saveDraft('sign', record('gone'));
    const id = await sourceIdForBytes(record('gone').fileBytes);
    peerRemoved([id!]);
    await settled();
    expect(reload).toHaveBeenCalledTimes(1);
    // The pagehide flush of the reload itself.
    expect(await saveDraft('sign', record('gone'))).toBe(false);
    expect(await cacheRecentFile('sign', record('gone'))).toBe(false);
  });

  it('reloads for the entry it restored', async () => {
    await saveDraft('redact', record('restored'));
    forgetTabEntry();
    await loadDraft('redact');
    peerRemoved([(await sourceIdForBytes(record('restored').fileBytes))!]);
    await settled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves a tab on a different file alone, and that file keeps saving', async () => {
    await saveDraft('sign', record('other'));
    await saveDraft('sign', record('mine'));
    const other = await sourceIdForBytes(record('other').fileBytes);
    peerRemoved([other!]);
    await settled();
    expect(reload).not.toHaveBeenCalled();
    expect(await saveDraft('sign', record('mine'))).toBe(true);
  });

  it('follows the tab to a newer file: the one it left no longer matters', async () => {
    await saveDraft('sign', record('left'));
    await cacheRecentFile('sign', record('now'));
    const left = await sourceIdForBytes(record('left').fileBytes);
    peerRemoved([left!]);
    await settled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('leaves a tab whose current work could not be stored: it is no longer on the old entry', async () => {
    await saveDraft('merge', record('old'));
    const old = await sourceIdForBytes(record('old').fileBytes);
    const tooBig = [{ fileName: 'huge.pdf', fileBytes: { byteLength: MERGE_DRAFT_MAX_BYTES + 1 } as ArrayBuffer }];
    expect(await saveDraft('merge', { files: tooBig, fileName: 'huge.pdf' })).toBe(false);
    peerRemoved([old!]);
    await settled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('knows its entry before the first write lands, so a failed write still counts', async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new Error('quota'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await saveDraft('sign', record('unsaved'))).toBe(false);
    put.mockRestore();
    const id = await sourceIdForBytes(record('unsaved').fileBytes);
    peerRemoved([id!]);
    await settled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores a corrupt message and a page with no entry', async () => {
    window.dispatchEvent(new StorageEvent('storage', { key: ENTRIES_REMOVED_KEY, newValue: '{not json' }));
    peerRemoved(['sha256:anything']);
    await settled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('checks the store when the back/forward cache restores it, since it heard nothing while frozen', async () => {
    await saveDraft('sign', record('gone'));
    const [entry] = readRecentFiles();
    await removeRecentEntry(entry.id);
    expect(reload).not.toHaveBeenCalled();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await settled();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await saveDraft('sign', record('gone'))).toBe(false);
  });

  it('stays put on a back/forward restore when the entry is still there', async () => {
    await saveDraft('sign', record('kept'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await settled();
    expect(reload).not.toHaveBeenCalled();
  });
});
