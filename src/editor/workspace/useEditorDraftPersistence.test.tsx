import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The draft store runs for real on fake-indexeddb, with the real hand-off settle, arrival note and recents behind
// it. The spy lets a test see which calls happened; a record the store would never hand back, and a recents write
// held open, are forced on it. Forced: the preview would be drawn by real pdf.js from the test's fake '%PDF-1.4' bytes.
vi.mock('#lib/drafts/draftStore.ts', { spy: true });
vi.mock('#lib/pdf/thumbnails.js', { spy: true });

import { cacheRecentFile, commitHandoff, deleteDraft, loadDraft, peekHandoff, readRecentFiles, saveDraft, saveHandoff } from '#lib/drafts/draftStore.ts';
import { renderDraftPreview } from '#lib/pdf/thumbnails.js';
import { takeArrival, noteRecentOpen, resetFileArrivalForTests } from '#lib/handoff/fileArrival.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { useEditorDraftPersistence } from './useEditorDraftPersistence.ts';
import { DRAFT_SCHEMA_VERSION, isDraftElement, isEditorElement } from '../registry/draftValidation.ts';

// Mirrors PdfRedactTool.tsx's own `isRedactElement`: Redact only
// restores its four element types, so a foreign type (e.g. Sign's `text`)
// stored under the `redact` draft key is dropped by validateDraftElements
// rather than reaching render, where `createElementRenderers({})` would throw
// on it (DEBT-09).
const REDACT_ELEMENT_TYPES = new Set(['whiteout', 'blackout', 'blur', 'delete']);
function isRedactElement(value: unknown): value is { id: string; pageIndex: number; type: string } {
  return isDraftElement(value) && REDACT_ELEMENT_TYPES.has((value as { type: string }).type);
}

function Harness({ apiRef, props }: any) {
  apiRef.current = { result: useEditorDraftPersistence(props) };
  return null;
}

// The loader the tool supplies: a plain function that records its calls and resolves a promise when it is reached.
function loaderRecorder(onCall: () => void = () => {}) {
  const reached = Promise.withResolvers<void>();
  const calls: any[][] = [];
  const loadPdf: any = (...args: any[]) => { calls.push(args); onCall(); reached.resolve(); };
  loadPdf.calls = calls;
  loadPdf.reached = reached.promise;
  return loadPdf;
}

// A tool with no work to restore marks its first paint with this; the restore clears it once it has settled
// without handing over a document, which is the signal a test that expects no load waits for.
const hintSettled = () => waitUntil(() => !document.documentElement.hasAttribute('data-draft-hint'));
const markHint = () => document.documentElement.setAttribute('data-draft-hint', '1');

const bytesOf = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);
const pdfBytes = (text = '%PDF-1.4') => new TextEncoder().encode(text).buffer as ArrayBuffer;

// What an earlier session left behind: one draft the real store holds for the tool.
async function seedDraft(tool: string, record: Record<string, unknown>) {
  expect(await saveDraft(tool, { fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes: pdfBytes(), elements: [], extra: { actionHistory: [] }, ...record } as never)).toBe(true);
  vi.mocked(loadDraft).mockClear();
}

beforeEach(() => {
  indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(saveDraft).mockReset();
  vi.mocked(loadDraft).mockReset();
  vi.mocked(deleteDraft).mockClear();
  vi.mocked(peekHandoff).mockReset();
  vi.mocked(cacheRecentFile).mockReset();
  vi.mocked(commitHandoff).mockClear();
  // Forced: the test files are fake '%PDF-1.4' bytes that real pdf.js cannot draw
  vi.mocked(renderDraftPreview).mockReset().mockResolvedValue(null as never);
});

function baseProps(overrides: any = {}) {
  return {
    tool: 'redact',
    file: null,
    fileBytes: null,
    elements: [],
    actionHistory: [],
    status: 'idle',
    isDirty: false,
    loadStartedRef: { current: false },
    loadPdf: loaderRecorder(),
    isElement: isEditorElement,
    ...overrides,
  };
}

describe('useEditorDraftPersistence - restore migrates and validates', () => {
  let container: HTMLDivElement;
  const apiRef: any = { current: null };
  const mount = (props: any) => act(() => { render(<Harness apiRef={apiRef} props={props} />, container); });
  // The restore chain's real end: the draft hook reports settled once its run has returned.
  // drainPromises then lets work the chain queued behind it run before a test counts the calls.
  const restoreSettled = async () => {
    await waitUntil(() => apiRef.current?.result.settled);
    await act(async () => { await drainPromises(); });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.documentElement.removeAttribute('data-draft-hint');
    document.documentElement.removeAttribute('data-editor-restore');
  });

  it('calls loadPdf once with only the valid elements from a mixed record', async () => {
    const goodElement = { id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 20, text: 'Hello' };
    const garbageElement = { id: 'bad-1', type: 'not-a-real-type', pageIndex: 0 };
    await seedDraft('redact', { elements: [goodElement, garbageElement], fileBytes: pdfBytes('%PDF-1.4 mixed') });

    const props = baseProps();
    mount(props);
    await act(async () => { await props.loadPdf.reached; });
    await restoreSettled();

    expect(props.loadPdf.calls).toHaveLength(1);
    const [, calledBytes, initialState, restored] = props.loadPdf.calls[0];
    expect(bytesOf(calledBytes)).toBe('%PDF-1.4 mixed');
    expect(initialState.elements).toEqual([goodElement]);
    expect(restored).toBe(true);
  });

  it('restores a checkbox-sized mark with its snapped geometry intact', async () => {
    const checkboxMark = {
      id: 'health-checkbox-1', type: 'symbol', pageIndex: 0,
      // This is deliberately not a square percent box: its axes are scaled
      // from the detected 6.6pt square against an A4 page's two dimensions.
      left: 52.08, top: 42.19, width: 1.71, height: 1.21,
      mark: 'check', color: '#1463ff',
    };
    await seedDraft('sign', { fileName: 'health.pdf', elements: [checkboxMark] });

    const props = baseProps({ tool: 'sign' });
    mount(props);
    await act(async () => { await props.loadPdf.reached; });

    expect(props.loadPdf.calls[0][2].elements).toEqual([checkboxMark]);
  });

  it('treats a record failing the top-level check the same as no record at all', async () => {
    // forced: a record the real store never hands back (it saves whole records only)
    vi.mocked(loadDraft).mockResolvedValue({ fileName: 'contract.pdf', elements: [] } as never);
    markHint();

    const props = baseProps();
    mount(props);
    await hintSettled();

    expect(props.loadPdf.calls).toHaveLength(0);
  });

  it('discards invalid editor work and its first-paint markers so it cannot re-arm on the next visit', async () => {
    // The persistence hook has already established that bytes exist before it
    // calls onRestore. An empty filename therefore reaches editor validation
    // and represents a malformed record the generic store cannot diagnose.
    // forced: the real store would not keep a nameless record
    vi.mocked(loadDraft).mockResolvedValue({
      fileName: '',
      fileType: 'application/pdf',
      fileBytes: pdfBytes(),
      elements: [],
    } as never);
    markHint();
    document.documentElement.setAttribute('data-editor-restore', '1');

    const props = baseProps({ tool: 'redact' });
    mount(props);
    await hintSettled();
    // deleteDraft runs for real: the tool's work is gone from the store.
    await act(async () => { await vi.mocked(deleteDraft).mock.results[0].value; });

    expect(props.loadPdf.calls).toHaveLength(0);
    expect(deleteDraft).toHaveBeenCalledWith('redact');
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
    expect(document.documentElement.hasAttribute('data-editor-restore')).toBe(false);
  });

  it('forwards only validated, self-contained history commands to the editor loader', async () => {
    const element = { id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 20, text: 'Hello' };
    const command = {
      id: 'history-1',
      type: 'ADD_TEXT',
      operation: 'add',
      pageIndex: 0,
      description: 'Added text box',
      timestamp: 10,
      elements: [{ element, index: 0 }],
    };
    await seedDraft('redact', {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      elements: [element],
      extra: {
        actionHistory: [command, { ...command, id: 'bad-history', elements: [{ element, index: 'top' }] }],
      },
    });

    const props = baseProps();
    mount(props);
    await act(async () => { await props.loadPdf.reached; });

    const initialState = props.loadPdf.calls[0][2];
    expect(initialState.actionHistory).toEqual([command]);
  });

  it('drops a Sign-only element type from a redact record instead of restoring it', async () => {
    const textElement = { id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 20, text: 'Hello' };
    const blackoutElement = { id: 'blackout-1', type: 'blackout', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 };
    await seedDraft('redact', { elements: [textElement, blackoutElement] });

    const props = baseProps({ tool: 'redact', isElement: isRedactElement });
    mount(props);
    await act(async () => { await props.loadPdf.reached; });
    await restoreSettled();

    expect(props.loadPdf.calls).toHaveLength(1);
    expect(props.loadPdf.calls[0][2].elements).toEqual([blackoutElement]);
  });

  it('does not throw when loadDraft resolves with no record', async () => {
    markHint();
    const props = baseProps();
    await expect(
      (async () => {
        mount(props);
        await hintSettled();
      })(),
    ).resolves.not.toThrow();

    expect(props.loadPdf.calls).toHaveLength(0);
  });
});

describe('useEditorDraftPersistence - HERO-02 hand-off marker', () => {
  let container: HTMLDivElement;
  const root = document.documentElement;
  const record = () => ({
    fileName: 'merged.pdf',
    fileType: 'application/pdf',
    fileBytes: pdfBytes(),
  });
  const apiRef: any = { current: null };
  const mount = (props: any) => act(() => { render(<Harness apiRef={apiRef} props={props} />, container); });
  // The restore chain's real end: the draft hook reports settled once its run has returned.
  // drainPromises then lets work the chain queued behind it run before a test counts the calls.
  const restoreSettled = async () => {
    await waitUntil(() => apiRef.current?.result.settled);
    await act(async () => { await drainPromises(); });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root.setAttribute('data-handoff-pending', '1');
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    root.removeAttribute('data-handoff-pending');
    document.querySelectorAll('[data-tool-loaded]').forEach((n) => n.remove());
    sessionStorage.clear();
  });

  it('holds the marker until the editor shows the handed-over document, then releases it', async () => {
    await saveHandoff('sign', record());
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBe('1');
    const props = baseProps({ tool: 'sign' });
    mount(props);
    await act(async () => { await props.loadPdf.reached; });
    await restoreSettled();
    expect(props.loadPdf.calls).toHaveLength(1);
    expect(root.hasAttribute('data-handoff-pending')).toBe(true);
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBeNull();
    const shown = document.createElement('div');
    shown.setAttribute('data-tool-loaded', '');
    document.body.appendChild(shown);
    await waitUntil(() => !root.hasAttribute('data-handoff-pending'));
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
  });

  it('releases at once when there is nothing to take', async () => {
    sessionStorage.setItem('pdkef:handoff-pending:sign', '1');
    const props = baseProps({ tool: 'sign' });
    mount(props);
    await waitUntil(() => !root.hasAttribute('data-handoff-pending'));
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBeNull();
  });

  it('keeps the record and the marker until the PDF is in recents (reload-safe, 2026-11-12)', async () => {
    await saveHandoff('sign', record());
    const real = await vi.importActual<typeof import('#lib/drafts/draftStore.ts')>('#lib/drafts/draftStore.ts');
    const writeStarted = Promise.withResolvers<void>();
    const releaseWrite = Promise.withResolvers<void>();
    // forced: hold the recents write open, then let the real one run, so the window a reload lands in can be seen
    vi.mocked(cacheRecentFile).mockImplementationOnce(async (...args) => {
      writeStarted.resolve();
      await releaseWrite.promise;
      return real.cacheRecentFile(...args);
    });
    const props = baseProps({ tool: 'sign' });
    mount(props);
    await act(async () => { await writeStarted.promise; });
    // A reload here must find the record and the marker still in place.
    expect(cacheRecentFile).toHaveBeenCalled();
    expect(commitHandoff).not.toHaveBeenCalled();
    expect((await peekHandoff('sign'))?.fileName).toBe('merged.pdf');
    expect(readRecentFiles()).toEqual([]);
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBe('1');
    await act(async () => { releaseWrite.resolve(); await props.loadPdf.reached; });
    await restoreSettled();
    expect(commitHandoff).toHaveBeenCalledWith('sign');
    expect(await peekHandoff('sign')).toBeNull();
    expect(readRecentFiles().map((entry) => entry.fileName)).toEqual(['merged.pdf']);
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBeNull();
    expect(props.loadPdf.calls).toHaveLength(1);
  });

  it('releases on unmount before the read settles', async () => {
    await saveHandoff('sign', record());
    const props = baseProps({ tool: 'sign' });
    mount(props);
    // The store's read is real and still in flight here.
    expect(root.hasAttribute('data-handoff-pending')).toBe(true);
    act(() => render(null, container));
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
    // Let the read finish so nothing outlives the test.
    await act(async () => { await vi.mocked(peekHandoff).mock.results[0].value; await drainPromises(); });
  });
});

describe('useEditorDraftPersistence - arrival mark (DEBT-58)', () => {
  let container: HTMLDivElement;
  const record = (from?: string) => ({
    fileName: 'a.pdf',
    fileType: 'application/pdf',
    fileBytes: pdfBytes(),
    ...(from ? { from } : {}),
  });
  const mount = (props: any) => act(() => { render(<Harness apiRef={{ current: null }} props={props} />, container); });
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    resetFileArrivalForTests();
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  it('marks a hand-off as handoff with the sending tool, right before loadPdf', async () => {
    await saveHandoff('sign', record('merge'));
    let seen: unknown;
    const props = baseProps({ tool: 'sign', loadPdf: loaderRecorder(() => { seen = takeArrival(); }) });
    mount(props);
    await act(async () => { await props.loadPdf.reached; });
    expect(seen).toEqual({ source: 'handoff', from: 'merge' });
  });

  it('marks a restore with the source the draft hook gives, right before loadPdf', async () => {
    await seedDraft('sign', { fileName: 'a.pdf' });
    noteRecentOpen('sign');
    let seen: unknown;
    const apiRef = { current: null as any };
    const props = baseProps({ tool: 'sign', loadPdf: loaderRecorder(() => { seen = takeArrival(); }) });
    act(() => { render(<Harness apiRef={apiRef} props={props} />, container); });
    await act(async () => { await props.loadPdf.reached; });
    // Let the restore settle: a second load would take the (already consumed) mark again and overwrite what was seen.
    await waitUntil(() => apiRef.current?.result.settled);
    await act(async () => { await drainPromises(); });
    expect(props.loadPdf.calls).toHaveLength(1);
    expect(seen).toEqual({ source: 'recent' });
  });
});
