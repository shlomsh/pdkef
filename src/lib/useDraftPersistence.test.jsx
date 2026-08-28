import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useDraftPersistence } from './useDraftPersistence.js';

// A storage write can fail (quota, private browsing, a closed IndexedDB
// connection) without throwing - draftStore.saveDraft resolves `false` rather
// than rejecting. draftSaveState must report that as 'error', never 'saved':
// this is the behavior TODO.md's SIGN-06 asked for, already implemented in
// useDraftPersistence.js's persist(), but previously unguarded by any test.

vi.mock('./draftStore.js', () => ({
  saveDraft: vi.fn(),
  loadDraft: vi.fn(() => Promise.resolve(null)),
  deleteDraft: vi.fn(() => Promise.resolve(true)),
  hasDraftHint: vi.fn(() => false)
}));

// Not what this test is about - avoid a real pdf.js decode of fake PDF bytes.
vi.mock('./thumbnails.js', () => ({
  renderDraftPreview: vi.fn(() => Promise.resolve(null))
}));

import { saveDraft } from './draftStore.js';

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

  it('reports "saved" only once the underlying write actually succeeds', async () => {
    saveDraft.mockResolvedValue(true);
    act(() => {
      render(<Harness apiRef={apiRef} props={baseProps()} />, container);
    });
    expect(apiRef.current.result.draftSaveState).toBe('pending');

    await flushDebounceAndMicrotasks();

    expect(saveDraft).toHaveBeenCalled();
    expect(apiRef.current.result.draftSaveState).toBe('saved');
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
});
