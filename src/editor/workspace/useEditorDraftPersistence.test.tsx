import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./draftStore.js', () => ({
  saveDraft: vi.fn(() => Promise.resolve(true)),
  loadDraft: vi.fn(),
  deleteDraft: vi.fn(() => Promise.resolve(true)),
  hasDraftHint: vi.fn(() => false),
  takeHandoff: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../../lib/thumbnails.js', () => ({
  renderDraftPreview: vi.fn(() => Promise.resolve(null)),
}));

import { loadDraft } from './draftStore.js';
import { useEditorDraftPersistence } from './useEditorDraftPersistence.ts';

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
    loadStartedRef: { current: false },
    loadPdf: vi.fn(),
    ...overrides,
  };
}

describe('useEditorDraftPersistence - restore migrates and validates', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    (loadDraft as any).mockReset();
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
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
