// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { loadDraft, readRecentFiles } from '#lib/drafts/draftStore.ts';
import { newPage } from '../lib/scanPages.ts';
import { ScanDraftSession } from './scanDraftSession.ts';

const settings = { pageSize: 'fit' as const, limit: 'none' as const, defaultFilter: 'document' as const, name: 'Scan 4 Nov 2026' };
const page = (name: string) => newPage(new File([`photo ${name}`], name, { type: 'image/jpeg' }), 'document');

function snapshot(session: ScanDraftSession, pages: ReturnType<typeof page>[]) {
  return { pages, settings, key: session.keyOf(pages, settings) as string };
}

describe('ScanDraftSession', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.indexedDB = new IDBFactory();
  });

  it('saves the scan as one Recents row that follows it as pages are added', async () => {
    const session = new ScanDraftSession();
    const a = page('a.jpg');
    const b = page('b.jpg');
    expect(await session.save(snapshot(session, [a]))).toBe(true);
    const first = session.entryId;
    expect(await session.save(snapshot(session, [a, b]))).toBe(true);
    expect(session.entryId).not.toBe(first);
    expect(readRecentFiles().map((row) => [row.id, row.pageCount])).toEqual([[session.entryId, 2]]);
    const record = await loadDraft('scan-to-pdf');
    expect(record?.files?.map((f) => f.fileName)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('does not write a snapshot it already holds', async () => {
    const session = new ScanDraftSession();
    const a = page('a.jpg');
    await session.save(snapshot(session, [a]));
    const { savedAt } = readRecentFiles()[0];
    vi.spyOn(Date, 'now').mockReturnValue(savedAt + 60_000);
    await session.save(snapshot(session, [a]));
    vi.restoreAllMocks();
    expect(readRecentFiles()[0].savedAt).toBe(savedAt);
  });

  it('a restored scan is the entry it came from, so the first change replaces that row', async () => {
    const earlier = new ScanDraftSession();
    const a = page('a.jpg');
    await earlier.save(snapshot(earlier, [a]));
    const session = new ScanDraftSession();
    session.restored(earlier.entryId as string, [a], settings);
    await session.save(snapshot(session, [a, page('b.jpg')]));
    expect(readRecentFiles()).toHaveLength(1);
  });

  it('forgets the scan work after a save still running, and keeps the photos in Recents', async () => {
    const session = new ScanDraftSession();
    void session.save(snapshot(session, [page('a.jpg')]));
    session.forget();
    await session.settled();
    expect(session.entryId).toBeNull();
    expect(await loadDraft('scan-to-pdf')).toBeNull();
    expect(readRecentFiles()).toHaveLength(1);
    expect(readRecentFiles()[0].hasWork).toBeUndefined();
  });
});
