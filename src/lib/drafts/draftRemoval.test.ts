import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import * as errorReport from '../telemetry/errorReport.ts';
import {
  hasDraftHint, loadDraft, loadRecentFile, readCurrentEntryId, readRecentFiles,
  saveDraft, saveHandoff, setCurrentEntry, takeHandoff,
} from './draftStore.ts';
import { clearRecentEntries, removeRecentEntry, toolsPointingAt } from './draftRemoval.ts';
import { readCurrentPointers } from './draftRecentIndex.ts';

const bytesOf = (value: string) => new TextEncoder().encode(value).buffer;
const signalOf = (tool: string) => {
  const raw = localStorage.getItem(`pdf-toolkit:workspace:draft-change:${tool}`);
  return raw ? JSON.parse(raw) : null;
};
const save = (tool: string, name: string, work: unknown[] = []) =>
  saveDraft(tool, { fileName: `${name}.pdf`, fileType: 'application/pdf', fileBytes: bytesOf(`%PDF-1.4 ${name}`), elements: work });

describe('toolsPointingAt (pure)', () => {
  it('names each tool whose pointer is one of the ids, a stray id included', () => {
    expect(toolsPointingAt(new Set(['a', 'ghost']), [['sign', 'a'], ['merge', 'ghost'], ['split', 'b']])).toEqual(['sign', 'merge']);
  });

  it('is empty when nothing matches', () => {
    expect(toolsPointingAt(new Set(['x']), [['sign', 'a']])).toEqual([]);
  });
});

describe('removeRecentEntry / clearRecentEntries (fake-indexeddb)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    indexedDB = new IDBFactory();
  });

  it('removes one entry and leaves another entry, its work and its record intact', async () => {
    await save('sign', 'one', [{ id: 's1' }]);
    const oneId = readCurrentEntryId('sign') as string;
    await save('redact', 'two', [{ id: 'r1' }]);
    const twoId = readCurrentEntryId('redact') as string;

    expect(await removeRecentEntry(oneId)).toBe(true);

    expect(await loadRecentFile(oneId)).toBeNull();
    expect(readRecentFiles().map((e) => e.id)).toEqual([twoId]);
    expect(await loadRecentFile(twoId)).not.toBeNull();
    expect((await loadDraft('redact'))?.elements).toEqual([{ id: 'r1' }]);
    expect(readCurrentEntryId('redact')).toBe(twoId);
  });

  it('sends no per-tool signal, so a tab on another file sees no false conflict', async () => {
    await save('sign', 'keep');
    await save('sign', 'gone');
    const before = signalOf('sign');
    const gone = readRecentFiles().find((entry) => entry.fileName === 'gone.pdf')!;
    await removeRecentEntry(gone.id);
    expect(signalOf('sign')).toEqual(before);
  });

  it('leaves no trace of the removed id in storage, the announcement included', async () => {
    await save('sign', 'gone');
    const gone = readRecentFiles()[0];
    await removeRecentEntry(gone.id);
    expect(JSON.stringify({ ...localStorage })).not.toContain(gone.id);
  });

  it('leaves the tool with no draft and no hint', async () => {
    await save('sign', 'one', [{ id: 's1' }]);
    const id = readCurrentEntryId('sign') as string;
    await removeRecentEntry(id);
    expect(await loadDraft('sign')).toBeNull();
    expect(hasDraftHint('sign')).toBe(false);
  });

  it('takes a waiting hand-off with it: an abandoned one is a copy of a file that outlives its tile', async () => {
    await save('sign', 'keep');
    await save('sign', 'gone');
    const gone = readRecentFiles().find((entry) => entry.fileName === 'gone.pdf')!;
    await saveHandoff('sign', { fileName: 'gone.pdf', fileBytes: bytesOf('%PDF-1.4 gone') });
    await saveHandoff('merge', { files: [{ fileName: 'gone.pdf', fileBytes: bytesOf('%PDF-1.4 gone') }] });

    expect(await removeRecentEntry(gone.id)).toBe(true);

    // Before takeHandoff, which clears nothing here: the marker must already be gone, or the
    // next tool page holds its layout for a hand-off that no longer exists.
    expect(Object.keys(sessionStorage).filter((key) => key.startsWith('pdkef:handoff-pending:'))).toEqual([]);
    expect(await takeHandoff('sign')).toBeNull();
    expect(await takeHandoff('merge')).toBeNull();
    expect(readRecentFiles().map((entry) => entry.fileName)).toEqual(['keep.pdf']);
  });

  it('changes nothing when the store fails', async () => {
    await save('sign', 'one', [{ id: 's1' }]);
    const id = readCurrentEntryId('sign') as string;
    const boom = new Error('boom');
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw boom; });
    const report = vi.spyOn(errorReport, 'reportError').mockImplementation(() => {});
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await removeRecentEntry(id)).toBe(false);

    expect(report).toHaveBeenCalledWith('drafts', boom, 'remove_recent_entry');
    expect(readRecentFiles().map((e) => e.id)).toEqual([id]);
    expect(readCurrentEntryId('sign')).toBe(id);
    expect(signalOf('sign')?.kind).toBe('saved');
    report.mockRestore();
    quiet.mockRestore();
  });

  it('clear removes every entry, a pending hand-off and every pointer, even a stray one', async () => {
    await save('sign', 'one', [{ id: 's1' }]);
    await save('redact', 'two');
    await saveHandoff('compress', { fileName: 'h.pdf', fileBytes: bytesOf('%PDF-1.4 h') });
    setCurrentEntry('merge', 'sha256:missing');
    const ids = readRecentFiles().map((e) => e.id);

    expect(await clearRecentEntries()).toBe(true);

    expect(readRecentFiles()).toEqual([]);
    for (const id of ids) expect(await loadRecentFile(id)).toBeNull();
    expect(await takeHandoff('compress')).toBeNull();
    expect(readCurrentPointers()).toEqual([]);
  });

  it('clear changes nothing when the store fails', async () => {
    await save('sign', 'one');
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('boom'); });
    const report = vi.spyOn(errorReport, 'reportError').mockImplementation(() => {});
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await clearRecentEntries()).toBe(false);
    expect(report).toHaveBeenCalledWith('drafts', expect.any(Error), 'clear_recent_entries');
    expect(readRecentFiles()).toHaveLength(1);
    expect(readCurrentEntryId('sign')).not.toBeNull();
    report.mockRestore();
    quiet.mockRestore();
  });
});
