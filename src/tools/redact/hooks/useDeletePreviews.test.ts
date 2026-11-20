// @vitest-environment jsdom
// The hook tests below render with Preact and need a DOM; the pure
// deleteSpansByPage tests don't, but running the whole file under jsdom is
// simpler than splitting it, and jsdom is opt-in per file for exactly this
// (see vitest.config.js's DOM_TESTS comment).
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from '@cantoo/pdf-lib';
import useDeletePreviews, { deleteSpansByPage } from './useDeletePreviews.ts';
import { buildDeletePreviewPage, listDeletableObjects } from '../lib/deleteObjects.js';
import { getPdfjs } from '#editor/adapters/pdf/pdfjsLoader.js';
import { buildPdf, legacyPdfjs } from '../../../test/support/redactCheckPdfs.test-helper.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';

declare const process: { cwd(): string };

// The one edge: getPdfjs() is the vite worker import, which node cannot run, so each test says what
// stands in for it: the legacy build, or (where the test counts destroy calls) a small pdf.js.
vi.mock('#editor/adapters/pdf/pdfjsLoader.js', () => ({ getPdfjs: vi.fn() }));
// Spy-through: the real page rewrite runs; a test only needs to see it was asked, and times one rewrite.
vi.mock('../lib/deleteObjects.js', { spy: true });

// jsdom resolves the helper's worker URL to http; point pdf.js at the legacy build's own file.
const workerUrl = `file://${process.cwd()}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`;
Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', { get: () => workerUrl, set() {}, configurable: true });

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

/** The text pdf.js reads on page 1 of the PDF bytes a preview was parsed from. */
async function textOf(data: Uint8Array): Promise<string> {
  const task = pdfjs.getDocument({ data: data.slice(), useSystemFonts: true });
  const content = await (await (await task.promise).getPage(1)).getTextContent();
  await task.destroy();
  return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
}

/** A pdf.js whose documents record the bytes they were opened from and can be destroyed. */
function recordingPdfjs() {
  const opened: Array<{ destroy: ReturnType<typeof vi.fn>; data: Uint8Array }> = [];
  // A pdf.js stand-in whose document has destroy(); real 6.5 documents do not (RED-75), so this test pins the intended release until RED-75 lands.
  const getDocument = vi.fn((opts: { data: Uint8Array }) => {
    const proxy = { destroy: vi.fn(), data: opts.data };
    opened.push(proxy);
    return { promise: Promise.resolve(proxy) };
  });
  return { opened, lib: { getDocument } as never };
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
    const { opened, lib } = recordingPdfjs();
    vi.mocked(getPdfjs).mockResolvedValue(lib);
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
    expect(await textOf(proxyA.data)).toContain('Alpha two');

    // Step 2 (the reopened-draft path the e2e cannot reach): a different
    // file, B, arrives with delete elements at the SAME byte offsets as A's.
    // A real reopen from recents never passes through an empty `elements` in
    // between, so the only thing that can tell the hook the file changed is
    // fileBytes' identity, guarded by keysFileRef.
    act(() => { render(h(Harness, { fileBytes: b.fileBytes, elements: b.elements, onPreviews }), container!); });
    await waitUntil(() => latest.size === 1 && latest.get(0) !== proxyA, { timeout: 3000 });

    expect(proxyA.destroy).toHaveBeenCalledOnce();
    expect(buildDeletePreviewPage).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0]).not.toBe(load.mock.calls[0][0]);
    const proxyB = latest.get(0);
    expect(proxyB).toBeDefined();
    expect(proxyB).not.toBe(proxyA);
    expect(opened).toHaveLength(2);
    // The page it parsed is B's own, with its first line gone: not A's.
    const textB = await textOf(proxyB.data);
    expect(textB).toContain('Bravo two');
    expect(textB).not.toContain('Bravo one');
  });

  it('loads the source document again after a failed load, for the same file bytes', async () => {
    vi.mocked(getPdfjs).mockImplementation(async () => legacyPdfjs());
    vi.spyOn(console, 'error').mockImplementation(() => {});
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
    const { opened, lib } = recordingPdfjs();
    vi.mocked(getPdfjs).mockResolvedValue(lib);
    const actual = await vi.importActual<typeof import('../lib/deleteObjects.js')>('../lib/deleteObjects.js');
    const { fileBytes, elements } = await fileWithFirstLineDeleted(['Alpha one', 'Alpha two']);
    const onPreviews = () => {};
    let cancelledRebuild!: () => void;
    const cancelled = new Promise<void>((resolve) => { cancelledRebuild = resolve; });
    // Forced timing: the marks change right after the page is rewritten and before pdf.js has parsed it,
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
    await act(async () => { await drainPromises(); });
    expect(opened[0].destroy).toHaveBeenCalledOnce();
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
