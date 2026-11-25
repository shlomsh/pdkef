import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import PdfSignTool from '../../tools/sign/PdfSignTool.tsx';
import { until } from '../support/until.js';
import { RESTORE_TIMEOUT_MS } from '#lib/drafts/useDraftLifecycle.ts';
import { holdDraftStore } from '#lib/drafts/heldStore.test-helper.ts';
import { hasDraftHint, saveDraft } from '#lib/drafts/draftStore.ts';

// Coverage for the "checking draft" gate that replaces the flicker of an empty
// dropzone briefly showing before a saved draft loads over it (see
// useDraftPersistence.js's isRestoring / BasePdfTool.tsx's checkingDraft).
// The draft store runs for real on fake-indexeddb: a test seeds a draft the way an earlier session left it,
// and the hint (hasDraftHint) comes from the real index. A slow IndexedDB read is a real write
// transaction held on the store (holdDraftStore), released when the test opens the gate.

// An earlier session's draft, written by the real store: the hint and the pointer a reload finds.
async function seedDraft(fileName: string) {
  const saved = await saveDraft('sign', {
    fileName,
    fileType: 'application/pdf',
    fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
    elements: [],
    extra: {}
  });
  expect(saved).toBe(true);
}

vi.mock('#lib/drafts/draftStore.ts', { spy: true });

// Forced: the seeded file is the bytes '%PDF-1.4' (not a real document), so real pdf.js would reject it
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPermissions: vi.fn(async () => null),
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
  let container: HTMLElement | null = null;

  const announcedText = () => container?.querySelector('p.sr-only[role="status"]')?.textContent ?? '';

  beforeEach(() => {
    indexedDB = new IDBFactory();
    localStorage.clear();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container!));
      container.remove();
      container = null;
    }
    vi.clearAllMocks();
  });

  it('shows the empty-state dropzone immediately when there is no draft hint', () => {
    expect(hasDraftHint('sign')).toBe(false);
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    expect(container.textContent).toContain('Drop PDF');
    expect(container.textContent).not.toContain('Checking for a saved draft');
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('holds off on the empty-state dropzone while a hinted draft is still being checked, then loads it', async () => {
    await seedDraft('draft-old.pdf');
    expect(hasDraftHint('sign')).toBe(true);
    const gate = await holdDraftStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container!);
    });

    // Draft check is in flight: neither the "add a file" invitation nor its
    // input should be reachable yet.
    expect(container.textContent).not.toContain('Drop PDF');
    expect(container.textContent).toContain('Checking for a saved draft');
    expect(container.querySelector('input[type="file"]')).toBeNull();

    await act(async () => {
      await gate.release();
    });
    await until(() => announcedText().includes('Restored your last draft'));

    expect(container.textContent).not.toContain('Checking for a saved draft');
    expect(announcedText()).toContain('Restored your last draft of "draft-old.pdf"');
    // The wait is on the condition, which waits on a lazy import: allow for a loaded machine.
  }, 20_000);

  it('gives up waiting after the restore timeout and reveals the empty state, but still applies a late-arriving draft', async () => {
    // Only the clock is faked: setImmediate stays real so lazy imports can settle between steps.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const realTick = (globalThis as unknown as { setImmediate(run: () => void): void }).setImmediate;
    // Steps the fake clock until the condition holds. The bound is real time, since a lazy import takes real time.
    const stepUntil = async (cond: () => boolean) => {
      const deadline = performance.now() + 15_000;
      while (!cond() && performance.now() < deadline) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
          await new Promise<void>((resolve) => { realTick(resolve); });
        });
      }
    };
    try {
      await seedDraft('slow-draft.pdf');
      expect(hasDraftHint('sign')).toBe(true);
      const gate = await holdDraftStore();
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(<PdfSignTool />, container!);
      });

      expect(container.querySelector('[aria-busy]')?.getAttribute('aria-busy')).toBe('true');

      const startedAt = Date.now();
      await stepUntil(() => container!.textContent!.includes('Drop PDF'));
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(RESTORE_TIMEOUT_MS);

      // Timed out: the real dropzone is back, even though the restore itself
      // is still pending.
      expect(container.textContent).toContain('Drop PDF');
      expect(container.querySelector('input[type="file"]')).not.toBeNull();

      // The IndexedDB read finally resolves after the timeout gave up on it -
      // it must still win, since giving up on the wait is not the same as
      // discarding the result once it does arrive.
      await act(async () => {
        await gate.release();
      });
      await stepUntil(() => announcedText().includes('Restored your last draft'));

      expect(announcedText()).toContain('Restored your last draft of "slow-draft.pdf"');
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);
});
