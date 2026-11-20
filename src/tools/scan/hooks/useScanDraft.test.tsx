import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real draft store runs on fake-indexeddb; the spy only lets a test see which calls happened and await their results.
vi.mock('#lib/drafts/draftStore.ts', { spy: true });

import { clearCurrentEntry, deleteDraft, loadDraft, readCurrentEntryId, saveDraft } from '#lib/drafts/draftStore.ts';
import { englishShellMessages as sm } from '#shell/shellMessages.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { useScanDraft } from './useScanDraft.ts';
import { newPage } from '../lib/scanPages.ts';
import type { ScanDraftRestore } from '../lib/scanDraft.ts';
import type { ScanPage, ScanWork } from '../state/scanWork.ts';

const photo = (name: string) => new File([`photo ${name}`], name, { type: 'image/jpeg' });
const page = (name: string) => newPage(photo(name), 'document');
// A scan the real store holds, as an earlier session left it: one photo, then the pointer and hint a reload finds.
const seedScan = async () => {
  const saved = await saveDraft('scan-to-pdf', {
    files: [{ fileName: 'r.jpg', fileType: 'image/jpeg', fileBytes: new TextEncoder().encode('seeded photo').buffer }],
    fileName: 'r.jpg',
    schemaVersion: 1,
    pages: [{ filter: 'document', turns: 0, quad: null, sheet: false, fine: false, opened: null, question: null }],
    pageCount: 1,
  });
  expect(saved).toBe(true);
  vi.mocked(saveDraft).mockClear();
  vi.mocked(loadDraft).mockClear();
};
let host: HTMLDivElement;
let out: ReturnType<typeof useScanDraft>;
let restoredPages: ScanPage[];
let work: { pages: ScanPage[] };
const restorePages = vi.fn((restore: ScanDraftRestore) => {
  restoredPages = restore.files.map((file) => newPage(file, 'document'));
  return restoredPages;
});

function Probe({ pages }: { pages: ScanPage[] }) {
  out = useScanDraft({
    pages,
    results: {},
    settings: {
      pageSize: 'fit', limit: 'none', defaultFilter: 'document', customName: null, defaultName: 'Scan', restoreSettings: vi.fn(),
    },
    restorePages,
    work: work as unknown as ScanWork,
  });
  return <p data-draft-line>{out.status?.label ?? ''}</p>;
}
const show = async (pages: ScanPage[]) => { await act(async () => { render(<Probe pages={pages} />, host); }); };
// The restore check is done once the hint is gone (it goes when the check settles); the store's reads run on the real scheduler.
const restoreChecked = () => waitUntil(() => !document.documentElement.hasAttribute('data-draft-hint'));
// A save is done once the quiet line says so.
const savedLine = () => waitUntil(() => expect(host.querySelector('[data-draft-line]')?.textContent).toBe(sm.draftSaved));
// What proves a "must not happen" check: the only thing that starts a save is the debounce timer, so while it is
// still pending (fake clock) no save has started, and the quiet line says nothing until one does.
const noSaveStarted = async () => {
  expect(host.querySelector('[data-draft-line]')?.textContent).toBe('');
  await act(async () => { await drainPromises(); });
};
const debouncePending = () => expect(vi.getTimerCount()).toBeGreaterThan(0);
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
// The debounce and the other timers are fake; the store's own IO stays on the real scheduler.
const timers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

describe('useScanDraft', () => {
  beforeEach(() => {
    timers();
    indexedDB = new IDBFactory();
    localStorage.clear();
    host = document.createElement('div');
    document.documentElement.setAttribute('data-draft-hint', '');
    vi.mocked(saveDraft).mockClear();
    vi.mocked(loadDraft).mockReset();
    vi.mocked(deleteDraft).mockClear();
    vi.mocked(clearCurrentEntry).mockClear();
    restorePages.mockClear();
    work = { pages: [] };
  });
  afterEach(() => {
    render(null, host);
    document.documentElement.removeAttribute('data-draft-hint');
    document.documentElement.removeAttribute('data-handoff-pending');
    vi.useRealTimers();
  });

  it('restores a valid draft when no pages exist, then clears the hint', async () => {
    await seedScan();
    await show([]);
    await restoreChecked();
    expect(restorePages).toHaveBeenCalledTimes(1);
    expect(await restoredPages[0].file.text()).toBe('seeded photo');
    expect(out.checking).toBe(false);
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
  });

  it('ignores the record when a pick landed before the load resolved', async () => {
    await seedScan();
    let release: () => void = () => {};
    const held = new Promise<void>((r) => { release = r; });
    vi.mocked(loadDraft).mockImplementationOnce(async (tool) => { await held; return (await vi.importActual<typeof import('#lib/drafts/draftStore.ts')>('#lib/drafts/draftStore.ts')).loadDraft(tool); }); // forced: the store's read is held open, then runs for real
    await show([]);
    work.pages = [page('picked.jpg')];
    release();
    await restoreChecked();
    expect(restorePages).not.toHaveBeenCalled();
  });

  it('lets go of a pointer at an entry with no photos', async () => {
    await seedScan();
    expect(readCurrentEntryId('scan-to-pdf')).not.toBeNull();
    // The real store never hands back an entry without photos; this one line forces it.
    vi.mocked(loadDraft).mockResolvedValueOnce({ files: [] } as never);
    await show([]);
    await restoreChecked();
    expect(clearCurrentEntry).toHaveBeenCalledWith('scan-to-pdf');
    expect(readCurrentEntryId('scan-to-pdf')).toBeNull();
    expect(restorePages).not.toHaveBeenCalled();
  });

  it('skips the load while a hand-off is pending', async () => {
    await seedScan();
    document.documentElement.setAttribute('data-handoff-pending', '');
    await show([]);
    await restoreChecked();
    expect(loadDraft).not.toHaveBeenCalled();
    expect(out.checking).toBe(false);
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
  });

  it('autosaves a page change after 700ms and the status goes saving then saved', async () => {
    await show([]);
    await restoreChecked();
    const pages = [page('a.jpg')];
    await show(pages);
    const saving = out.status?.label;
    await advance(699);
    debouncePending();
    expect(host.querySelector('[data-draft-line]')?.textContent).toBe(saving);
    await act(async () => { await drainPromises(); });
    expect(saveDraft).not.toHaveBeenCalled();
    await advance(1);
    await savedLine();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(out.status).not.toBeNull();
    expect(out.status?.label).not.toBe(saving);
    expect(out.status?.failed).toBe(false);
    const stored = await loadDraft('scan-to-pdf');
    expect(stored?.files).toHaveLength(1);
    expect(stored?.files?.[0].fileName).toBe('a.jpg');
  });

  it('does not save before the restore check settles', async () => {
    await seedScan();
    // A read that never answers is a state the real store does not produce; this one line forces it.
    vi.mocked(loadDraft).mockReturnValueOnce(new Promise(() => {}));
    await show([page('a.jpg')]);
    await advance(1000);
    await noSaveStarted();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it('does not rewrite a restored draft until something changes', async () => {
    await seedScan();
    await show([]);
    await restoreChecked();
    await show(restoredPages);
    await advance(2000);
    expect(vi.getTimerCount()).toBe(0);
    await noSaveStarted();
    expect(saveDraft).not.toHaveBeenCalled();
    expect(out.status).toBeNull();
    await show([{ ...restoredPages[0], turns: 1 }]);
    await advance(700);
    await savedLine();
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('flushes on pagehide without waiting for the debounce', async () => {
    await show([]);
    await restoreChecked();
    await show([page('a.jpg')]);
    await advance(100);
    debouncePending();
    await act(async () => { await drainPromises(); });
    expect(saveDraft).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event('pagehide')); await vi.advanceTimersByTimeAsync(0); });
    await savedLine();
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('forgets the draft when the pages are emptied', async () => {
    await show([]);
    await restoreChecked();
    await show([page('a.jpg')]);
    await advance(700);
    await savedLine();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    const savedId = readCurrentEntryId('scan-to-pdf');
    expect(savedId).not.toBeNull();
    await show([]);
    await waitUntil(() => expect(readCurrentEntryId('scan-to-pdf')).toBeNull());
    expect(deleteDraft).toHaveBeenCalledWith('scan-to-pdf', savedId);
    expect(readCurrentEntryId('scan-to-pdf')).toBeNull();
    expect(out.status).toBeNull();
  });
});
