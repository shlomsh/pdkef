// @ts-nocheck - test-only, mirrors PageStrip.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
// fake-indexeddb, not a mock of draftStore.js: MERGE-13's own draftStore.test.js
// already covers the multi-file record shape against a real (in-memory)
// IndexedDB, and this file leans on that same backing so the restore and
// autosave tests below exercise the real saveDraft/loadDraft round-trip
// rather than an assumption about what they do.
//
// Real timers throughout, deliberately, rather than vi.useFakeTimers(): the
// fake-indexeddb polyfill schedules its own callbacks through
// setImmediate/setTimeout (see its lib/scheduling.js), which vitest's fake
// timers would also freeze, and every save/load/delete in this file goes
// through it - a fake clock would need advancing after every single
// IndexedDB call, not just the 700ms debounce. A short real wait is simpler
// and exactly what the MERGE-13 lane brief allows.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  useMergeDraft, MERGE_DRAFT_SCHEMA_VERSION,
} from './useMergeDraft.ts';
import {
  loadDraft, saveDraft, MERGE_DRAFT_MAX_BYTES,
} from '../../editor/workspace/draftStore.js';
import { planForFile } from '../../lib/mergePlan.ts';

function Harness({ apiRef, options }) {
  apiRef.current = useMergeDraft(options);
  return null;
}

function makeFile(name, content = `%PDF-1.4 ${name}`) {
  return new File([content], name, { type: 'application/pdf' });
}

function baseEntry(id, name, pageCount = 1, overrides = {}) {
  return {
    id, file: makeFile(name), pageCount, thumbnail: null, error: null, ...overrides,
  };
}

function baseOptions(overrides = {}) {
  return {
    enabled: true,
    entries: [],
    plan: [],
    options: { addPageNumbers: false },
    title: 'merged',
    onRestore: vi.fn(),
    ...overrides,
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The debounced autosave is a 700ms setTimeout followed by an async
// buildRecord (reads File bytes) / persist (writes through IndexedDB) chain;
// 850ms real time comfortably clears both.
async function flushDebounce() {
  await act(async () => { await wait(850); });
}

// A mount's restore effect kicks off an async IIFE that reads through real
// (fake-indexeddb) IndexedDB; a couple of real ticks let it settle before
// assertions run, the same reason FileDropzone.test.tsx's dropOn() waits
// after dispatching a drop. Two separate `act()` calls, deliberately: an
// async callback only flushes effects once the callback itself resolves (see
// preact/test-utils' `act`), so a `wait()` placed inside the same call as
// `render()` would delay the mount effect - the one that starts the restore
// IIFE - rather than give it time to finish.
async function mount(apiRef, options) {
  act(() => {
    render(<Harness apiRef={apiRef} options={options} />, container);
  });
  await act(async () => { await wait(50); });
}

let container;

describe('useMergeDraft', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-draft-hint');
    vi.stubGlobal('crypto', webcrypto);
    // A fresh backing store per test - draftStore.js's database has no
    // upgrade path by design, so a record left behind by an earlier test
    // would otherwise leak into the next one's "fresh database" assumptions.
    indexedDB = new IDBFactory();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.documentElement.removeAttribute('data-draft-hint');
  });

  it('starts idle with no draft hint, and never calls onRestore', async () => {
    const onRestore = vi.fn();
    const apiRef = { current: null };
    await mount(apiRef, baseOptions({ onRestore }));

    expect(apiRef.current.isRestoring).toBe(false);
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
      fileName: 'invoice + 1 more',
      pageCount: 1,
      fileCount: 2,
      schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    });

    const onRestore = vi.fn();
    const apiRef = { current: null };
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
    expect(apiRef.current.isRestoring).toBe(false);
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

    const onRestore = vi.fn();
    const apiRef = { current: null };
    await mount(apiRef, baseOptions({ onRestore }));

    expect(onRestore).not.toHaveBeenCalled();
    expect(await loadDraft('merge')).toBeNull();
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
    expect(apiRef.current.isRestoring).toBe(false);
  });

  it('autosaves 700ms after entries/plan/options change, indexing the plan by array position', async () => {
    const entries = [baseEntry(10, 'invoice.pdf', 2), baseEntry(20, 'receipt.pdf', 1)];
    const plan = [
      { key: '10:0', fileId: 10, pageIndex: 0, rotation: 0, skipped: false },
      { key: '10:1', fileId: 10, pageIndex: 1, rotation: 0, skipped: true },
      { key: '20:0', fileId: 20, pageIndex: 0, rotation: 90, skipped: false },
    ];
    const apiRef = { current: null };
    await mount(apiRef, baseOptions({ entries, plan, title: 'invoice + 1 more' }));
    expect(apiRef.current.draftSaveState).toBe('pending');

    await flushDebounce();

    expect(apiRef.current.draftSaveState).toBe('saved');
    const record = await loadDraft('merge');
    expect(record.files.map((f) => f.fileName)).toEqual(['invoice.pdf', 'receipt.pdf']);
    // Stable per-entry ids (10, 20) become plain array indices in the saved plan.
    expect(record.plan).toEqual([
      { key: '10:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false },
      { key: '10:1', fileId: 0, pageIndex: 1, rotation: 0, skipped: true },
      { key: '20:0', fileId: 1, pageIndex: 0, rotation: 90, skipped: false },
    ]);
    expect(record.fileName).toBe('invoice + 1 more');
    expect(record.pageCount).toBe(2); // two of the three plan entries are not skipped
    expect(record.fileCount).toBe(2);
  });

  it('reports "error" when saveDraft cannot persist (an oversized set, MERGE-13\'s honest limit)', async () => {
    const entry = baseEntry(1, 'huge.pdf', 1);
    // A fake byteLength, not a real 200MB allocation: saveMultiFileDraft sums
    // fileBytes.byteLength before it ever hashes the bytes, exactly like
    // draftStore.test.js's own "over MERGE_DRAFT_MAX_BYTES" case.
    vi.spyOn(entry.file, 'arrayBuffer').mockResolvedValue({ byteLength: MERGE_DRAFT_MAX_BYTES + 1 });
    const apiRef = { current: null };
    await mount(apiRef, baseOptions({ entries: [entry], plan: planForFile(1, 1) }));

    await flushDebounce();

    expect(apiRef.current.draftSaveState).toBe('error');
    expect(await loadDraft('merge')).toBeNull();
  });

  it('keeps a new revision "pending" while an older write is still resolving, and the stale completion cannot regress it', async () => {
    let resolveStaleRead;
    const entryA = baseEntry(1, 'a.pdf', 1);
    vi.spyOn(entryA.file, 'arrayBuffer').mockImplementation(
      () => new Promise((resolve) => { resolveStaleRead = resolve; }),
    );
    const apiRef = { current: null };

    await mount(apiRef, baseOptions({ entries: [entryA], plan: planForFile(1, 1) }));
    await act(async () => { await wait(850); });
    // entryA's buildRecord is now stuck awaiting arrayBuffer(); nothing has
    // reached saveDraft yet for this revision.
    expect(apiRef.current.draftSaveState).toBe('pending');

    const entryB = baseEntry(2, 'b.pdf', 1);
    await act(async () => {
      render(<Harness apiRef={apiRef} options={baseOptions({ entries: [entryB], plan: planForFile(2, 1) })} />, container);
    });
    // A distinct snapshot bumps the revision; the derived state must read
    // "pending" for the new revision immediately, not the old one's state
    // (which was also "pending", but for a write that will never resolve).
    expect(apiRef.current.draftSaveState).toBe('pending');

    await flushDebounce();
    expect(apiRef.current.draftSaveState).toBe('saved');

    // The stale write now finishes. Its completion is for a revision that is
    // no longer current, so it must not be allowed to change the state.
    await act(async () => {
      resolveStaleRead(new TextEncoder().encode('A').buffer);
      await wait(50);
    });
    expect(apiRef.current.draftSaveState).toBe('saved');
  });

  it('clearDraft deletes the record and the hint', async () => {
    const entry = baseEntry(1, 'a.pdf', 1);
    const apiRef = { current: null };
    await mount(apiRef, baseOptions({ entries: [entry], plan: planForFile(1, 1) }));
    await flushDebounce();
    expect(await loadDraft('merge')).not.toBeNull();

    await act(async () => {
      await apiRef.current.clearDraft();
    });

    expect(await loadDraft('merge')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:has-draft:merge')).toBeNull();
  });

  it('reads each entry\'s bytes only once across several autosaves', async () => {
    const spy = vi.spyOn(File.prototype, 'arrayBuffer');
    const entryA = baseEntry(1, 'a.pdf', 1);
    const entryB = baseEntry(2, 'b.pdf', 1);
    const apiRef = { current: null };

    await mount(apiRef, baseOptions({ entries: [entryA], plan: planForFile(1, 1) }));
    await flushDebounce();
    expect(spy).toHaveBeenCalledTimes(1);

    // Only the remembered option changes; entryA's bytes must not be re-read.
    await act(async () => {
      render(<Harness apiRef={apiRef} options={baseOptions({ entries: [entryA], plan: planForFile(1, 1), options: { addPageNumbers: true } })} />, container);
    });
    await flushDebounce();
    expect(spy).toHaveBeenCalledTimes(1);

    // A second file arrives: only its own bytes are newly read.
    await act(async () => {
      render(<Harness apiRef={apiRef} options={baseOptions({
        entries: [entryA, entryB],
        plan: [...planForFile(1, 1), ...planForFile(2, 1)],
        options: { addPageNumbers: true },
      })} />, container);
    });
    await flushDebounce();
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });
});
