import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
// Only the "real store" describe block at the bottom of this file touches
// IndexedDB - every other test here mocks draftStore.js outright (see below)
// - but fake-indexeddb/auto is a global, side-effecting install, so it is
// imported once up top rather than inside that one block.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { useDraftPersistence } from './useDraftPersistence.js';
import { DRAFT_SCHEMA_VERSION } from './draftPolicy.js';

// A storage write can fail (quota, private browsing, a closed IndexedDB
// connection) without throwing - draftStore.saveDraft resolves `false` rather
// than rejecting. draftSaveState must report that as 'error', never 'saved':
// this is the behavior TODO.md's SIGN-06 asked for, already implemented in
// useDraftPersistence.js's persist(), but previously unguarded by any test.

vi.mock('./draftStore.js', () => ({
  saveDraft: vi.fn(),
  attachDraftPreview: vi.fn(),
  cacheRecentFile: vi.fn(() => Promise.resolve(true)),
  loadDraft: vi.fn(() => Promise.resolve(null)),
  deleteDraft: vi.fn(() => Promise.resolve(true)),
  hasDraftHint: vi.fn(() => false),
  subscribeToDraftChanges: vi.fn(() => () => {})
}));

// Not what this test is about - avoid a real pdf.js decode of fake PDF bytes.
vi.mock('../thumbnails.js', () => ({
  renderDraftPreview: vi.fn(() => Promise.resolve(null))
}));

import { renderDraftPreview } from '../thumbnails.js';
import { saveDraft, attachDraftPreview } from './draftStore.js';

function Harness({ apiRef, props }) {
  apiRef.current = { result: useDraftPersistence(props) };
  return null;
}

function baseProps(overrides = {}) {
  return {
    tool: 'sign',
    enabled: true,
    file: new File(['x'], 'contract.pdf', { type: 'application/pdf' }),
    fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
    elements: [],
    extra: {},
    status: 'editing',
    onRestore: () => {},
    ...overrides
  };
}

async function flushDebounceAndMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
  // The persist() promise chain (saveDraft -> then -> then) needs a couple of
  // real microtask turns to settle after the timer fires.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useDraftPersistence - save outcome reporting', () => {
  let container;
  let apiRef;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
    saveDraft.mockReset();
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.useRealTimers();
  });

  it('keeps a preview that finishes before the debounced save writes its older snapshot', async () => {
    saveDraft.mockResolvedValue(true);
    renderDraftPreview.mockResolvedValueOnce('data:image/jpeg;base64,preview');
    await act(async () => {
      render(<Harness apiRef={apiRef} props={baseProps()} />, container);
    });
    await flushDebounceAndMicrotasks();
    expect(attachDraftPreview).toHaveBeenLastCalledWith('sign', 'data:image/jpeg;base64,preview');
    expect(attachDraftPreview.mock.invocationCallOrder.at(-1)).toBeGreaterThan(saveDraft.mock.invocationCallOrder.at(-1));
  });

  it('reports "saved" only once the underlying write actually succeeds', async () => {
    saveDraft.mockResolvedValue(true);
    act(() => {
      render(<Harness apiRef={apiRef} props={baseProps()} />, container);
    });
    expect(apiRef.current.result.draftSaveState).toBe('pending');

    await flushDebounceAndMicrotasks();

    expect(saveDraft).toHaveBeenCalled();
    expect(apiRef.current.result.draftSaveState).toBe('saved');
    expect(saveDraft.mock.calls[0][1]).toMatchObject({ schemaVersion: DRAFT_SCHEMA_VERSION });
  });

  it('reports "error", never "saved", when the write fails without throwing', async () => {
    saveDraft.mockResolvedValue(false);
    act(() => {
      render(<Harness apiRef={apiRef} props={baseProps()} />, container);
    });

    await flushDebounceAndMicrotasks();

    expect(saveDraft).toHaveBeenCalled();
    expect(apiRef.current.result.draftSaveState).toBe('error');
  });

  it('reports "error", never "saved", when the write rejects', async () => {
    saveDraft.mockRejectedValue(new Error('storage unavailable'));
    act(() => {
      render(<Harness apiRef={apiRef} props={baseProps()} />, container);
    });

    await flushDebounceAndMicrotasks();

    expect(apiRef.current.result.draftSaveState).toBe('error');
  });

  it('never persists or claims "saved" outside editing status', async () => {
    saveDraft.mockResolvedValue(true);
    act(() => {
      render(<Harness apiRef={apiRef} props={baseProps({ status: 'signing' })} />, container);
    });
    expect(apiRef.current.result.draftSaveState).toBe('idle');

    await flushDebounceAndMicrotasks();

    expect(saveDraft).not.toHaveBeenCalled();
    expect(apiRef.current.result.draftSaveState).toBe('idle');
  });

  it('does not let an older successful write mark a newer failed revision saved', async () => {
    let finishFirst;
    saveDraft
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce(false);
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    const firstRevision = apiRef.current.result.draftSaveRevision;
    await flushDebounceAndMicrotasks();

    act(() => {
      render(<Harness apiRef={apiRef} props={{ ...props, elements: [{ id: 'newer-edit' }] }} />, container);
    });
    expect(apiRef.current.result.draftSaveRevision).toBeGreaterThan(firstRevision);
    await flushDebounceAndMicrotasks();
    expect(apiRef.current.result.draftSaveState).toBe('error');

    await act(async () => {
      finishFirst(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apiRef.current.result.draftSaveState).toBe('error');
  });
});

// MEM-02: every test above mocks draftStore.js, which proves this hook wires
// saveDraft/loadDraft/deleteDraft correctly but cannot prove what those calls
// actually return once two tools have touched the same entry - that isolation
// lives in draftStore.js itself (see draftStore.test.js's "keeps two tools'
// work on the same entry side by side"). This block proves it end to end
// through the hook instead, against the real store: `vi.mock('./draftStore.js', ...)`
// above is hoisted above every import in this file, so the only way to get an
// unmocked instance for one block is to unmock it and re-import both modules
// fresh (`vi.resetModules()`) - the escape hatch useMergeDraft.test.tsx never
// needs because it never mocks the store to begin with. The statically
// imported `useDraftPersistence` used by every test above is a distinct,
// already-bound module instance from before this block ever runs, so it stays
// mocked regardless of what happens here.
describe('useDraftPersistence - same file opened in two tools (real store)', () => {
  let container;
  let realDraftStore;
  let RealHarness;

  beforeEach(async () => {
    vi.doUnmock('./draftStore.js');
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    // A fresh backing store per test, same reasoning as draftStore.test.js:
    // this database has no upgrade path by design, so a record left behind by
    // an earlier test would otherwise leak into the next one's "fresh
    // database" assumptions.
    indexedDB = new IDBFactory();
    realDraftStore = await import('./draftStore.js');
    const { useDraftPersistence: realUseDraftPersistence } = await import('./useDraftPersistence.js');
    RealHarness = ({ apiRef, props }) => {
      apiRef.current = { result: realUseDraftPersistence(props) };
      return null;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.unstubAllGlobals();
  });

  // fake-indexeddb schedules its own callbacks through setImmediate/setTimeout
  // (see useMergeDraft.test.tsx's note on the same hazard), so this waits on
  // the real clock rather than fake timers.
  const flushReal = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });

  it('opening a PDF in Redact that already has Sign work restores only work.redact, leaving Sign untouched', async () => {
    const fileBytes = new TextEncoder().encode('%PDF-1.4 shared between tools').buffer;
    await realDraftStore.saveDraft('sign', {
      fileName: 'shared.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: 'sig-1' }], extra: { actionHistory: ['sign-edit'] },
    });
    // Redact "opening" the same bytes without editing anything - exactly what
    // PdfRedactTool.tsx's loadPdf does via cacheRecentFile in its onDocument
    // callback - creates no work of its own, only the pointer and index row.
    await realDraftStore.cacheRecentFile('redact', { fileName: 'shared.pdf', fileType: 'application/pdf', fileBytes });
    expect(realDraftStore.hasDraftHint('redact')).toBe(true);

    const onRestore = vi.fn();
    const apiRef = { current: null };
    await act(async () => {
      render(<RealHarness apiRef={apiRef} props={{
        tool: 'redact',
        enabled: true,
        file: new File(['x'], 'shared.pdf', { type: 'application/pdf' }),
        fileBytes,
        elements: [],
        extra: {},
        status: 'editing',
        onRestore,
      }} />, container);
    });
    await flushReal();

    expect(onRestore).toHaveBeenCalledTimes(1);
    const restored = onRestore.mock.calls[0][0];
    // work.redact is absent on this entry, so the restored record carries
    // none of Sign's fields - never Sign's elements/extra leaking across.
    expect(restored.elements).toBeUndefined();
    expect(restored.extra).toBeUndefined();
    expect(restored.fileName).toBe('shared.pdf');

    // Sign's own work on the same entry is exactly as it was saved - opening
    // the file in Redact never touched it.
    const signRecord = await realDraftStore.loadDraft('sign');
    expect(signRecord.elements).toEqual([{ id: 'sig-1' }]);
    expect(signRecord.extra).toEqual({ actionHistory: ['sign-edit'] });
  });
});
