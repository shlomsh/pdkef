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
  subscribeToDraftChanges: vi.fn(() => () => {}),
  // 'unknown' by default (the "browser cannot tell us" case) so every test
  // above that never touches persistence keeps its existing 'saved'
  // expectations - only the describe block below overrides this to prove the
  // unpersisted-warning path itself.
  isStoragePersisted: vi.fn(() => Promise.resolve('unknown')),
}));

// Not what this test is about - avoid a real pdf.js decode of fake PDF bytes.
vi.mock('../thumbnails.js', () => ({
  renderDraftPreview: vi.fn(() => Promise.resolve(null))
}));

import { renderDraftPreview } from '../thumbnails.js';
import { saveDraft, attachDraftPreview, isStoragePersisted } from './draftStore.js';

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

function renderFirstEdit(apiRef, props, container) {
  act(() => {
    render(<Harness apiRef={apiRef} props={{ ...props, isDirty: true, elements: [{ id: 'first-edit' }] }} />, container);
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
    const props = baseProps();
    await act(async () => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);
    await flushDebounceAndMicrotasks();
    expect(attachDraftPreview).toHaveBeenLastCalledWith('sign', 'data:image/jpeg;base64,preview');
    expect(attachDraftPreview.mock.invocationCallOrder.at(-1)).toBeGreaterThan(saveDraft.mock.invocationCallOrder.at(-1));
  });

  it('reports "saved" only once the underlying write actually succeeds', async () => {
    saveDraft.mockResolvedValue(true);
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    expect(apiRef.current.result.draftSaveState).toBe('idle');
    renderFirstEdit(apiRef, props, container);
    expect(apiRef.current.result.draftSaveState).toBe('pending');

    await flushDebounceAndMicrotasks();

    expect(saveDraft).toHaveBeenCalled();
    expect(apiRef.current.result.draftSaveState).toBe('saved');
    expect(saveDraft.mock.calls[0][1]).toMatchObject({ schemaVersion: DRAFT_SCHEMA_VERSION });
  });

  it('reports "error", never "saved", when the write fails without throwing', async () => {
    saveDraft.mockResolvedValue(false);
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);

    await flushDebounceAndMicrotasks();

    expect(saveDraft).toHaveBeenCalled();
    expect(apiRef.current.result.draftSaveState).toBe('error');
  });

  it('reports "error", never "saved", when the write rejects', async () => {
    saveDraft.mockRejectedValue(new Error('storage unavailable'));
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);

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

  it('does not write or announce a save for an unedited opened file', async () => {
    saveDraft.mockResolvedValue(true);
    act(() => {
      render(<Harness apiRef={apiRef} props={baseProps()} />, container);
    });

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
    renderFirstEdit(apiRef, props, container);
    const firstRevision = apiRef.current.result.draftSaveRevision;
    await flushDebounceAndMicrotasks();

    act(() => {
      render(<Harness apiRef={apiRef} props={{ ...props, isDirty: true, elements: [{ id: 'newer-edit' }] }} />, container);
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

  it('never flushes an untouched restored document on hide or page exit', async () => {
    saveDraft.mockResolvedValue(true);
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      act(() => {
        render(<Harness apiRef={apiRef} props={baseProps({ elements: [{ id: 'restored-edit' }], isDirty: false })} />, container);
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pagehide'));
      });
      await flushDebounceAndMicrotasks();
      expect(saveDraft).not.toHaveBeenCalled();
      expect(apiRef.current.result.draftSaveState).toBe('idle');
    } finally {
      if (visibilityDescriptor) Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
    }
  });

  it('writes the first genuine edit once even if pagehide beats its debounce', async () => {
    saveDraft.mockResolvedValue(true);
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);
    act(() => window.dispatchEvent(new Event('pagehide')));
    await flushDebounceAndMicrotasks();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(apiRef.current.result.draftSaveState).toBe('saved');
  });

  it('keeps an already-saved revision settled when pagehide fires later', async () => {
    saveDraft.mockResolvedValue(true);
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);
    await flushDebounceAndMicrotasks();
    expect(apiRef.current.result.draftSaveState).toBe('saved');

    act(() => window.dispatchEvent(new Event('pagehide')));
    await act(async () => Promise.resolve());

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(apiRef.current.result.draftSaveState).toBe('saved');
  });
});

// SIGN-06 follow-up: the 'unpersisted' warning line. Scoped to an installed/
// home-screen app (see useDraftPersistence.js's isInstalledStandalone
// comment for why), so every test here controls window.matchMedia and
// navigator.standalone explicitly rather than relying on src/test/setup.js's
// default matchMedia stub (which answers 'matches' to every query, i.e. the
// desktop/standalone-looking path - see its own comment).
describe('useDraftPersistence - unpersisted-storage warning', () => {
  let container;
  let apiRef;
  let originalMatchMedia;
  let originalStandalone;

  function stubStandalone(isStandalone) {
    window.matchMedia = vi.fn(() => ({ matches: isStandalone }));
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: undefined });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
    saveDraft.mockReset();
    isStoragePersisted.mockReset();
    isStoragePersisted.mockResolvedValue('unknown');
    originalMatchMedia = window.matchMedia;
    originalStandalone = Object.getOwnPropertyDescriptor(navigator, 'standalone');
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
    if (originalStandalone) Object.defineProperty(navigator, 'standalone', originalStandalone);
    else delete navigator.standalone;
  });

  // Extra turns beyond flushDebounceAndMicrotasks: the persistence check
  // itself is one more async hop (isStoragePersisted().then(...)) queued
  // from an effect that only runs once saveState has settled to 'saved', and
  // Preact's own effect scheduling adds another microtask on top of that.
  async function flushPersistenceCheck() {
    await flushDebounceAndMicrotasks();
    await act(async () => {
      for (let i = 0; i < 6; i += 1) {
        // eslint-disable-next-line no-await-in-loop -- draining a fixed number of microtask turns is the point
        await Promise.resolve();
      }
    });
  }

  it('never appears before a save has succeeded', async () => {
    stubStandalone(true);
    isStoragePersisted.mockResolvedValue(false);
    saveDraft.mockImplementation(() => new Promise(() => {})); // never resolves
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);
    expect(apiRef.current.result.draftSaveState).toBe('pending');

    await flushPersistenceCheck();
    // The save never succeeded, so the check must never even have run.
    expect(isStoragePersisted).not.toHaveBeenCalled();
    expect(apiRef.current.result.draftSaveState).toBe('pending');
  });

  it('shows the warning after a successful save, in an installed/standalone context, when storage is not persisted', async () => {
    stubStandalone(true);
    isStoragePersisted.mockResolvedValue(false);
    saveDraft.mockResolvedValue(true);
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);
    await flushPersistenceCheck();

    expect(apiRef.current.result.draftSaveState).toBe('unpersisted');
  });

  it('never warns outside an installed/standalone context, even when storage is not persisted', async () => {
    stubStandalone(false);
    isStoragePersisted.mockResolvedValue(false);
    saveDraft.mockResolvedValue(true);
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);
    await flushPersistenceCheck();

    expect(apiRef.current.result.draftSaveState).toBe('saved');
  });

  it('never warns on an "unknown" answer - a browser that cannot tell us is not evidence of anything', async () => {
    stubStandalone(true);
    isStoragePersisted.mockResolvedValue('unknown');
    saveDraft.mockResolvedValue(true);
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);
    await flushPersistenceCheck();

    expect(apiRef.current.result.draftSaveState).toBe('saved');
  });

  it('lets a later real error win over an earlier unpersisted warning', async () => {
    stubStandalone(true);
    isStoragePersisted.mockResolvedValue(false);
    saveDraft.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    renderFirstEdit(apiRef, props, container);
    await flushPersistenceCheck();
    expect(apiRef.current.result.draftSaveState).toBe('unpersisted');

    act(() => {
      render(<Harness apiRef={apiRef} props={{ ...props, isDirty: true, elements: [{ id: 'second-edit' }] }} />, container);
    });
    await flushPersistenceCheck();

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
