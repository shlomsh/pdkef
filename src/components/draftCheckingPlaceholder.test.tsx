// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import PdfSignTool from './PdfSignTool.tsx';
import styles from './Dropzone.module.css';
import { RESTORE_TIMEOUT_MS } from './SignTool/useDraftPersistence.js';

// Coverage for the "checking draft" gate that replaces the flicker of an empty
// dropzone briefly showing before a saved draft loads over it (see
// useDraftPersistence.js's isRestoring / BasePdfTool.tsx's checkingDraft).
// draftStore is mocked so the test controls both the synchronous hint
// (hasDraftHint) and exactly when the async restore itself settles, instead of
// depending on real IndexedDB timing (which jsdom doesn't implement).

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function draftRecord(fileName) {
  return {
    fileName,
    fileSize: 8,
    fileLastModified: Date.now(),
    fileType: 'application/pdf',
    fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
    elements: [],
    extra: {},
    savedAt: Date.now()
  };
}

let loadDraftDeferred;
let hint;

vi.mock('../editor/workspace/draftStore.js', () => ({
  saveDraft: vi.fn(() => Promise.resolve(true)),
  deleteDraft: vi.fn(() => Promise.resolve(true)),
  loadDraft: vi.fn(() => loadDraftDeferred.promise),
  takeHandoff: vi.fn(() => Promise.resolve(null)),
  hasDraftHint: vi.fn(() => hint),
  subscribeToDraftChanges: vi.fn(() => () => {})
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(() =>
        Promise.resolve({
          getViewport: () => ({ width: 612, height: 792 }),
          render: () => ({ promise: Promise.resolve() })
        })
      )
    })
  }))
}));

describe('checking-draft placeholder (avoids the empty-dropzone flicker)', () => {
  let container;

  beforeEach(() => {
    loadDraftDeferred = deferred();
    hint = false;
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.clearAllMocks();
  });

  it('shows the empty-state dropzone immediately when there is no draft hint', () => {
    hint = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    expect(container.textContent).toContain('Drop PDF');
    expect(container.textContent).not.toContain('Checking for a saved draft');
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('holds off on the empty-state dropzone while a hinted draft is still being checked, then loads it', async () => {
    hint = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    // Draft check is in flight: neither the "add a file" invitation nor its
    // input should be reachable yet.
    expect(container.textContent).not.toContain('Drop PDF');
    expect(container.textContent).toContain('Checking for a saved draft');
    expect(container.querySelector('input[type="file"]')).toBeNull();

    await act(async () => {
      loadDraftDeferred.resolve(draftRecord('draft-old.pdf'));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(container.textContent).not.toContain('Checking for a saved draft');
    const announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('Restored your last draft of "draft-old.pdf"');
  });

  it('gives up waiting after the restore timeout and reveals the empty state, but still applies a late-arriving draft', async () => {
    vi.useFakeTimers();
    try {
      hint = true;
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(<PdfSignTool />, container);
      });

      expect(container.querySelector(`.${styles.dropzone}`)?.getAttribute('aria-busy')).toBe('true');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS + 10);
      });

      // Timed out: the real dropzone is back, even though the restore itself
      // is still pending.
      expect(container.textContent).toContain('Drop PDF');
      expect(container.querySelector('input[type="file"]')).not.toBeNull();

      // The IndexedDB read finally resolves after the timeout gave up on it -
      // it must still win, since giving up on the wait is not the same as
      // discarding the result once it does arrive.
      await act(async () => {
        loadDraftDeferred.resolve(draftRecord('slow-draft.pdf'));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30);
      });

      const announcement = container.querySelector('p.sr-only[role="status"]');
      expect(announcement.textContent).toContain('Restored your last draft of "slow-draft.pdf"');
    } finally {
      vi.useRealTimers();
    }
  });
});
