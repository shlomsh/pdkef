import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import PdfSignTool from './PdfSignTool.jsx';
import PdfRedactTool from './PdfRedactTool.jsx';
import redactStyles from './PdfRedactTool.module.css';

const REDACT_BOX = redactStyles['redact-box'];

// Regression coverage for the auto-resume "silent draft restore" race:
//
// Draft restore reads from IndexedDB asynchronously (see useDraftPersistence.js /
// draftStore.js), so it can still be in flight — or resolve late — after the user has
// already picked a fresh file. Both PdfSignTool and PdfRedactTool run a shared,
// multi-`await` loadPdf() from two independent triggers (draft restore, manual pick);
// without a guard, whichever call's async chain happens to settle last would silently
// overwrite the other's state, regardless of which one the user actually wanted.
//
// draftStore is mocked here so the test controls exactly when the "restore" promise
// resolves relative to the manual pick, instead of depending on real IndexedDB timing
// (which jsdom doesn't even implement).

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function staleDraftRecord(fileName, elements) {
  return {
    fileName,
    fileSize: 8,
    fileLastModified: Date.now(),
    fileType: 'application/pdf',
    fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
    elements,
    extra: {},
    savedAt: Date.now()
  };
}

let loadDraftDeferred;

vi.mock('../lib/draftStore.js', () => ({
  saveDraft: vi.fn(() => Promise.resolve(true)),
  deleteDraft: vi.fn(() => Promise.resolve(true)),
  loadDraft: vi.fn(() => loadDraftDeferred.promise)
}));

// Mock getDocument because we don't want to load actual pdf.js workers in jsdom environment
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

async function waitAsync(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function pickFile(container, file) {
  const input = container.querySelector('input[type="file"]');
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('draft-restore vs. manual file pick race', () => {
  let container;

  beforeEach(() => {
    loadDraftDeferred = deferred();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.clearAllMocks();
  });

  it('PdfSignTool: a manual pick that finishes before a slow restore resolves is not clobbered by the stale draft', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    // Restore's loadDraft() is now in flight and unresolved.

    await pickFile(container, makePdfFile('fresh-user-pick.pdf'));
    await waitAsync();

    let announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('fresh-user-pick.pdf');
    expect(container.querySelectorAll('[data-editor-element]').length).toBe(0);

    // The stale restore resolves well after the fresh pick already finished loading.
    await act(async () => {
      loadDraftDeferred.resolve(
        staleDraftRecord('draft-old.pdf', [
          { id: 'stale-1', pageIndex: 0, x: 10, y: 10, type: 'text', text: 'stale' }
        ])
      );
    });
    await waitAsync();

    announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('fresh-user-pick.pdf');
    expect(announcement.textContent).not.toContain('draft-old.pdf');
    // Stale draft's element must never have been applied on top of the fresh file.
    expect(container.querySelectorAll('[data-editor-element]').length).toBe(0);
  });

  it('PdfSignTool: restores the draft normally when no manual pick preempts it', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    await act(async () => {
      loadDraftDeferred.resolve(staleDraftRecord('draft-old.pdf', []));
    });
    await waitAsync();

    const announcement = container.querySelector('p.sr-only[role="status"]');
    expect(announcement.textContent).toContain('Restored your last draft of "draft-old.pdf"');
  });

  it('PdfRedactTool: a manual pick that finishes before a slow restore resolves is not clobbered by the stale draft', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container);
    });

    await pickFile(container, makePdfFile('fresh-user-pick.pdf'));
    await waitAsync();

    let announcement = container.querySelector('div.sr-only[role="status"]');
    expect(announcement.textContent).toContain('fresh-user-pick.pdf');
    expect(container.querySelectorAll(`.${REDACT_BOX}`).length).toBe(0);

    await act(async () => {
      loadDraftDeferred.resolve(
        staleDraftRecord('draft-old.pdf', [
          { id: 'stale-1', pageIndex: 0, left: 5, top: 5, width: 10, height: 10, style: 'blackout' }
        ])
      );
    });
    await waitAsync();

    announcement = container.querySelector('div.sr-only[role="status"]');
    expect(announcement.textContent).toContain('fresh-user-pick.pdf');
    expect(announcement.textContent).not.toContain('draft-old.pdf');
    expect(container.querySelectorAll(`.${REDACT_BOX}`).length).toBe(0);
  });

  it('PdfRedactTool: restores the draft normally when no manual pick preempts it', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container);
    });

    await act(async () => {
      loadDraftDeferred.resolve(
        staleDraftRecord('draft-old.pdf', [
          { id: 'stale-1', pageIndex: 0, left: 5, top: 5, width: 10, height: 10, style: 'blackout' }
        ])
      );
    });
    await waitAsync();

    const announcement = container.querySelector('div.sr-only[role="status"]');
    expect(announcement.textContent).toContain('Restored your last draft of "draft-old.pdf"');
    expect(container.querySelectorAll(`.${REDACT_BOX}`).length).toBe(1);
  });
});
