import { render } from 'preact';
import { act } from 'preact/test-utils';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { setScreen } from '../../test/support/screen.ts';
import { holdDraftStore } from './heldStore.test-helper.ts';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { PDFDocument } from '@cantoo/pdf-lib';
import '../../test/support/realPdfjs.ts';
import { useDraftPersistence } from './useDraftPersistence.js';
import { DRAFT_SCHEMA_VERSION } from './draftPolicy.js';
import { flushBeforeUpdateReload, isUpdateHeld } from '../appUpdate/updateHolds.ts';

// A storage write can fail (quota, private browsing, a closed IndexedDB
// connection) without throwing - draftStore.saveDraft resolves `false` rather
// than rejecting. draftSaveState must report that as 'error', never 'saved':
// this is the behavior TODO.md's SIGN-06 asked for.

// The draft store runs for real on fake-indexeddb, with the real arrival note and update holds around it. The spy
// lets a test see which calls happened; a failed write is a real one (an element structured clone refuses), a held
// write is a real held transaction, and the browser's persistence answer is forced.
vi.mock('./draftStore.ts', { spy: true });

import { renderDraftPreview } from '../pdf/thumbnails.js';
import { saveDraft, attachDraftPreview, isStoragePersisted, loadDraft, readRecentFiles, cacheRecentFile, hasDraftHint } from './draftStore.ts';
import { takeArrival, noteRecentOpen, resetFileArrivalForTests } from '../handoff/fileArrival.ts';

// A real store, empty, for every test.
beforeEach(() => {
  indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(saveDraft).mockReset();
  vi.mocked(loadDraft).mockReset();
  vi.mocked(isStoragePersisted).mockReset();
  vi.mocked(attachDraftPreview).mockClear();
});

// A real one-page PDF of the given size, as a file and as the bytes the draft keeps. Two sizes draw two different
// previews, and the expected preview is whatever the real renderDraftPreview makes of the same file.
async function realPdf(name, width, height) {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  const bytes = await doc.save();
  const file = new File([bytes], name, { type: 'application/pdf' });
  return { file, fileBytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), expectedPreview: await renderDraftPreview(file) };
}

// The debounce is the only clock a test moves; the store's own async work (fake-indexeddb) keeps real
// timers, so only these are faked.
const useDebounceClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

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

// Moves the debounce clock past the save delay. What the save then does is awaited on its own signal.
async function passDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
}
// For a test that expects no write: the debounce has passed and every promise already queued has run.
async function passDebounceAndDrain() {
  await passDebounce();
  await act(async () => { await drainPromises(); });
}
const stateIs = (apiRef, state) => waitUntil(() => expect(apiRef.current.result.draftSaveState).toBe(state));

// The newest write has answered and the hook has taken the answer in.
const saveSettled = () => act(async () => {
  await vi.mocked(saveDraft).mock.results.at(-1).value;
  await drainPromises();
});

// A function in an element: structured clone refuses it, so the real write to IndexedDB fails and saveDraft answers false.
const UNSAVABLE = { unsavable: () => {} };

function renderFirstEdit(apiRef, props, container, extra = {}) {
  act(() => {
    render(<Harness apiRef={apiRef} props={{ ...props, isDirty: true, elements: [{ id: 'first-edit', ...extra }] }} />, container);
  });
}

describe('useDraftPersistence - save outcome reporting', () => {
  let container;
  let apiRef;
  const mount = (props) => act(() => { render(<Harness apiRef={apiRef} props={props} />, container); });
  const edit = (props, id, extra = {}) => act(() => {
    render(<Harness apiRef={apiRef} props={{ ...props, isDirty: true, elements: [{ id, ...extra }] }} />, container);
  });

  beforeEach(() => {
    useDebounceClock();
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.useRealTimers();
  });

  it('keeps a preview that finishes before the debounced save writes its older snapshot', async () => {
    const { file, fileBytes, expectedPreview } = await realPdf('contract.pdf', 100, 200);
    expect(expectedPreview).toMatch(/^data:image\/jpeg;base64,/);
    const props = baseProps({ file, fileBytes });
    await act(async () => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    // The preview is drawn and stored with the opened file before the first edit's debounce ends.
    await waitUntil(() => expect(readRecentFiles().map((entry) => entry.preview)).toEqual([expectedPreview]));
    renderFirstEdit(apiRef, props, container);
    await passDebounce();
    await stateIs(apiRef, 'saved');
    await act(async () => { await drainPromises(); });
    expect(attachDraftPreview).toHaveBeenLastCalledWith('sign', expectedPreview);
    expect(vi.mocked(attachDraftPreview).mock.invocationCallOrder.at(-1)).toBeGreaterThan(vi.mocked(saveDraft).mock.invocationCallOrder.at(-1));
  });

  it('reports "saved" only once the underlying write actually succeeds', async () => {
    const props = baseProps();
    mount(props);
    expect(apiRef.current.result.draftSaveState).toBe('idle');
    renderFirstEdit(apiRef, props, container);
    expect(apiRef.current.result.draftSaveState).toBe('pending');

    await passDebounce();
    await stateIs(apiRef, 'saved');

    expect(saveDraft).toHaveBeenCalled();
    expect(vi.mocked(saveDraft).mock.calls[0][1]).toMatchObject({ schemaVersion: DRAFT_SCHEMA_VERSION });
    expect(hasDraftHint('sign')).toBe(true);
  });

  it('reports "error", never "saved", when the write fails without throwing', async () => {
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container, UNSAVABLE);

    await passDebounce();
    await saveSettled();
    expect(apiRef.current.result.draftSaveState).toBe('error');

    expect(saveDraft).toHaveBeenCalled();
  });

  it('reports "error", never "saved", when the write rejects', async () => {
    vi.mocked(saveDraft).mockRejectedValue(new Error('storage unavailable')); // forced: saveDraft answers false for every store failure it knows, but useDraftSave's catch also covers build() and the preview attach, and saveDraft's post-commit index writes are not proven non-throwing
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);

    await passDebounce();
    await stateIs(apiRef, 'error');
  });

  it('holds an update only while a save has failed (MEM-10)', async () => {
    const props = baseProps();
    mount(props);
    expect(isUpdateHeld()).toBe(false);
    renderFirstEdit(apiRef, props, container);
    await passDebounce();
    await stateIs(apiRef, 'saved');
    expect(isUpdateHeld()).toBe(false);

    edit(props, 'second-edit', UNSAVABLE);
    await passDebounce();
    await saveSettled();
    expect(apiRef.current.result.draftSaveState).toBe('error');
    expect(isUpdateHeld()).toBe(true);

    edit(props, 'third-edit');
    await passDebounce();
    await stateIs(apiRef, 'saved');
    expect(isUpdateHeld()).toBe(false);
  });

  it('never persists or claims "saved" outside editing status', async () => {
    mount(baseProps({ status: 'signing' }));
    expect(apiRef.current.result.draftSaveState).toBe('idle');

    await passDebounceAndDrain();

    expect(saveDraft).not.toHaveBeenCalled();
    expect(readRecentFiles()).toEqual([]);
    expect(apiRef.current.result.draftSaveState).toBe('idle');
  });

  it('does not write or announce a save for an unedited opened file', async () => {
    mount(baseProps());

    await passDebounceAndDrain();

    expect(saveDraft).not.toHaveBeenCalled();
    expect(apiRef.current.result.draftSaveState).toBe('idle');
  });

  it('does not let an older successful write mark a newer failed revision saved', async () => {
    // The older write waits behind a held transaction; the newer one is refused before it reaches the store, because
    // its bytes are not an ArrayBuffer.
    const hold = await holdDraftStore();
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    const firstRevision = apiRef.current.result.draftSaveRevision;
    await passDebounce();

    edit({ ...props, fileBytes: new Uint8Array(4) }, 'newer-edit');
    expect(apiRef.current.result.draftSaveRevision).toBeGreaterThan(firstRevision);
    await passDebounce();
    await saveSettled();
    expect(apiRef.current.result.draftSaveState).toBe('error');

    await act(async () => {
      await hold.release();
      expect(await vi.mocked(saveDraft).mock.results[0].value).toBe(true);
      await drainPromises();
    });
    expect(apiRef.current.result.draftSaveState).toBe('error');
  });

  it('never flushes an untouched restored document on hide or page exit', async () => {
    // Forced: jsdom cannot hide a page.
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      mount(baseProps({ elements: [{ id: 'restored-edit' }], isDirty: false }));
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pagehide'));
      });
      await passDebounceAndDrain();
      expect(saveDraft).not.toHaveBeenCalled();
      expect(apiRef.current.result.draftSaveState).toBe('idle');
    } finally {
      delete document.visibilityState; // the page's own answer, on the prototype, shows again
    }
  });

  it('writes the first genuine edit once even if pagehide beats its debounce', async () => {
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    act(() => window.dispatchEvent(new Event('pagehide')));
    await passDebounce();
    await stateIs(apiRef, 'saved');
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps an already-saved revision settled when pagehide fires later', async () => {
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    await passDebounce();
    await stateIs(apiRef, 'saved');

    act(() => window.dispatchEvent(new Event('pagehide')));
    await act(async () => { await drainPromises(); });

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(apiRef.current.result.draftSaveState).toBe('saved');
  });

  // MEM-10: an update reload must verify the pending save is written first.
  it('flushBeforeUpdateReload writes the pending edit and waits for the save to settle', async () => {
    // A real write transaction held open: the save waits behind it, as it would behind another tab's write.
    const hold = await holdDraftStore();
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    expect(saveDraft).not.toHaveBeenCalled();

    let done = false;
    const reload = flushBeforeUpdateReload().then(() => { done = true; });
    await act(async () => { await drainPromises(); });
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveDraft).mock.calls[0][1].elements).toEqual([{ id: 'first-edit' }]);
    await act(async () => { await drainPromises(); });
    expect(done).toBe(false);

    await act(async () => { await hold.release(); await reload; });
    expect(done).toBe(true);
    expect(readRecentFiles().map((entry) => entry.fileName)).toEqual(['contract.pdf']);
  });

  it('flushBeforeUpdateReload does nothing after unmount', async () => {
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    act(() => render(null, container));
    await flushBeforeUpdateReload();
    expect(saveDraft).not.toHaveBeenCalled();
  });
});

// SIGN-06 follow-up: the 'unpersisted' warning line. Scoped to an installed/
// home-screen app (see useDraftPersistence.js's isInstalledStandalone
// comment for why), so every test here sets the screen's display mode explicitly;
// jsdom has no navigator.standalone, so the display-mode query is the only reader that answers.
describe('useDraftPersistence - unpersisted-storage warning', () => {
  let container;
  let apiRef;

  function setStandalone(isStandalone) {
    setScreen({ displayMode: isStandalone ? 'standalone' : 'browser' });
  }

  beforeEach(() => {
    useDebounceClock();
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.useRealTimers();
  });

  // The persistence check is one more async hop, queued once the save has settled to 'saved'.
  const mount = (props) => act(() => { render(<Harness apiRef={apiRef} props={props} />, container); });
  // For a test that expects the state to stay 'saved': the save has landed, then the check's hops are drained.
  async function savedAndChecked() {
    await passDebounce();
    await stateIs(apiRef, 'saved');
    await act(async () => { await drainPromises(); });
  }

  it('never appears before a save has succeeded', async () => {
    setStandalone(true);
    vi.mocked(isStoragePersisted).mockResolvedValue(false); // forced: the browser says storage is not persisted
    // A real write held open for the whole test, so the save never finishes.
    await holdDraftStore();
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    expect(apiRef.current.result.draftSaveState).toBe('pending');

    await passDebounceAndDrain();
    // The save never succeeded, so the check must never even have run.
    expect(isStoragePersisted).not.toHaveBeenCalled();
    expect(apiRef.current.result.draftSaveState).toBe('pending');
  });

  it('shows the warning after a successful save, in an installed/standalone context, when storage is not persisted', async () => {
    setStandalone(true);
    vi.mocked(isStoragePersisted).mockResolvedValue(false); // forced: the browser says storage is not persisted
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    await passDebounce();
    await stateIs(apiRef, 'unpersisted');
  });

  it('never warns outside an installed/standalone context, even when storage is not persisted', async () => {
    setStandalone(false);
    vi.mocked(isStoragePersisted).mockResolvedValue(false); // forced: the browser says storage is not persisted
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    await savedAndChecked();

    expect(apiRef.current.result.draftSaveState).toBe('saved');
  });

  it('never warns on an "unknown" answer - a browser that cannot tell us is not evidence of anything', async () => {
    setStandalone(true);
    // The real answer here: jsdom has no navigator.storage, so the store says 'unknown'.
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    await savedAndChecked();

    expect(await vi.mocked(isStoragePersisted).mock.results[0].value).toBe('unknown');
    expect(apiRef.current.result.draftSaveState).toBe('saved');
  });

  it('lets a later real error win over an earlier unpersisted warning', async () => {
    setStandalone(true);
    vi.mocked(isStoragePersisted).mockResolvedValue(false); // forced: the browser says storage is not persisted
    const props = baseProps();
    mount(props);
    renderFirstEdit(apiRef, props, container);
    await passDebounce();
    await stateIs(apiRef, 'unpersisted');

    act(() => {
      render(<Harness apiRef={apiRef} props={{ ...props, isDirty: true, elements: [{ id: 'second-edit', ...UNSAVABLE }] }} />, container);
    });
    await passDebounce();
    await saveSettled();
    expect(apiRef.current.result.draftSaveState).toBe('error');
  });
});

// MEM-02: what a tool's save and restore return once two tools have touched the same entry. The store is the
// same real one as above; this block drives it through the hook end to end.
describe('useDraftPersistence - same file opened in two tools (real store)', () => {
  let container;
  const realDraftStore = { saveDraft, cacheRecentFile, hasDraftHint, loadDraft, readRecentFiles };
  const RealHarness = Harness;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  // fake-indexeddb answers on real macrotasks, so wait on the outcome with waitUntil (real clock),
  // never fake timers or a spin.
  const previewOf = (fileName) => () => realDraftStore.readRecentFiles().some((entry) => entry.fileName === fileName && entry.preview);

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

    const restoredOnce = Promise.withResolvers();
    const restores = [];
    const onRestore = (record) => { restores.push(record); restoredOnce.resolve(); };
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
    await act(async () => { await restoredOnce.promise; });

    expect(restores).toHaveLength(1);
    const restored = restores[0];
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

  // MEM-14: opening a second file kept the first file's tile on the home
  // page but gave it the second file's thumbnail. The preview landed on
  // whatever entry the pointer named, and the pointer only moves to the new
  // file once cacheRecentFile has hashed and stored it.
  it('opening a second file leaves the first file its own preview', async () => {
    const alpha = await realPdf('qa-alpha.pdf', 100, 200);
    const bravo = await realPdf('qa-bravo.pdf', 200, 100);
    expect(alpha.expectedPreview).not.toBe(bravo.expectedPreview);
    const props = ({ file, fileBytes }) => ({
      tool: 'sign',
      enabled: true,
      file,
      fileBytes,
      elements: [],
      extra: {},
      status: 'editing',
      onRestore: () => {},
    });
    const apiRef = { current: null };

    await act(async () => {
      render(<RealHarness apiRef={apiRef} props={props(alpha)} />, container);
    });
    await waitUntil(previewOf('qa-alpha.pdf'));

    await act(async () => {
      render(<RealHarness apiRef={apiRef} props={props(bravo)} />, container);
    });
    await waitUntil(previewOf('qa-bravo.pdf'));

    const previews = Object.fromEntries(realDraftStore.readRecentFiles().map((entry) => [entry.fileName, entry.preview]));
    expect(previews).toEqual({
      'qa-alpha.pdf': alpha.expectedPreview,
      'qa-bravo.pdf': bravo.expectedPreview,
    });
  });
});

describe('useDraftPersistence - how a restored file arrived (DEBT-58)', () => {
  let container;
  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    resetFileArrivalForTests();
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  // The hook says how the file came back; the tool marks it only if it really applies the restore,
  // since a pick or hand-off already under way wins over it (review of DEBT-58).
  const seedDraft = async () => {
    const saved = await saveDraft('sign', { fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: new TextEncoder().encode('%PDF-1.4 restored').buffer, elements: [], extra: {} });
    expect(saved).toBe(true);
    vi.mocked(loadDraft).mockClear();
  };
  // onRestore is the callback the tool supplies: here a recorder that resolves when the restore reaches it.
  // With no draft stored it never does, so that case waits for the store's one read and drains.
  const mountAndRead = async ({ expectRestore = true } = {}) => {
    const calls = [];
    const restored = Promise.withResolvers();
    const onRestore = (...args) => { calls.push(args); restored.resolve(); };
    await act(async () => {
      render(<Harness apiRef={{ current: null }} props={baseProps({ onRestore, file: null, fileBytes: null })} />, container);
    });
    if (expectRestore) await act(async () => { await restored.promise; });
    else await act(async () => { await vi.mocked(loadDraft).mock.results[0].value; await drainPromises(); });
    expect(takeArrival()).toBeUndefined();
    return calls;
  };

  it('hands a plain draft restore on as restore, marking nothing itself', async () => {
    await seedDraft();
    const calls = await mountAndRead();
    expect(calls).toEqual([[expect.objectContaining({ fileName: 'a.pdf' }), 'restore']]);
  });

  it('hands a restore the home page asked for from a recent tile on as recent', async () => {
    await seedDraft();
    noteRecentOpen('sign');
    const calls = await mountAndRead();
    expect(calls).toEqual([[expect.objectContaining({ fileName: 'a.pdf' }), 'recent']]);
  });

  it('spends the recent-tile note even when there is no draft, so a later reopen is not called recent', async () => {
    noteRecentOpen('sign');
    const calls = await mountAndRead({ expectRestore: false });
    expect(calls).toEqual([]);
    expect(sessionStorage.getItem('pdkef:arrival:recent')).toBeNull();
  });
});
