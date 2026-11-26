import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument } from '@cantoo/pdf-lib';
import { leaning } from '#lib/pageEnhance/leaning.test-helper.ts';
import '../../../test/support/realPdfjs.ts';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';

// Spy-through: the real readScan reads real scan pages; the spy shows the call and gives its promise to await.
vi.mock('../lib/enhance/readScan.ts', { spy: true });
import { readScan } from '../lib/enhance/readScan.ts';
vi.mock('#lib/telemetry/errorReport.ts', { spy: true });
vi.mock('#lib/telemetry/maintenanceTelemetry.ts', { spy: true });
import { reportError } from '#lib/telemetry/errorReport.ts';
import { reportMaintenanceEvent, resetMaintenanceEventsForTests } from '#lib/telemetry/maintenanceTelemetry.ts';

import { drainPromises } from '../../../test/support/drainPromises.ts';
import { useScanCheck } from './useScanCheck.ts';

let idle: Array<() => void> = [];
let shown: unknown = 'unset';
let container: HTMLElement;
const opened: PDFDocumentProxy[] = [];

function Probe({ doc }: { doc: PDFDocumentProxy | null }) {
  shown = useScanCheck(doc);
  return null;
}
const mount = (doc: PDFDocumentProxy | null) => act(() => { render(<Probe doc={doc} />, container); });
/** Lets the page paint: runs what the hook queued for idle time, and the promises it started up to the read. */
const startIdle = async () => { await act(async () => { idle.splice(0).forEach((run) => run()); await drainPromises(); }); };
/** Waits for every read the hook started to end, then lets its follow-up state updates land. */
const readsEnded = () => act(async () => {
  await Promise.allSettled(vi.mocked(readScan).mock.results.map((r) => r.value));
  await drainPromises();
});
const runIdle = async () => { await startIdle(); await readsEnded(); };

// A one-page scan of two book pages: the page is one picture of a sheet, with a spine in the middle. The sheet is short, so
// the real read stays quick: it paints at the reader's 1000 px, one image pixel to one canvas pixel.
const W = 1000;
const H = 150;
function spreadPixels(): Uint8ClampedArray {
  const left = leaning(W, H, -3.5, 0, 450);
  const right = leaning(W, H, 2.5, 550, W);
  const data = left.data.map((v, i) => Math.min(v, right.data[i]));
  for (let y = 0; y < H; y += 1) for (let x = 499; x < 502; x += 1) data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
  return new Uint8ClampedArray(data);
}
let scanBytes: Uint8Array;
let plainBytes: Uint8Array; // a page with no picture, which the real read answers at once
beforeAll(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const picture = ctx.createImageData(W, H);
  picture.data.set(spreadPixels());
  ctx.putImageData(picture, 0, 0);
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64'));
  pdf.addPage([800, 120]).drawImage(image, { x: 0, y: 0, width: 800, height: 120 });
  scanBytes = await pdf.save();
  const plain = await PDFDocument.create();
  plain.addPage([600, 375]);
  plainBytes = await plain.save();
});
const openBytes = async (bytes: Uint8Array) => {
  const { getDocument } = await getPdfjs();
  const doc = await getDocument({ data: bytes.slice() }).promise;
  opened.push(doc);
  return doc;
};
const openScan = () => openBytes(scanBytes);
const openPlain = () => openBytes(plainBytes);

beforeEach(() => {
  idle = []; shown = 'unset';
  vi.mocked(readScan).mockClear();
  vi.mocked(reportError).mockClear(); vi.mocked(reportMaintenanceEvent).mockClear(); resetMaintenanceEventsForTests();
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom has no requestIdleCallback; this one queues the task for the test to run when the page "idles".
  vi.stubGlobal('requestIdleCallback', (run: () => void) => { idle.push(run); return run; });
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the pair of the line above.
  vi.stubGlobal('cancelIdleCallback', (run: () => void) => { idle = idle.filter((queued) => queued !== run); });
  container = document.createElement('div');
});
afterEach(async () => {
  render(null, container);
  vi.unstubAllGlobals();
  await Promise.all(opened.splice(0).map((doc) => doc.loadingTask.destroy()));
});

describe('useScanCheck', () => {
  it('does not start reading until the page has had its idle time', async () => {
    mount(await openPlain());
    expect(vi.mocked(readScan)).not.toHaveBeenCalled();
    expect(shown).toBeNull();
    await runIdle();
    expect(vi.mocked(readScan)).toHaveBeenCalledTimes(1);
  });

  it('gives the verdict and reports it once for the document', async () => {
    const doc = await openScan();
    mount(doc);
    await runIdle();
    expect(shown).toBe('spread');
    expect(vi.mocked(reportMaintenanceEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportMaintenanceEvent).mock.calls[0][0]).toEqual({ name: 'highlight_scan_check', properties: { outcome: 'spread' } });
    mount(doc);
    await runIdle();
    expect(vi.mocked(reportMaintenanceEvent)).toHaveBeenCalledTimes(1);
  });

  it('leaves the verdict null and reports the error when the read fails', async () => {
    const doc = await openPlain();
    await doc.loadingTask.destroy(); // a document that was closed under the reader: its pages can no longer be fetched
    mount(doc);
    await runIdle();
    expect(shown).toBeNull();
    expect(vi.mocked(reportError)).toHaveBeenCalledWith('pdf_tool_run', expect.any(Error), 'scan_check');
    expect(vi.mocked(reportMaintenanceEvent)).not.toHaveBeenCalled();
  });

  it('reports nothing for a file that was replaced before the read ended', async () => {
    let finish: (v: 'spread' | null) => void = () => {};
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: real readScan checks liveness only after getPage and after each sheet, so a file replaced during the last page's operator-list read still returns a verdict; real pdf.js cannot be timed to land there.
    vi.mocked(readScan).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    mount(await openPlain());
    await startIdle();
    mount(null);
    await act(async () => { finish('spread'); await drainPromises(); });
    expect(shown).toBeNull();
    expect(vi.mocked(reportMaintenanceEvent)).not.toHaveBeenCalled();
    expect(vi.mocked(readScan).mock.calls[0][1]()).toBe(false);
  });

  it('never starts for a file closed before the idle time came', async () => {
    mount(await openPlain());
    mount(null);
    await runIdle();
    expect(vi.mocked(readScan)).not.toHaveBeenCalled();
  });

  it('falls back to a timer where there is no idle callback', async () => {
    vi.unstubAllGlobals(); // jsdom has none of its own
    expect(typeof requestIdleCallback).toBe('undefined');
    const doc = await openPlain();
    vi.useFakeTimers();
    mount(doc);
    expect(vi.mocked(readScan)).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    vi.useRealTimers();
    expect(vi.mocked(readScan)).toHaveBeenCalledTimes(1);
    await readsEnded();
  });
});
