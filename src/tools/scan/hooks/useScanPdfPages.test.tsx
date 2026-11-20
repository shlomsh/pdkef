import { render } from 'preact';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanWork } from '../state/scanWork.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { pdfSheets } from '../lib/pdfSheets.ts';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { legacyPdfjs } from '../../../test/support/redactCheckPdfs.test-helper.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { useScanPdfPages } from './useScanPdfPages.ts';

vi.mock('#lib/telemetry/errorReport.ts', { spy: true });
vi.mock('#lib/pdf/loadPdfjs.js', { spy: true });
// jsdom resolves the helper's worker URL to http; point pdf.js at the legacy build's own file.
const workerUrl = `file://${(globalThis as unknown as { process: { cwd(): string } }).process.cwd()}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`;
Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', { get: () => workerUrl, set() {}, configurable: true });
const gates: Array<() => void> = [];
let gateReached = Promise.withResolvers<void>();
const sheetFile = () => new File(['x'], 's.png', { type: 'image/png' });
const QUAD: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
// Rendering a real sheet needs pdf.js on a canvas, which jsdom lacks, so the tests that need sheets to arrive
// one by one force them here (browser-mode wave).
vi.mock('../lib/pdfSheets.ts', { spy: true });
// Each sheet after the first waits for the test to let it through.
const gatedSheets = () => vi.mocked(pdfSheets).mockImplementationOnce(async function* () {
  yield { file: sheetFile(), quads: [QUAD], question: null };
  await new Promise<void>((resolve) => { gates.push(resolve); gateReached.resolve(); });
  yield { file: sheetFile(), quads: [QUAD], question: null };
});

let container: HTMLElement | null = null;
beforeEach(() => {
  vi.mocked(pdfSheets).mockReset();
  vi.mocked(reportError).mockClear();
  vi.mocked(getPdfjs).mockResolvedValue(legacyPdfjs()); // forced, every test: the node build of pdf.js; the shipped loader needs a browser Worker
});
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  gates.length = 0;
  gateReached = Promise.withResolvers<void>();
});

function mount(work: ScanWork) {
  const added: unknown[][] = [];
  const skipped = vi.fn();
  const inspect = vi.fn();
  let open!: (pdfs: File[]) => Promise<void>;
  const unmountedRef = { current: false };
  function Host() {
    open = useScanPdfPages({ work, unmountedRef, setPages: (update) => added.push(typeof update === 'function' ? update([]) : update), dispatch: vi.fn(), skipped, inspect });
    return null;
  }
  container = document.createElement('div');
  act(() => render(<Host />, container!));
  return { added, skipped, open: (pdf: File) => open([pdf]) };
}
const pdf = () => new File(['x'], 'a.pdf', { type: 'application/pdf' });

describe('useScanPdfPages', () => {
  it('adds no sheet that arrives after the import was cancelled, and reports no failure', async () => {
    gatedSheets();
    const work = new ScanWork();
    const { added, skipped, open } = mount(work);
    const done = open(pdf());
    await gateReached.promise;
    expect(added).toHaveLength(1);
    work.cancelPdfImport();
    gates[0]();
    await done;
    expect(added).toHaveLength(1);
    expect(skipped).not.toHaveBeenCalled();
  });

  // Protects: a PDF sheet never opens with Fine-tune edges on, whatever the sheet looked like.
  it('opens every PDF sheet with fine off', async () => {
    gatedSheets();
    const { added, open } = mount(new ScanWork());
    const done = open(pdf());
    await gateReached.promise;
    gates[0]();
    await done;
    expect(added.flat().map((page) => (page as { fine: boolean }).fine)).toEqual([false, false]);
  });

  it('names each PDF it could not open, as a PDF that could not be opened', async () => {
    // The real pdfSheets runs and rejects each file. Not because 'x' is no PDF: the shipped pdf.js loader fails earlier,
    // setting up its worker (no worker module in this environment), so even a valid PDF would be reported as not opened here.
    const { skipped, open } = mount(new ScanWork());
    await open(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await open(new File(['x'], 'b.pdf', { type: 'application/pdf' }));
    expect(skipped.mock.calls).toEqual([[[{ name: 'a.pdf', reason: 'pdf' }]], [[{ name: 'b.pdf', reason: 'pdf' }]]]);
    // Each failed for its bytes (pdf.js calls them invalid), not because the loader could not start.
    expect(vi.mocked(reportError).mock.calls.map(([, err]) => (err as Error).name)).toEqual(['InvalidPDFException', 'InvalidPDFException']);
  });

  it('still imports after a cancel', async () => {
    gatedSheets();
    const work = new ScanWork();
    const { added, open } = mount(work);
    work.cancelPdfImport();
    const done = open(pdf());
    await gateReached.promise;
    gates[0]();
    await done;
    expect(added).toHaveLength(2);
  });
});
