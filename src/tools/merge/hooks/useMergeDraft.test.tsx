import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useState } from 'preact/hooks';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { HeldFile } from '../../../test/support/heldFile.ts';
// fake-indexeddb, not a mock of draftStore.js: MERGE-13's own draftStore.test.js
// already covers the multi-file record shape against a real (in-memory)
// IndexedDB, and this file leans on that same backing so the restore and
// autosave tests below exercise the real saveDraft/loadDraft round-trip
// rather than an assumption about what they do.
//
// Only setTimeout and clearTimeout are faked (beforeEach): that is the hook's debounce, a product timer
// the tests advance by hand. fake-indexeddb schedules its callbacks through setImmediate (see its
// lib/scheduling.js), which stays real, so every save/load/delete in this file runs on the real event loop and
// a test waits for its outcome (a saved state, a stored record) instead of a clock. Most tests below shorten
// the debounce through the hook's `autosaveDebounceMs` option (the same precedent as usePreparedMerge.ts's
// `debounceMs`); exactly one test keeps the production 700ms default, to still assert that number.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  useMergeDraft, MERGE_DRAFT_SCHEMA_VERSION,
  type MergeDraftRestore, type MergeDraftSaveState,
  type UseMergeDraftOptions, type UseMergeDraftResult,
} from './useMergeDraft.ts';
import {
  loadDraft, saveDraft, loadRecentFile, sourceIdForFiles, MERGE_DRAFT_MAX_BYTES,
  setCurrentEntry, readCurrentEntryId, type DraftRecord,
} from '#lib/drafts/draftStore.ts';
import { takeArrival, noteRecentOpen, resetFileArrivalForTests } from '#lib/handoff/fileArrival.ts';
import { planForFile } from '#lib/pages/pagePlan.ts';
import { flushBeforeUpdateReload, isUpdateHeld } from '#lib/appUpdate/updateHolds.ts';

type MergeDraftEntry = UseMergeDraftOptions['entries'][number];

type Ref<T> = { current: T | null };
type OnRestore = UseMergeDraftOptions['onRestore'];
// What a harness hands back; the one that wraps the hook in a `draft` field is read through it too.
type SaveStateHolder = { draftSaveState: MergeDraftSaveState } | { draft: { draftSaveState: MergeDraftSaveState } };

// The latest value a harness stored: reading it before the mount stored one is a test mistake, so it throws.
function api<T>(ref: Ref<T>): T {
  if (!ref.current) throw new Error('the harness has not stored its api yet');
  return ref.current;
}

// The stored record, or a failure when nothing is stored.
async function storedDraft(): Promise<DraftRecord> {
  const record = await loadDraft('merge');
  if (!record) throw new Error('no merge draft is stored');
  return record;
}

function revisionOf(record: DraftRecord): number {
  if (typeof record.revision !== 'number') throw new Error('the stored draft has no revision');
  return record.revision;
}

// A stand-in for an ArrayBuffer of a size nobody allocates: only byteLength is read before the size check.
const fakeBuffer = (byteLength: number) => ({ byteLength }) as ArrayBuffer;

function Harness({ apiRef, options }: { apiRef: Ref<UseMergeDraftResult>; options: UseMergeDraftOptions }) {
  apiRef.current = useMergeDraft(options);
  return null;
}

// Mirrors PdfMergeTool's restore path: parent state is rebuilt from the
// stored files, then page-count/thumbnail inspection eventually declares the
// restored workspace complete. Keeping that stateful bridge here makes the
// no-autosave assertion cover the hook's real render/effect timing.
type RestoredWorkspaceApi = UseMergeDraftResult & {
  setRestoreHydrationComplete: (complete: boolean) => void;
  setAddPageNumbers: (on: boolean) => void;
  rerender: () => void;
};

function RestoredWorkspaceHarness({ apiRef, autosaveDebounceMs = 40 }: { apiRef: Ref<RestoredWorkspaceApi>; autosaveDebounceMs?: number }) {
  const [restored, setRestored] = useState<MergeDraftRestore | null>(null);
  const [restoreHydrationComplete, setRestoreHydrationComplete] = useState(false);
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  // An unrelated parent re-render (PdfMergeTool's five-second restore
  // sentence timing out, say) with the snapshot unchanged.
  const [, setTick] = useState(0);
  const entries: MergeDraftEntry[] = restored?.files.map((file, id) => ({ id, file, pageCount: null, thumbnail: null, error: null })) ?? [];
  const draft = useMergeDraft({
    enabled: true,
    entries,
    plan: restored?.plan ?? [],
    options: { addPageNumbers },
    title: 'merged_invoice',
    outputName: null,
    restoreHydrationComplete,
    autosaveDebounceMs,
    onRestore: setRestored,
  });
  apiRef.current = { ...draft, setRestoreHydrationComplete, setAddPageNumbers, rerender: () => setTick((tick) => tick + 1) };
  return null;
}

function makeFile(name: string, content: string = `%PDF-1.4 ${name}`) {
  return new File([content], name, { type: 'application/pdf' });
}

function baseEntry(id: number, name: string, pageCount = 1, overrides: Partial<MergeDraftEntry> = {}): MergeDraftEntry {
  return {
    id, file: makeFile(name), pageCount, thumbnail: null, error: null, ...overrides,
  };
}

function baseOptions(overrides: Partial<UseMergeDraftOptions> = {}): UseMergeDraftOptions {
  return {
    enabled: true,
    entries: [],
    plan: [],
    options: { addPageNumbers: false },
    title: 'merged',
    outputName: null,
    onRestore: vi.fn(),
    ...overrides,
  };
}

// Lets the promise work already queued run, `turns` event-loop turns for work that hops (fake-indexeddb steps).
const drain = (turns = 1) => act(async () => { for (let turn = 0; turn < turns; turn += 1) await drainPromises(); });

// A mount's restore effect kicks off an async IIFE that reads through fake-indexeddb. A read of the same
// store issued after it queues behind it, so awaiting `loadDraft` here lets the restore's own read finish, and
// one more turn carries its result into the hook (onRestore, the settled flag). A restore with more async work
// after that read (deleting a record it rejects) passes `done`: an observable that only holds once that work ended.
const restoreSettled = async (done?: () => unknown) => {
  await act(async () => { await loadDraft('merge'); });
  if (done) await waitUntil(done);
  await drain();
};

// The apiRef of the latest mount(): flushDebounce waits on its save state.
let mounted: Ref<SaveStateHolder> | null = null;

// The debounced autosave is a setTimeout (700ms by default, `autosaveDebounceMs` in most tests below) followed by
// an async buildRecord (reads File bytes) / persist (writes through IndexedDB) chain. Advance the debounce on
// the faked clock, then wait for the chain to end: a save state that is no longer 'pending'.
async function flushDebounce(debounceMs = 700, apiRef: Ref<SaveStateHolder> | null = mounted) {
  await act(async () => { await vi.advanceTimersByTimeAsync(debounceMs + 1); });
  const saveState = () => {
    const held = apiRef?.current;
    if (!held) return undefined;
    return 'draft' in held ? held.draft.draftSaveState : held.draftSaveState;
  };
  if (apiRef) await waitUntil(() => saveState() !== 'pending');
  await drain(5);
}

// Two separate `act()` calls, deliberately: an async callback only flushes effects once the callback itself
// resolves (see preact/test-utils' `act`), so awaiting inside the same call as `render()` would delay the mount
// effect - the one that starts the restore IIFE - rather than give it time to finish.
async function mount(apiRef: Ref<UseMergeDraftResult>, options: UseMergeDraftOptions, done?: () => unknown) {
  mounted = apiRef;
  act(() => {
    render(<Harness apiRef={apiRef} options={options} />, container);
  });
  await restoreSettled(done);
}

let container: HTMLElement;

describe('useMergeDraft', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-draft-hint');
    // A fresh backing store per test - draftStore.ts's database has no
    // upgrade path by design, so a record left behind by an earlier test
    // would otherwise leak into the next one's "fresh database" assumptions.
    indexedDB = new IDBFactory();
    mounted = null;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => render(null, container));
    container.remove();
    document.documentElement.removeAttribute('data-draft-hint');
  });

  it('starts idle with no draft hint, and never calls onRestore', async () => {
    const onRestore = vi.fn<OnRestore>();
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ onRestore }));

    expect(api(apiRef).isRestoring).toBe(false);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('restores a stored draft, rebuilding files, the index-based plan, and options', async () => {
    const bytesA = new TextEncoder().encode('file A bytes').buffer;
    const bytesB = new TextEncoder().encode('file B bytes').buffer;
    await saveDraft('merge', {
      files: [
        { fileName: 'invoice.pdf', fileType: 'application/pdf', fileBytes: bytesA },
        { fileName: 'receipt.pdf', fileType: 'application/pdf', fileBytes: bytesB },
      ],
      plan: [
        { key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false },
        { key: '1:0', fileId: 1, pageIndex: 0, rotation: 90, skipped: true },
      ],
      options: { addPageNumbers: true },
      fileName: 'merged_invoice',
      pageCount: 1,
      fileCount: 2,
      schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    });

    const onRestore = vi.fn<OnRestore>();
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ onRestore }));

    expect(onRestore).toHaveBeenCalledTimes(1);
    const restored = onRestore.mock.calls[0][0];
    expect(restored.files.map((f) => f.name)).toEqual(['invoice.pdf', 'receipt.pdf']);
    expect(new TextDecoder().decode(await restored.files[0].arrayBuffer())).toBe('file A bytes');
    expect(new TextDecoder().decode(await restored.files[1].arrayBuffer())).toBe('file B bytes');
    expect(restored.plan).toEqual([
      { key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false },
      { key: '1:0', fileId: 1, pageIndex: 0, rotation: 90, skipped: true },
    ]);
    expect(restored.options).toEqual({ addPageNumbers: true });
    expect(api(apiRef).isRestoring).toBe(false);
  });

  it.each([
    ['restore', false],
    ['recent', true],
  ])('hands a restored draft on as %s, marking nothing itself (DEBT-58)', async (source, fromTile) => {
    resetFileArrivalForTests();
    if (fromTile) noteRecentOpen('merge');
    await saveDraft('merge', {
      files: [{ fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: new TextEncoder().encode('a').buffer }],
      plan: [{ key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false }],
      options: {},
      fileName: 'merged_a',
      pageCount: 1,
      fileCount: 1,
      schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    });
    const onRestore = vi.fn<OnRestore>();
    await mount({ current: null }, baseOptions({ onRestore }));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith(expect.anything(), source);
    expect(takeArrival()).toBeUndefined();
  });

  it('restores a renamed output name, and null when the record never had one', async () => {
    await saveDraft('merge', {
      files: [{ fileName: 'invoice.pdf', fileType: 'application/pdf', fileBytes: new TextEncoder().encode('A').buffer }],
      plan: [{ key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false }],
      options: {},
      fileName: 'Custom name',
      outputName: 'Custom name',
      schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    });

    const onRestore = vi.fn<OnRestore>();
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ onRestore }));

    expect(onRestore.mock.calls[0][0].outputName).toBe('Custom name');
  });

  it('keeps a restored workspace idle through derived hydration and only saves a later real edit', async () => {
    await saveDraft('merge', {
      files: [{ fileName: 'invoice.pdf', fileType: 'application/pdf', fileBytes: new TextEncoder().encode('A').buffer }],
      plan: [{ key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false }],
      options: { addPageNumbers: false }, fileName: 'merged_invoice', schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    });
    const before = await storedDraft();
    const apiRef: Ref<RestoredWorkspaceApi> = { current: null };
    act(() => render(<RestoredWorkspaceHarness apiRef={apiRef} />, container));
    await restoreSettled();
    expect(api(apiRef).draftSaveState).toBe('idle');
    await flushDebounce(40, apiRef);
    expect(revisionOf(await storedDraft())).toBe(revisionOf(before));

    // The delayed inspect/thumbnail completion itself is still clean.
    act(() => api(apiRef).setRestoreHydrationComplete(true));
    await flushDebounce(40, apiRef);
    expect(api(apiRef).draftSaveState).toBe('idle');
    expect(revisionOf(await storedDraft())).toBe(revisionOf(before));
    // ...and stays idle on a later render with nothing changed: the settled
    // restored snapshot has no write of its own to be pending for.
    act(() => api(apiRef).rerender());
    expect(api(apiRef).draftSaveState).toBe('idle');
    await flushDebounce(40, apiRef);
    expect(api(apiRef).draftSaveState).toBe('idle');
    expect(revisionOf(await storedDraft())).toBe(revisionOf(before));

    // A person changing an option after restore gets the normal one-save
    // lifecycle, proving the quiet baseline did not disable persistence.
    act(() => api(apiRef).setAddPageNumbers(true));
    expect(api(apiRef).draftSaveState).toBe('pending');
    await flushDebounce(40, apiRef);
    expect(api(apiRef).draftSaveState).toBe('saved');
    const afterEdit = await storedDraft();
    expect(revisionOf(afterEdit)).toBe(revisionOf(before) + 1);

    // A late pagehide after the debounce is a flush only when there is work
    // it has not already persisted; this settled edit must stay one write.
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    await flushDebounce(40, apiRef);
    expect(revisionOf(await storedDraft())).toBe(revisionOf(afterEdit));
  });

  // SITE-42: a home-page hand-off beats the restore. The island declines a
  // restore that lands after it, or replaces one that landed first; either way
  // the handed-off set has no stored record and must save like any new set.
  const storeOldDraft = () => saveDraft('merge', {
    files: [{ fileName: 'old.pdf', fileType: 'application/pdf', fileBytes: new TextEncoder().encode('A').buffer }],
    plan: [{ key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false }],
    options: { addPageNumbers: false }, fileName: 'merged_old', schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
  });

  it('saves a set that arrives after a restore the island declined', async () => {
    await storeOldDraft();
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    const declined = vi.fn<OnRestore>();
    await mount(apiRef, baseOptions({ onRestore: declined, autosaveDebounceMs: 40 }));
    expect(declined).toHaveBeenCalledTimes(1);
    act(() => {
      render(<Harness apiRef={apiRef} options={baseOptions({
        onRestore: declined,
        autosaveDebounceMs: 40,
        entries: [baseEntry(0, 'new.pdf')],
        plan: [{ key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false }],
      })} />, container);
    });
    await flushDebounce(40);
    expect((await storedDraft()).files?.map((f) => f.fileName)).toEqual(['new.pdf']);
  });

  it('saves a hand-off that replaces a restore still being hydrated', async () => {
    await storeOldDraft();
    const apiRef: Ref<{ replace: (file: File) => void; draft: UseMergeDraftResult }> = { current: null };
    function ReplacedHarness() {
      const [files, setFiles] = useState<File[]>([]);
      const [hydrated, setHydrated] = useState(false);
      const draft = useMergeDraft(baseOptions({
        autosaveDebounceMs: 40,
        restoreHydrationComplete: hydrated,
        entries: files.map((file, id) => ({ id, file, pageCount: 1, thumbnail: null, error: null })),
        plan: files.map((_, id) => ({ key: `${id}:0`, fileId: id, pageIndex: 0, rotation: 0, skipped: false })),
        onRestore: (restored) => setFiles(restored.files),
      }));
      apiRef.current = { replace: (file) => { setFiles([file]); setHydrated(true); }, draft };
      return null;
    }
    act(() => render(<ReplacedHarness />, container));
    await restoreSettled();
    act(() => api(apiRef).replace(makeFile('new.pdf')));
    await flushDebounce(40, apiRef);
    expect((await storedDraft()).files?.map((f) => f.fileName)).toEqual(['new.pdf']);
  });

  it('treats a stored record with an out-of-range plan fileId as no draft: nothing restored, the record deleted, the hint attribute cleared', async () => {
    await saveDraft('merge', {
      files: [{ fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: new TextEncoder().encode('A').buffer }],
      // Only one file (index 0) exists; fileId 5 cannot refer to anything.
      plan: [{ key: '5:0', fileId: 5, pageIndex: 0, rotation: 0, skipped: false }],
      options: {},
      fileName: 'a.pdf',
      schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    });
    // Simulates ToolPageLayout.astro's blocking head script, which sets this
    // from the same localStorage hint before this hook ever mounts.
    document.documentElement.setAttribute('data-draft-hint', '');

    const onRestore = vi.fn<OnRestore>();
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    // The restore clears the hint attribute only after it has deleted the record it rejected.
    await mount(apiRef, baseOptions({ onRestore }), () => !document.documentElement.hasAttribute('data-draft-hint'));

    expect(onRestore).not.toHaveBeenCalled();
    expect(await loadDraft('merge')).toBeNull();
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
    expect(api(apiRef).isRestoring).toBe(false);
  });

  it('autosaves 700ms after entries/plan/options change, indexing the plan by array position', async () => {
    const entries = [baseEntry(10, 'invoice.pdf', 2), baseEntry(20, 'receipt.pdf', 1)];
    const plan = [
      { key: '10:0', fileId: 10, pageIndex: 0, rotation: 0, skipped: false },
      { key: '10:1', fileId: 10, pageIndex: 1, rotation: 0, skipped: true },
      { key: '20:0', fileId: 20, pageIndex: 0, rotation: 90, skipped: false },
    ];
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ entries, plan, title: 'merged_invoice' }));
    expect(api(apiRef).draftSaveState).toBe('pending');

    await flushDebounce();

    expect(api(apiRef).draftSaveState).toBe('saved');
    const record = await storedDraft();
    expect(record.files?.map((f) => f.fileName)).toEqual(['invoice.pdf', 'receipt.pdf']);
    // Stable per-entry ids (10, 20) become plain array indices in the saved plan.
    expect(record.plan).toEqual([
      { key: '10:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false },
      { key: '10:1', fileId: 0, pageIndex: 1, rotation: 0, skipped: true },
      { key: '20:0', fileId: 1, pageIndex: 0, rotation: 90, skipped: false },
    ]);
    expect(record.fileName).toBe('merged_invoice');
    expect(record.outputName).toBeNull();
    expect(record.pageCount).toBe(2); // two of the three plan entries are not skipped
    expect(record.fileCount).toBe(2);
  });

  it('saves an untyped photo as image/jpeg and restores it as one (MERGE-22)', async () => {
    const photo = new File(['jpeg bytes'], 'photo.jpg', { type: '' });
    const entries = [baseEntry(1, 'a.pdf', 1), { id: 2, file: photo, pageCount: 1, thumbnail: null, error: null }];
    const plan = [
      { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: false },
      { key: '2:0', fileId: 2, pageIndex: 0, rotation: 0, skipped: false },
    ];
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ entries, plan }));
    await flushDebounce();
    const record = await storedDraft();
    expect(record.files?.map((f) => f.fileType)).toEqual(['application/pdf', 'image/jpeg']);

    act(() => render(null, container));
    const onRestore = vi.fn<OnRestore>();
    await mount({ current: null }, baseOptions({ onRestore }));
    expect(onRestore.mock.calls[0][0].files.map((f) => f.type)).toEqual(['application/pdf', 'image/jpeg']);
  });

  it('autosaves the renamed output name once one is set, and it comes back on restore', async () => {
    const entries = [baseEntry(10, 'invoice.pdf', 1)];
    const plan = planForFile(10, 1);
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({
      entries, plan, title: 'My renamed file', outputName: 'My renamed file', autosaveDebounceMs: 40,
    }));

    await flushDebounce(40);

    const record = await storedDraft();
    expect(record.outputName).toBe('My renamed file');

    // A fresh mount, not a re-render of the same Harness instance (which
    // would reuse its already-settled restoreAttempted ref and never call
    // onRestore again) - unmount first, the same way afterEach does.
    act(() => render(null, container));
    const onRestore = vi.fn<OnRestore>();
    const restoredRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(restoredRef, baseOptions({ onRestore }));
    expect(onRestore.mock.calls[0][0].outputName).toBe('My renamed file');
  });

  it('reports "error" when saveDraft cannot persist (an oversized set, MERGE-13\'s honest limit)', async () => {
    const entry = baseEntry(1, 'huge.pdf', 1);
    // A fake byteLength, not a real 200MB allocation: saveMultiFileDraft sums
    // fileBytes.byteLength before it ever hashes the bytes, exactly like
    // draftStore.test.js's own "over MERGE_DRAFT_MAX_BYTES" case.
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a real 200MB+1 file builds in ~85ms but holds ~800MB of memory (three copies), too heavy.
    vi.spyOn(entry.file, 'arrayBuffer').mockResolvedValue(fakeBuffer(MERGE_DRAFT_MAX_BYTES + 1));
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ entries: [entry], plan: planForFile(1, 1), autosaveDebounceMs: 40 }));

    await flushDebounce(40);

    expect(api(apiRef).draftSaveState).toBe('error');
    expect(await loadDraft('merge')).toBeNull();
  });

  it('holds an update only while a save has failed, and releases once a later save succeeds (MEM-10)', async () => {
    const huge = baseEntry(1, 'huge.pdf', 1);
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a real 200MB+1 file holds ~800MB of memory, too heavy.
    vi.spyOn(huge.file, 'arrayBuffer').mockResolvedValue(fakeBuffer(MERGE_DRAFT_MAX_BYTES + 1));
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ entries: [huge], plan: planForFile(1, 1), autosaveDebounceMs: 40 }));
    await flushDebounce(40);
    expect(api(apiRef).draftSaveState).toBe('error');
    expect(isUpdateHeld()).toBe(true);

    const small = baseEntry(2, 'small.pdf', 1);
    act(() => {
      render(<Harness apiRef={apiRef} options={baseOptions({ entries: [small], plan: planForFile(2, 1), autosaveDebounceMs: 40 })} />, container);
    });
    await flushDebounce(40);
    expect(api(apiRef).draftSaveState).toBe('saved');
    expect(isUpdateHeld()).toBe(false);
  });

  it('does not hold an update while saves succeed (MEM-10)', async () => {
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ entries: [baseEntry(1, 'a.pdf', 1)], plan: planForFile(1, 1), autosaveDebounceMs: 40 }));
    await flushDebounce(40);
    expect(api(apiRef).draftSaveState).toBe('saved');
    expect(isUpdateHeld()).toBe(false);
  });

  it('keeps a new revision "pending" while an older write is still resolving, and the stale completion cannot regress it', async () => {
    const staleFile = new HeldFile(new TextEncoder().encode('A'), 'a.pdf');
    const entryA = baseEntry(1, 'a.pdf', 1, { file: staleFile });
    const apiRef: Ref<UseMergeDraftResult> = { current: null };

    await mount(apiRef, baseOptions({ entries: [entryA], plan: planForFile(1, 1), autosaveDebounceMs: 40 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(40 + 1); await staleFile.started; });
    // entryA's buildRecord is now stuck awaiting arrayBuffer(); nothing has
    // reached saveDraft yet for this revision.
    expect(api(apiRef).draftSaveState).toBe('pending');

    const entryB = baseEntry(2, 'b.pdf', 1);
    await act(async () => {
      render(<Harness apiRef={apiRef} options={baseOptions({ entries: [entryB], plan: planForFile(2, 1), autosaveDebounceMs: 40 })} />, container);
    });
    // A distinct snapshot bumps the revision; the derived state must read
    // "pending" for the new revision immediately, not the old one's state
    // (which was also "pending", but for a write that will never resolve).
    expect(api(apiRef).draftSaveState).toBe('pending');

    await flushDebounce(40);
    expect(api(apiRef).draftSaveState).toBe('saved');

    // The stale write now finishes. Its completion is for a revision that is
    // no longer current, so it must not be allowed to change the state.
    await act(async () => {
      staleFile.release();
      await drainPromises();
    });
    // The stale write still lands in the store (IndexedDB writes cannot be cancelled): a stored 'a.pdf' means
    // it is done, so its completion has had its chance to repaint the state. One more turn runs its tail.
    let staleStored = false;
    await waitUntil(() => {
      void loadDraft('merge').then((record) => { staleStored = record?.files?.[0]?.fileName === 'a.pdf'; });
      return staleStored;
    });
    await drain();
    expect(api(apiRef).draftSaveState).toBe('saved');
  });

  it('clearDraft deletes the pointer (MEM-01: the entry itself stays in recents)', async () => {
    const entry = baseEntry(1, 'a.pdf', 1);
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ entries: [entry], plan: planForFile(1, 1), autosaveDebounceMs: 40 }));
    await flushDebounce(40);
    expect(await loadDraft('merge')).not.toBeNull();

    await act(async () => {
      await api(apiRef).clearDraft();
    });

    // loadDraft('merge') follows the pointer, which clearDraft just dropped -
    // it reads null even though the entry and its bytes are still in recents.
    expect(await loadDraft('merge')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:current:merge')).toBeNull();
  });

  // MEM-02: the test above proves the pointer is gone; this one proves the
  // other half of "Clear all" - the entry itself, the file set's bytes, stays
  // a recoverable recent (MEM-01's entry model: Clear all only ever drops
  // Merge's own work + pointer, never the file). Mirrors
  // draftStore.test.js's "deleteDraft on a Merge entry ... keeps the file in
  // recents with an empty work map", driven through the hook instead of the
  // store directly.
  it('clearDraft ("Clear all") leaves the file set in recents with an empty work map', async () => {
    const entry = baseEntry(1, 'a.pdf', 1);
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({ entries: [entry], plan: planForFile(1, 1), autosaveDebounceMs: 40 }));
    await flushDebounce(40);
    const id = await sourceIdForFiles([{ fileBytes: await entry.file.arrayBuffer() }]);

    await act(async () => {
      await api(apiRef).clearDraft();
    });

    const recovered = await loadRecentFile(id);
    expect(recovered).not.toBeNull();
    expect(recovered?.files).toHaveLength(1);
    expect(new TextDecoder().decode(recovered?.files?.[0]?.fileBytes)).toBe('%PDF-1.4 a.pdf');
    expect(recovered?.work).toEqual({});
  });

  // DEBT-13: replaces merge-restore.spec.js's "moving the pointer to a second
  // file set and back leaves the first set's rotation untouched" e2e test -
  // MEM-02's pointer model (setCurrentEntry/readCurrentEntryId, a
  // content-addressed entry per file set) is plain localStorage plus
  // fake-indexeddb, nothing a real browser tab uniquely provides, so the same
  // round trip proves it here: saveDraft twice (each call points 'merge' at
  // whichever entry it just wrote, exactly like opening a different file set
  // through the home page), then setCurrentEntry back to the first entry's id
  // (what clicking its tile does under the hood) and confirm its plan is
  // exactly as saved - the second entry never touched it.
  it('moving the pointer to a second entry and back leaves the first entry\'s plan untouched', async () => {
    await saveDraft('merge', {
      files: [
        { fileName: 'one.pdf', fileType: 'application/pdf', fileBytes: new TextEncoder().encode('one').buffer },
        { fileName: 'two.pdf', fileType: 'application/pdf', fileBytes: new TextEncoder().encode('two').buffer },
      ],
      plan: [
        { key: '0:0', fileId: 0, pageIndex: 0, rotation: 90, skipped: false },
        { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: false },
      ],
      options: { addPageNumbers: false },
      fileName: 'merged_one',
      schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    });
    const entryAId = readCurrentEntryId('merge');
    expect(entryAId).toBeTruthy();
    if (!entryAId) throw new Error('saveDraft did not point merge at an entry');

    // A second, unrelated file set - saving it moves the 'merge' pointer.
    await saveDraft('merge', {
      files: [{ fileName: 'three.pdf', fileType: 'application/pdf', fileBytes: new TextEncoder().encode('three').buffer }],
      plan: [{ key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false }],
      options: {},
      fileName: 'three',
      schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    });
    expect(readCurrentEntryId('merge')).not.toBe(entryAId);

    setCurrentEntry('merge', entryAId);
    const restored = await loadDraft('merge');
    expect(restored?.plan).toEqual([
      { key: '0:0', fileId: 0, pageIndex: 0, rotation: 90, skipped: false },
      { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: false },
    ]);
  });

  it('reads each entry\'s bytes only once across several autosaves', async () => {
    const spy = vi.spyOn(File.prototype, 'arrayBuffer');
    const entryA = baseEntry(1, 'a.pdf', 1);
    const entryB = baseEntry(2, 'b.pdf', 1);
    const apiRef: Ref<UseMergeDraftResult> = { current: null };

    await mount(apiRef, baseOptions({ entries: [entryA], plan: planForFile(1, 1), autosaveDebounceMs: 40 }));
    await flushDebounce(40);
    expect(spy).toHaveBeenCalledTimes(1);

    // Only the remembered option changes; entryA's bytes must not be re-read.
    await act(async () => {
      render(<Harness apiRef={apiRef} options={baseOptions({
        entries: [entryA], plan: planForFile(1, 1), options: { addPageNumbers: true }, autosaveDebounceMs: 40,
      })} />, container);
    });
    await flushDebounce(40);
    expect(spy).toHaveBeenCalledTimes(1);

    // A second file arrives: only its own bytes are newly read.
    await act(async () => {
      render(<Harness apiRef={apiRef} options={baseOptions({
        entries: [entryA, entryB],
        plan: [...planForFile(1, 1), ...planForFile(2, 1)],
        options: { addPageNumbers: true },
        autosaveDebounceMs: 40,
      })} />, container);
    });
    await flushDebounce(40);
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });
  // MEM-10: an update reload must verify the pending save is written first.
  it('flushBeforeUpdateReload writes the pending edit before the debounce and waits for the write', async () => {
    const held = new HeldFile(new TextEncoder().encode('%PDF-1.4 a.pdf'), 'a.pdf');
    const entry = baseEntry(1, 'a.pdf', 1, { file: held });
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    // A debounce far longer than the test: only the reload flush can write.
    await mount(apiRef, baseOptions({
      entries: [entry], plan: planForFile(1, 1), title: 'latest-title', autosaveDebounceMs: 60000,
    }));
    expect(await loadDraft('merge')).toBeNull();

    let done = false;
    const reload = flushBeforeUpdateReload().then(() => { done = true; });
    await act(async () => { await held.started; await drainPromises(); });
    expect(done).toBe(false);

    await act(async () => { held.release(); await reload; });
    expect(done).toBe(true);
    expect((await storedDraft()).fileName).toBe('latest-title');
  });

  it('flushBeforeUpdateReload writes nothing after unmount', async () => {
    const apiRef: Ref<UseMergeDraftResult> = { current: null };
    await mount(apiRef, baseOptions({
      entries: [baseEntry(1, 'a.pdf', 1)], plan: planForFile(1, 1), autosaveDebounceMs: 60000,
    }));
    act(() => render(null, container));
    await flushBeforeUpdateReload();
    expect(await loadDraft('merge')).toBeNull();
  });
});
