import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { pdfSheets } from '../lib/pdfSheets.ts';
import { ScanWork } from '../state/scanWork.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../../test/support/network.browser.ts';
import { useScanPdfPages } from './useScanPdfPages.ts';

answerNetwork();
vi.mock('../lib/pdfSheets.ts', { spy: true });
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
  it('adds no sheet that arrives after the import was cancelled, and reports no failure', async () => {
    const work = new ScanWork();
    const { added, skipped, open } = mount(work, () => work.cancelPdfImport());
    await open(await twoSheetPdf());
    expect(added).toHaveLength(1);
    expect(skipped).not.toHaveBeenCalled();
    await harness.flush();
    expect(harness.reports()).toEqual([]);
  });

  it('adds no sheet a reader hands over after the import was cancelled', async () => {
    const sheet = { file: new File(['x'], 's.jpg', { type: 'image/jpeg' }), quads: [QUAD], question: null };
    // forced: a sheet handed over after the cancel; the real reader stops itself on the abort, so no real PDF gets one this far
    vi.mocked(pdfSheets).mockImplementationOnce(async function* () { yield sheet; yield sheet; });
    const work = new ScanWork();
    const { added, skipped, open } = mount(work, () => work.cancelPdfImport());
    await open(notAPdf('a.pdf'));
    expect(added).toHaveLength(1);
    expect(skipped).not.toHaveBeenCalled();
  });

  // Protects: a PDF sheet never opens with Fine-tune edges on, whatever the sheet looked like.
  it('opens every PDF sheet with fine off', async () => {
    const { added, open } = mount(new ScanWork());
    await open(await twoSheetPdf());
    expect(added.flat().map((page) => (page as { fine: boolean }).fine)).toEqual([false, false]);
  });

  it('names each PDF it could not open, as a PDF that could not be opened', async () => {
    const { skipped, open } = mount(new ScanWork());
    await open(notAPdf('a.pdf'));
    await open(notAPdf('b.pdf'));
    expect(skipped.mock.calls).toEqual([[[{ name: 'a.pdf', reason: 'pdf' }]], [[{ name: 'b.pdf', reason: 'pdf' }]]]);
    await harness.flush();
    expect(harness.reports()).toMatchObject([{ step: 'scan_open_pdf', name: 'InvalidPDFException' }]);
  });

  it('still imports after a cancel', async () => {
    const work = new ScanWork();
    const { added, open } = mount(work);
    work.cancelPdfImport();
    await open(await twoSheetPdf());
    expect(added).toHaveLength(2);
  });
});
