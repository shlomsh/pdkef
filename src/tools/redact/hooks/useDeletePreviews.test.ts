// @vitest-environment jsdom
// The hook tests below render with Preact and need a DOM; the pure
// deleteSpansByPage tests don't, but running the whole file under jsdom is
// simpler than splitting it, and jsdom is opt-in per file for exactly this
// (see vitest.config.js's DOM_TESTS comment).
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDocument } from 'pdfjs-dist';
import '../../../test/support/realPdfjs.ts';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument } from '@cantoo/pdf-lib';
import useDeletePreviews, { deleteSpansByPage } from './useDeletePreviews.ts';
import { buildDeletePreviewPage, listDeletableObjects } from '../lib/deleteObjects.js';
import { buildPdf } from '../../../test/support/redactCheckPdfs.test-helper.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';

// Spy-through: the shipped pdf.js runs for real; the spy shows which loading tasks the hook opened.
vi.mock('pdfjs-dist', { spy: true });
// Spy-through: the real page rewrite runs; a test only needs to see it was asked, and times one rewrite.
vi.mock('../lib/deleteObjects.js', { spy: true });

/** The loading tasks the hook has opened, in order. */
const openedTasks = () => vi.mocked(getDocument).mock.results.map((result) => result.value as ReturnType<typeof getDocument>);

function Harness({ fileBytes, elements, onPreviews }: any) {
  const previews = useDeletePreviews(fileBytes, elements);
  onPreviews(previews);
  return null;
}

/** A real file of text lines, and a `delete` element for its first line, as Delete itself marks it. */
async function fileWithFirstLineDeleted(lines: string[]) {
  const data = await buildPdf([{ lines }]);
  const fileBytes = data.slice().buffer as ArrayBuffer;
  const [first] = (await listDeletableObjects(fileBytes)) as Array<{ pageIndex: number; start: number; end: number }>;
  return { fileBytes, elements: [{ type: 'delete', pageIndex: first.pageIndex, start: first.start, end: first.end }] };
}

/** The text pdf.js reads on page 1 of a preview's document. */
async function textOf(proxy: PDFDocumentProxy): Promise<string> {
  const content = await (await proxy.getPage(1)).getTextContent();
  return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
}

describe('useDeletePreviews', () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(buildDeletePreviewPage).mockClear();
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
    vi.mocked(getDocument).mockClear();
    let latest: any = null;
    const onPreviews = (p: unknown) => { latest = p; };

    // Same layout, different words: the two files' delete offsets are identical.
    const a = await fileWithFirstLineDeleted(['Alpha one', 'Alpha two']);
    const b = await fileWithFirstLineDeleted(['Bravo one', 'Bravo two']);
    expect(b.elements).toEqual(a.elements);
    const load = vi.spyOn(PDFDocument, 'load'); // spy-through, after the files above were made

    // Step 1: file A builds a page-0 preview from A's bytes.
    mount(a.fileBytes, a.elements, onPreviews);
    await waitUntil(() => latest.size === 1, { timeout: 3000 });
    const proxyA = latest.get(0);
    expect(proxyA).toBeDefined();
    expect(buildDeletePreviewPage).toHaveBeenCalledTimes(1);
    expect(await textOf(proxyA)).toContain('Alpha two');

    // Step 2 (the reopened-draft path the e2e cannot reach): a different
    // file, B, arrives with delete elements at the SAME byte offsets as A's.
    // A real reopen from recents never passes through an empty `elements` in
    // between, so the only thing that can tell the hook the file changed is
    // fileBytes' identity, guarded by keysFileRef.
    act(() => { render(h(Harness, { fileBytes: b.fileBytes, elements: b.elements, onPreviews }), container!); });
    await waitUntil(() => latest.size === 1 && latest.get(0) !== proxyA, { timeout: 3000 });

    expect(proxyA.loadingTask.destroyed).toBe(true);
    expect(buildDeletePreviewPage).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0]).not.toBe(load.mock.calls[0][0]);
    const proxyB = latest.get(0);
    expect(proxyB).toBeDefined();
    expect(proxyB).not.toBe(proxyA);
    expect(openedTasks()).toHaveLength(2);
    // The page it parsed is B's own, with its first line gone: not A's.
    const textB = await textOf(proxyB);
    expect(textB).toContain('Bravo two');
    expect(textB).not.toContain('Bravo one');
  });

  it('loads the source document again after a failed load, for the same file bytes', async () => {
    vi.spyOn(console, 'error');
    const { fileBytes, elements } = await fileWithFirstLineDeleted(['Alpha one', 'Alpha two']);
    const load = vi.spyOn(PDFDocument, 'load');
    // Forced: a read failing once on bytes that load fine is not something the real loader does.
    load.mockRejectedValueOnce(new Error('load failed'));

    let latest: any = null;
    const onPreviews = (p: unknown) => { latest = p; };
    mount(fileBytes, elements, onPreviews);
    // The hook's own answer to the failed read is its console message, so wait for that.
    await waitUntil(() => expect(console.error).toHaveBeenCalled(), { timeout: 3000 });
    await act(async () => { await drainPromises(); });
    expect(latest.size).toBe(0);

    // A new elements array for the same bytes (the person marks again) rebuilds.
    act(() => {
      render(h(Harness, { fileBytes, elements: [{ ...elements[0] }], onPreviews }), container!);
    });
    await waitUntil(() => latest.size === 1, { timeout: 3000 });

    expect(load).toHaveBeenCalledTimes(2);
    expect(latest.size).toBe(1);
  });

  it('destroys the pdf.js handles of a rebuild that was cancelled before it finished', async () => {
    vi.mocked(getDocument).mockClear();
    const actual = await vi.importActual<typeof import('../lib/deleteObjects.js')>('../lib/deleteObjects.js');
    const { fileBytes, elements } = await fileWithFirstLineDeleted(['Alpha one', 'Alpha two']);
    const onPreviews = () => {};
    let cancelledRebuild!: () => void;
    const cancelled = new Promise<void>((resolve) => { cancelledRebuild = resolve; });
    // Forced: timing. The marks change right after the page is rewritten and before pdf.js has parsed it,
    // so that rebuild is cancelled while its parse is open.
    vi.mocked(buildDeletePreviewPage).mockImplementationOnce(async (...args) => {
      const built = await actual.buildDeletePreviewPage(...args);
      act(() => { render(h(Harness, { fileBytes, elements: [], onPreviews }), container!); });
      cancelledRebuild();
      return built;
    });
    mount(fileBytes, elements, onPreviews);
    await cancelled;

    // pdf.js finished that parse after the cancel: its handle is destroyed, not leaked.
    await waitUntil(() => openedTasks()[0]?.destroyed === true, { timeout: 3000 });
    expect(openedTasks()).toHaveLength(1);
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
