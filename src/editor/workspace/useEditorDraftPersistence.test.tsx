import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/drafts/draftStore.ts', () => ({
  saveDraft: vi.fn(() => Promise.resolve(true)),
  loadDraft: vi.fn(),
  deleteDraft: vi.fn(() => Promise.resolve(true)),
  hasDraftHint: vi.fn(() => false),
  subscribeToDraftChanges: vi.fn(() => () => {}),
  takeHandoff: vi.fn(() => Promise.resolve(null)),
  cacheRecentFile: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('#lib/pdf/thumbnails.js', () => ({
  renderDraftPreview: vi.fn(() => Promise.resolve(null)),
}));

import { deleteDraft, loadDraft, takeHandoff } from '#lib/drafts/draftStore.ts';
import { takeArrival, noteRecentOpen, resetFileArrivalForTests } from '#lib/handoff/fileArrival.ts';
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

async function waitAsync(ms = 10) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

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
    loadPdf: vi.fn(),
    isElement: isEditorElement,
    ...overrides,
  };
}

describe('useEditorDraftPersistence - restore migrates and validates', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    (loadDraft as any).mockReset();
    (deleteDraft as any).mockReset();
    (deleteDraft as any).mockResolvedValue(true);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    document.documentElement.removeAttribute('data-draft-hint');
    document.documentElement.removeAttribute('data-editor-restore');
  });

  it('calls loadPdf once with only the valid elements from a mixed record', async () => {
    const fileBytes = new TextEncoder().encode('%PDF-1.4').buffer;
    const goodElement = { id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 20, text: 'Hello' };
    const garbageElement = { id: 'bad-1', type: 'not-a-real-type', pageIndex: 0 };
    (loadDraft as any).mockResolvedValue({
      fileName: 'contract.pdf',
      fileType: 'application/pdf',
      fileBytes,
      elements: [goodElement, garbageElement],
      extra: { actionHistory: [] },
    });

    const apiRef: any = { current: null };
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    await waitAsync();

    expect(props.loadPdf).toHaveBeenCalledTimes(1);
    const [, calledBytes, initialState, restored] = props.loadPdf.mock.calls[0];
    expect(calledBytes).toBe(fileBytes);
    expect(initialState.elements).toEqual([goodElement]);
    expect(restored).toBe(true);
  });

  it('restores a checkbox-sized symbol mark with its snapped geometry intact', async () => {
    const fileBytes = new TextEncoder().encode('%PDF-1.4').buffer;
    const checkboxMark = {
      id: 'health-checkbox-1', type: 'symbol', pageIndex: 0,
      // This is deliberately not a square percent box: its axes are scaled
      // from the detected 6.6pt square against an A4 page's two dimensions.
      left: 52.08, top: 42.19, width: 1.71, height: 1.21,
      mark: 'check', color: '#1463ff',
    };
    (loadDraft as any).mockResolvedValue({
      fileName: 'health.pdf',
      fileType: 'application/pdf',
      fileBytes,
      elements: [checkboxMark],
      extra: { actionHistory: [] },
    });

    const props = baseProps({ tool: 'sign' });
    act(() => {
      render(<Harness apiRef={{ current: null }} props={props} />, container);
    });
    await waitAsync();

    expect(props.loadPdf.mock.calls[0][2].elements).toEqual([checkboxMark]);
  });

  it('treats a record failing the top-level check the same as no record at all', async () => {
    (loadDraft as any).mockResolvedValue({ fileName: 'contract.pdf', elements: [] });

    const apiRef: any = { current: null };
    const props = baseProps();
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    await waitAsync();

    expect(props.loadPdf).not.toHaveBeenCalled();
  });

  it('discards invalid editor work and its first-paint markers so it cannot re-arm on the next visit', async () => {
    // The persistence hook has already established that bytes exist before it
    // calls onRestore. An empty filename therefore reaches editor validation
    // and represents a malformed record the generic store cannot diagnose.
    (loadDraft as any).mockResolvedValue({
      fileName: '',
      fileType: 'application/pdf',
      fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
      elements: [],
    });
    document.documentElement.setAttribute('data-draft-hint', '1');
    document.documentElement.setAttribute('data-editor-restore', '1');

    const props = baseProps({ tool: 'redact' });
    act(() => {
      render(<Harness apiRef={{ current: null }} props={props} />, container);
    });
    await waitAsync();

    expect(props.loadPdf).not.toHaveBeenCalled();
    expect(deleteDraft).toHaveBeenCalledWith('redact');
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
    expect(document.documentElement.hasAttribute('data-editor-restore')).toBe(false);
  });

  it('forwards only validated, self-contained history commands to the editor loader', async () => {
    const fileBytes = new TextEncoder().encode('%PDF-1.4').buffer;
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
    (loadDraft as any).mockResolvedValue({
      schemaVersion: DRAFT_SCHEMA_VERSION,
      fileName: 'contract.pdf',
      fileType: 'application/pdf',
      fileBytes,
      elements: [element],
      extra: {
        actionHistory: [command, { ...command, id: 'bad-history', elements: [{ element, index: 'top' }] }],
      },
    });

    const props = baseProps();
    act(() => {
      render(<Harness apiRef={{ current: null }} props={props} />, container);
    });
    await waitAsync();

    const initialState = props.loadPdf.mock.calls[0][2];
    expect(initialState.actionHistory).toEqual([command]);
  });

  it('drops a Sign-only element type from a redact record instead of restoring it', async () => {
    const fileBytes = new TextEncoder().encode('%PDF-1.4').buffer;
    const textElement = { id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 20, text: 'Hello' };
    const blackoutElement = { id: 'blackout-1', type: 'blackout', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 };
    (loadDraft as any).mockResolvedValue({
      fileName: 'contract.pdf',
      fileType: 'application/pdf',
      fileBytes,
      elements: [textElement, blackoutElement],
      extra: { actionHistory: [] },
    });

    const apiRef: any = { current: null };
    const props = baseProps({ tool: 'redact', isElement: isRedactElement });
    act(() => {
      render(<Harness apiRef={apiRef} props={props} />, container);
    });
    await waitAsync();

    expect(props.loadPdf).toHaveBeenCalledTimes(1);
    expect(props.loadPdf.mock.calls[0][2].elements).toEqual([blackoutElement]);
  });

  it('does not throw when loadDraft resolves with no record', async () => {
    (loadDraft as any).mockResolvedValue(null);

    const apiRef: any = { current: null };
    const props = baseProps();
    await expect(
      (async () => {
        act(() => {
          render(<Harness apiRef={apiRef} props={props} />, container);
        });
        await waitAsync();
      })(),
    ).resolves.not.toThrow();

    expect(props.loadPdf).not.toHaveBeenCalled();
  });
});

describe('useEditorDraftPersistence - HERO-02 hand-off marker', () => {
  let container: HTMLDivElement;
  const root = document.documentElement;
  const record = () => ({
    fileName: 'merged.pdf',
    fileType: 'application/pdf',
    fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    (loadDraft as any).mockReset();
    (loadDraft as any).mockResolvedValue(null);
    (takeHandoff as any).mockReset();
    root.setAttribute('data-handoff-pending', '1');
    sessionStorage.setItem('pdkef:handoff-pending:sign', '1');
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    root.removeAttribute('data-handoff-pending');
    document.querySelectorAll('[data-tool-loaded]').forEach((n) => n.remove());
    sessionStorage.clear();
  });

  it('holds the marker until the editor shows the handed-over document, then releases it', async () => {
    (takeHandoff as any).mockResolvedValue(record());
    const props = baseProps({ tool: 'sign' });
    act(() => {
      render(<Harness apiRef={{ current: null }} props={props} />, container);
    });
    await waitAsync();
    expect(props.loadPdf).toHaveBeenCalledTimes(1);
    expect(root.hasAttribute('data-handoff-pending')).toBe(true);
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBeNull();
    const shown = document.createElement('div');
    shown.setAttribute('data-tool-loaded', '');
    document.body.appendChild(shown);
    await waitAsync();
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
  });

  it('releases at once when there is nothing to take', async () => {
    (takeHandoff as any).mockResolvedValue(null);
    const props = baseProps({ tool: 'sign' });
    act(() => {
      render(<Harness apiRef={{ current: null }} props={props} />, container);
    });
    await waitAsync();
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
    expect(sessionStorage.getItem('pdkef:handoff-pending:sign')).toBeNull();
  });

  it('releases on unmount before the read settles', async () => {
    (takeHandoff as any).mockReturnValue(new Promise(() => {}));
    const props = baseProps({ tool: 'sign' });
    act(() => {
      render(<Harness apiRef={{ current: null }} props={props} />, container);
    });
    expect(root.hasAttribute('data-handoff-pending')).toBe(true);
    act(() => render(null, container));
    expect(root.hasAttribute('data-handoff-pending')).toBe(false);
  });
});

describe('useEditorDraftPersistence - arrival mark (DEBT-58)', () => {
  let container: HTMLDivElement;
  const record = (from?: string) => ({
    fileName: 'a.pdf',
    fileType: 'application/pdf',
    fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
    ...(from ? { from } : {}),
  });
  beforeEach(() => {
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    resetFileArrivalForTests();
    (loadDraft as any).mockReset();
    (loadDraft as any).mockResolvedValue(null);
    (takeHandoff as any).mockReset();
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  it('marks a hand-off as handoff with the sending tool, right before loadPdf', async () => {
    (takeHandoff as any).mockResolvedValue(record('merge'));
    let seen: unknown;
    const props = baseProps({ tool: 'sign', loadPdf: vi.fn(() => { seen = takeArrival(); }) });
    act(() => {
      render(<Harness apiRef={{ current: null }} props={props} />, container);
    });
    await waitAsync();
    expect(seen).toEqual({ source: 'handoff', from: 'merge' });
  });

  it('marks a restore with the source the draft hook gives, right before loadPdf', async () => {
    (takeHandoff as any).mockResolvedValue(null);
    (loadDraft as any).mockResolvedValue(record());
    noteRecentOpen('sign');
    let seen: unknown;
    const props = baseProps({ tool: 'sign', loadPdf: vi.fn(() => { seen = takeArrival(); }) });
    act(() => {
      render(<Harness apiRef={{ current: null }} props={props} />, container);
    });
    await waitAsync();
    expect(seen).toEqual({ source: 'recent' });
  });
});
