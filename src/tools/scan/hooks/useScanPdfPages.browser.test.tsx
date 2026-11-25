import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import * as fontkit from 'fontkit';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { pdfSheets } from '../lib/pdfSheets.ts';
import { openPdfSheetReader } from '../lib/pdfSheetReader.ts';
import { ScanWork } from '../state/scanWork.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../../test/support/network.browser.ts';
import { useScanPdfPages } from './useScanPdfPages.ts';

answerNetwork();
vi.mock('../lib/pdfSheets.ts', { spy: true });
vi.mock('#lib/pdf/renderPage.js', { spy: true });
const QUAD: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

let container: HTMLElement | null = null;
let harness: BrowserToolHarness;
beforeEach(async () => {
  harness = await installBrowserToolHarness();
});
afterEach(async () => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  await harness.restore();
});

function mount(work: ScanWork, onAdded: () => void = () => {}) {
  const added: unknown[][] = [];
  const skipped = vi.fn();
  const inspect = vi.fn();
  let open!: (pdfs: File[]) => Promise<void>;
  const unmountedRef = { current: false };
  function Host() {
    open = useScanPdfPages({ work, unmountedRef, setPages: (update) => { added.push(typeof update === 'function' ? update([]) : update); onAdded(); }, dispatch: vi.fn(), skipped, inspect });
    return null;
  }
  container = document.createElement('div');
  act(() => render(<Host />, container!));
  return { added, skipped, open: (pdf: File) => open([pdf]) };
}
async function twoSheetPdf() {
  const { PDFDocument, StandardFonts } = await getPdfLib();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const size of [600, 640]) {
    const sheet = doc.addPage([size, 800]);
    for (let line = 0; line < 20; line += 1) sheet.drawText('Lorem ipsum dolor sit amet consectetur', { x: 60, y: 740 - line * 30, size: 18, font });
  }
  return new File([await doc.save()], 'a.pdf', { type: 'application/pdf' });
}
const notAPdf = (name: string) => new File(['x'], name, { type: 'application/pdf' });

describe('useScanPdfPages', () => {
  // Protects: a PDF sheet never opens with Fine-tune edges on, whatever the sheet looked like.
  it('adds no sheet that arrives after the import was cancelled, and reports no failure, then still imports after a cancel, and opens every PDF sheet with fine off', async () => {
    const work = new ScanWork();
    let mounted = mount(work, () => work.cancelPdfImport());
    await mounted.open(await twoSheetPdf());
    expect(mounted.added, 'sheets after cancel').toHaveLength(1);
    expect(mounted.skipped, 'no failure after cancel').not.toHaveBeenCalled();
    await harness.flush();
    expect(harness.reports(), 'no reports').toEqual([]);

    act(() => render(null, container!));
    const sheet = { file: new File(['x'], 's.jpg', { type: 'image/jpeg' }), quads: [QUAD], question: null };
    // forced: a sheet handed over after the cancel; the real reader stops itself on the abort, so no real PDF gets one this far
    vi.mocked(pdfSheets).mockImplementationOnce(async function* () { yield sheet; yield sheet; });
    const readerWork = new ScanWork();
    mounted = mount(readerWork, () => readerWork.cancelPdfImport());
    await mounted.open(notAPdf('a.pdf'));
    expect(mounted.added, 'sheets a reader hands over after cancel').toHaveLength(1);
    expect(mounted.skipped, 'no failure from the reader').not.toHaveBeenCalled();

    act(() => render(null, container!));
    const fresh = new ScanWork();
    mounted = mount(fresh);
    fresh.cancelPdfImport();
    await mounted.open(await twoSheetPdf());
    expect(mounted.added, 'sheets after an earlier cancel').toHaveLength(2);
    expect(mounted.added.flat().map((page) => (page as { fine: boolean }).fine), 'fine off').toEqual([false, false]);
  });

  it('names each PDF it could not open, as a PDF that could not be opened', async () => {
    const { skipped, open } = mount(new ScanWork());
    await open(notAPdf('a.pdf'));
    await open(notAPdf('b.pdf'));
    expect(skipped.mock.calls).toEqual([[[{ name: 'a.pdf', reason: 'pdf' }]], [[{ name: 'b.pdf', reason: 'pdf' }]]]);
    await harness.flush();
    expect(harness.reports()).toMatchObject([{ step: 'scan_open_pdf', name: 'InvalidPDFException' }]);
  });
});

/** A two-page PDF: page 2 is rotated 90 and carries a Hebrew word. */
async function twoPagePdfWithHebrew() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await (await fetch('/fonts/Heebo-Regular.ttf')).arrayBuffer());
  doc.addPage([1000, 500]);
  const second = doc.addPage([1000, 500]);
  second.setRotation(degrees(90));
  second.drawText('שלום', { x: 100, y: 100, size: 40, font });
  return new File([await doc.save()], 'b.pdf', { type: 'application/pdf' });
}

describe('openPdfSheetReader', () => {
  it('counts pages, reads the script, and draws with the page rotation plus the extra turns', async () => {
    const pdf = await twoPagePdfWithHebrew();
    const { getDocument } = await getPdfjs();
    const loadingTask = getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
    await loadingTask.destroy();
    const destroy = vi.spyOn(Object.getPrototypeOf(loadingTask), 'destroy');
    const reader = await openPdfSheetReader(pdf);
    const drawn = () => vi.mocked(renderPageToCanvas).mock.calls.at(-1)!;
    expect(reader.pageCount).toBe(2);
    expect(await reader.rightToLeft(2)).toBe(true);
    expect(await reader.rightToLeft(1)).toBe(null);
    const gray = await reader.grayOf(2, 1000, 1);
    expect(drawn()[1]).toMatchObject({ rotation: 180 });
    expect(drawn()[0].pageNumber).toBe(2);
    expect(drawn()[0].rotate).toBe(90);
    expect(gray.data.length).toBe(gray.width * gray.height);
    const jpeg = await reader.jpegOf(2, 3200, 0, { left: 0, top: 0, right: 0, bottom: 0 });
    expect(jpeg.blob.type).toBe('image/jpeg');
    expect([jpeg.width, jpeg.height]).toEqual([1600, 3200]);
    expect(drawn()[1]).toMatchObject({ rotation: 90 });
    expect(drawn()[0].pageNumber).toBe(2);
    reader.close();
    expect(destroy).toHaveBeenCalled();
    await destroy.mock.results[0].value;
  });
});
