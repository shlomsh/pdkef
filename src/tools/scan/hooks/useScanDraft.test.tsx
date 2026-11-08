import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hint: vi.fn(() => false),
  load: vi.fn(),
  clearEntry: vi.fn(),
  save: vi.fn(async () => true),
  deleteDraft: vi.fn(async () => undefined),
  report: vi.fn(),
}));
vi.mock('#lib/drafts/draftStore.ts', () => ({
  hasDraftHint: mocks.hint,
  loadDraft: mocks.load,
  clearCurrentEntry: mocks.clearEntry,
  saveDraft: mocks.save,
  deleteDraft: mocks.deleteDraft,
  sourceIdForFiles: async () => 'entry-1',
  readCurrentEntryId: () => null,
  attachDraftPreview: vi.fn(),
  subscribeToDraftChanges: () => () => {},
}));
vi.mock('#lib/handoff/fileArrival.ts', () => ({ consumeRecentOpen: () => false, markArrival: vi.fn() }));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: mocks.report }));

import { useScanDraft } from './useScanDraft.ts';
import { newPage } from '../lib/scanPages.ts';
import type { ScanDraftRestore } from '../lib/scanDraft.ts';
import type { ScanPage, ScanWork } from '../state/scanWork.ts';

const photo = (name: string) => new File([`photo ${name}`], name, { type: 'image/jpeg' });
const page = (name: string) => newPage(photo(name), 'document');
const record = () => ({
  files: [{ fileName: 'r.jpg', fileType: 'image/jpeg', fileBytes: new ArrayBuffer(4) }],
  schemaVersion: 1,
  pages: [{ filter: 'document', turns: 0, quad: null, sheet: false, opened: null, question: null }],
  sourceId: 'entry-0',
});

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
  return null;
}
const show = async (pages: ScanPage[]) => { await act(async () => { render(<Probe pages={pages} />, host); }); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('useScanDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.documentElement.setAttribute('data-draft-hint', '');
    mocks.hint.mockReturnValue(false);
    mocks.load.mockReset();
    mocks.load.mockResolvedValue(null);
    mocks.save.mockClear();
    mocks.save.mockResolvedValue(true);
    mocks.clearEntry.mockClear();
    mocks.report.mockClear();
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
    mocks.hint.mockReturnValue(true);
    mocks.load.mockResolvedValue(record());
    await show([]);
    await advance(0);
    await advance(50);
    expect(restorePages).toHaveBeenCalledTimes(1);
    expect(out.checking).toBe(false);
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
  });

  it('ignores the record when a pick landed before the load resolved', async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.load.mockReturnValue(new Promise((r) => { resolve = r; }));
    await show([]);
    work.pages = [page('picked.jpg')];
    resolve(record());
    await advance(0);
    expect(restorePages).not.toHaveBeenCalled();
  });

  it('lets go of a pointer at an entry with no photos', async () => {
    mocks.load.mockResolvedValue({ files: [] });
    await show([]);
    await advance(0);
    expect(mocks.clearEntry).toHaveBeenCalledWith('scan-to-pdf');
    expect(restorePages).not.toHaveBeenCalled();
  });

  it('skips the load while a hand-off is pending', async () => {
    document.documentElement.setAttribute('data-handoff-pending', '');
    mocks.hint.mockReturnValue(true);
    await show([]);
    await advance(0);
    await advance(50);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(out.checking).toBe(false);
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
  });

  it('autosaves a page change after 700ms and the status goes saving then saved', async () => {
    await show([]);
    await advance(0);
    const pages = [page('a.jpg')];
    await show(pages);
    const saving = out.status?.label;
    await advance(699);
    expect(mocks.save).not.toHaveBeenCalled();
    await advance(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(out.status).not.toBeNull();
    expect(out.status?.label).not.toBe(saving);
    expect(out.status?.failed).toBe(false);
  });

  it('does not save before the restore check settles', async () => {
    mocks.hint.mockReturnValue(true);
    mocks.load.mockReturnValue(new Promise(() => {}));
    await show([page('a.jpg')]);
    await advance(1000);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not rewrite a restored draft until something changes', async () => {
    mocks.load.mockResolvedValue(record());
    await show([]);
    await advance(0);
    await show(restoredPages);
    await advance(2000);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(out.status).toBeNull();
    await show([{ ...restoredPages[0], turns: 1 }]);
    await advance(700);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('flushes on pagehide without waiting for the debounce', async () => {
    await show([]);
    await advance(0);
    await show([page('a.jpg')]);
    await advance(100);
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event('pagehide')); await vi.advanceTimersByTimeAsync(0); });
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('forgets the draft when the pages are emptied', async () => {
    await show([]);
    await advance(0);
    await show([page('a.jpg')]);
    await advance(700);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await show([]);
    await advance(0);
    expect(mocks.deleteDraft).toHaveBeenCalledWith('scan-to-pdf', 'entry-1');
    expect(out.status).toBeNull();
  });
});
