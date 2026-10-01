// @vitest-environment jsdom
// The hook tests below render with Preact and need a DOM; the pure
// deleteSpansByPage tests don't, but running the whole file under jsdom is
// simpler than splitting it, and jsdom is opt-in per file for exactly this
// (see vitest.config.js's DOM_TESTS comment).
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useDeletePreviews, { deleteSpansByPage } from './useDeletePreviews.ts';
import { getPdfjs } from '../../editor/adapters/pdf/pdfjsLoader.js';
import { buildDeletePreviewPage } from '../../editor/adapters/pdf/deleteObjects.js';
import { PDFDocument } from '@cantoo/pdf-lib';

vi.mock('../../editor/adapters/pdf/pdfjsLoader.js', () => ({ getPdfjs: vi.fn() }));
vi.mock('../../editor/adapters/pdf/deleteObjects.js', () => ({ buildDeletePreviewPage: vi.fn() }));
// Not named in the brief, but the hook loads it directly (not through
// deleteObjects.js) to build the per-file source document; without a mock,
// PDFDocument.load throws on the fake bytes below before buildDeletePreviewPage
// (already mocked) is even reached.
vi.mock('@cantoo/pdf-lib', () => ({ PDFDocument: { load: vi.fn() } }));

const REBUILD_DEBOUNCE_MS = 120;

function Harness({ fileBytes, elements, onPreviews }: any) {
  const previews = useDeletePreviews(fileBytes, elements);
  onPreviews(previews);
  return null;
}

describe('useDeletePreviews', () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (container) {
      act(() => { render(null, container!); });
      container.remove();
      container = null;
    }
  });

  function mount(fileBytes: ArrayBuffer | null, elements: unknown[], onPreviews: (p: unknown) => void) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(h(Harness, { fileBytes, elements, onPreviews }), container!); });
  }

  it('rebuilds a page-0 preview from a reopened file with the same delete offsets as the previous file', async () => {
    vi.useFakeTimers();

    let callCount = 0;
    vi.mocked(PDFDocument.load).mockImplementation(async (bytes: unknown) => ({ tag: bytes, callIndex: ++callCount } as any));
    vi.mocked(buildDeletePreviewPage).mockImplementation(async () => new Uint8Array([++callCount]));

    const getDocument = vi.fn((opts: any) => ({ promise: Promise.resolve({ destroy: vi.fn(), tag: opts.data }) }));
    vi.mocked(getPdfjs).mockResolvedValue({ getDocument } as any);

    let latest: any = null;
    const onPreviews = (p: unknown) => { latest = p; };

    const fileA = new ArrayBuffer(8);
    const elementsA = [{ type: 'delete', pageIndex: 0, start: 10, end: 20 }];

    // Step 1: file A builds a page-0 preview from A's bytes.
    mount(fileA, elementsA, onPreviews);
    await act(async () => { await vi.advanceTimersByTimeAsync(REBUILD_DEBOUNCE_MS + 10); });

    expect(latest.size).toBe(1);
    const proxyA = latest.get(0);
    expect(proxyA).toBeDefined();
    expect(buildDeletePreviewPage).toHaveBeenCalledTimes(1);
    expect(PDFDocument.load).toHaveBeenCalledTimes(1);

    // Step 2 (the reopened-draft path the e2e cannot reach): a different
    // file, B, arrives with delete elements at the SAME byte offsets as A's.
    // A real reopen from recents never passes through an empty `elements` in
    // between, so the only thing that can tell the hook the file changed is
    // fileBytes' identity, guarded by keysFileRef.
    const fileB = new ArrayBuffer(8);
    const elementsB = [{ type: 'delete', pageIndex: 0, start: 10, end: 20 }];

    act(() => { render(h(Harness, { fileBytes: fileB, elements: elementsB, onPreviews }), container!); });
    await act(async () => { await vi.advanceTimersByTimeAsync(REBUILD_DEBOUNCE_MS + 10); });

    expect(proxyA.destroy).toHaveBeenCalledOnce();
    expect(buildDeletePreviewPage).toHaveBeenCalledTimes(2);
    expect(PDFDocument.load).toHaveBeenCalledTimes(2);
    expect(vi.mocked(PDFDocument.load).mock.calls[1][0]).not.toBe(vi.mocked(PDFDocument.load).mock.calls[0][0]);

    const proxyB = latest.get(0);
    expect(proxyB).toBeDefined();
    expect(proxyB).not.toBe(proxyA);
  });
});

describe('deleteSpansByPage', () => {
  it('groups delete elements by page', () => {
    const byPage = deleteSpansByPage([
      { pageIndex: 0, type: 'delete', start: 10, end: 20 },
      { pageIndex: 1, type: 'delete', start: 5, end: 8 },
      { pageIndex: 0, type: 'delete', start: 30, end: 40 },
    ]);

    expect([...byPage.keys()].sort()).toEqual([0, 1]);
    expect(byPage.get(0)).toEqual([
      { start: 10, end: 20, formPath: [] },
      { start: 30, end: 40, formPath: [] },
    ]);
    expect(byPage.get(1)).toEqual([{ start: 5, end: 8, formPath: [] }]);
  });

  it('ignores non-delete elements', () => {
    const byPage = deleteSpansByPage([
      { pageIndex: 0, type: 'redact', start: 1, end: 2 },
    ]);
    expect(byPage.size).toBe(0);
  });

  it('sorts a page spans so the key is stable regardless of add order', () => {
    const a = deleteSpansByPage([
      { pageIndex: 0, type: 'delete', start: 30, end: 40 },
      { pageIndex: 0, type: 'delete', start: 10, end: 20 },
    ]);
    const b = deleteSpansByPage([
      { pageIndex: 0, type: 'delete', start: 10, end: 20 },
      { pageIndex: 0, type: 'delete', start: 30, end: 40 },
    ]);
    expect(a.get(0)).toEqual(b.get(0));
  });

  it('carries formPath and keeps same-offset spans in different streams apart', () => {
    const byPage = deleteSpansByPage([
      { pageIndex: 0, type: 'delete', start: 10, end: 20, formPath: ['7 0 R'] },
      { pageIndex: 0, type: 'delete', start: 10, end: 20 },
    ]);
    expect(byPage.get(0)).toEqual([
      { start: 10, end: 20, formPath: [] },
      { start: 10, end: 20, formPath: ['7 0 R'] },
    ]);
  });

  it('returns an empty map for no delete elements', () => {
    expect(deleteSpansByPage([]).size).toBe(0);
  });
});
