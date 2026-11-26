import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pointAtLegacyWorker } from '../../../test/support/realPdfjs.ts';
import { buildPdf, openOriginal } from '../../../test/support/redactCheckPdfs.test-helper.ts';

import { reportError } from '#lib/telemetry/errorReport.ts';

vi.mock('#lib/telemetry/errorReport.ts', { spy: true });
// Spy-through: the real check runs on real files. A few tests force a rejection or a slow check on it.
vi.mock('../lib/check/runCheck.ts', { spy: true });

import useSavedFileCheck from './useSavedFileCheck.ts';
import type { SavedFileCheckState } from './useSavedFileCheck.ts';
import { DETAILS_SURVIVED_ANNOUNCEMENT } from '../lib/check/checkCopy.ts';
import { runSavedFileCheck } from '../lib/check/runCheck.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { HeldFile } from '../../../test/support/heldFile.ts';

const toBuffer = (data: Uint8Array) => data.slice().buffer as ArrayBuffer;

// Real files: the original as the island holds it (open in pdf.js, its bytes kept) and a plain saved export.
declare const process: { cwd(): string };

pointAtLegacyWorker(pdfjs);

let originalBytes: Uint8Array;
let savedPlain: Uint8Array;
let original: { doc: PDFDocumentProxy; close: () => Promise<void> };
/** A saved export that still carries a page picture, which the check must report. */
let savedWithThumbnail: Uint8Array;
beforeAll(async () => {
  originalBytes = await buildPdf([{ lines: ['Secret Alpha'] }], { title: 'Held title' });
  savedPlain = await buildPdf([{}]);
  original = await openOriginal(originalBytes, PDFJS_WASM_URL);
  const doc = await PDFDocument.load(await buildPdf([{}]));
  doc.getPage(0).node.set(PDFName.of('Thumb'), doc.context.stream(new Uint8Array(1)));
  savedWithThumbnail = new Uint8Array(await doc.save());
});
afterAll(() => original.close());

/** A saved export Blob. */
const exportOf = (data: Uint8Array) => new Blob([data as BlobPart]);
const unreadable = () => Object.assign(new Error('The requested file could not be read'), { name: 'NotReadableError' });

async function run(saved: Blob, heldBytes: ArrayBuffer | null = toBuffer(originalBytes)) {
  // Stable across renders: the hook's effect depends on the document identity.
  const pdfDocument = original.doc;
  let latest: SavedFileCheckState = { status: 'idle' };
  function Probe() {
    latest = useSavedFileCheck({
      pdfDocument, originalBytes: heldBytes, saved, boxes: [], deletedWords: [], picturePages: [],
      detailEdits: {} as never, detailRows: [],
    }).state;
    return null;
  }
  const container = document.createElement('div');
  act(() => render(<Probe />, container));
  // The effect awaits two reads and a dynamic import before it leaves 'checking' for its final state.
  await waitUntil(() => latest.status !== 'checking');
  // Then the promise work still queued behind that state (a report, an announcement) runs.
  await act(async () => { await drainPromises(); });
  return latest;
}

describe('useSavedFileCheck read errors', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear();
    vi.mocked(runSavedFileCheck).mockClear();
    vi.spyOn(console, 'error');
  });
  afterEach(() => vi.restoreAllMocks());

  it('treats a NotReadableError on the saved blob as the environment: no report, no failed state', async () => {
    const saved = Object.assign(new Blob(['x']), { arrayBuffer: () => Promise.reject(unreadable()) });
    const state = await run(saved);
    expect(reportError).not.toHaveBeenCalled();
    expect(state.status).toBe('idle');
  });

  it('still reports any other read error and shows the failed state', async () => {
    const saved = Object.assign(new Blob(['x']), { arrayBuffer: () => Promise.reject(new TypeError('boom')) });
    const state = await run(saved);
    expect(reportError).toHaveBeenCalledWith('redact', expect.any(TypeError), 'check_saved_file');
    expect(state.status).toBe('failed');
  });

  it('still reports an error from the check itself', async () => {
    // Not a PDF: the real check fails on it.
    const saved = exportOf(new TextEncoder().encode('this is not a pdf'));
    const state = await run(saved);
    expect(reportError).toHaveBeenCalledWith('redact', expect.anything(), 'check_saved_file');
    expect(state.status).toBe('failed');
  });

  // RED-69: a tab left open across a deploy cannot load the check's chunk; a reload fixes it.
  it('asks for a reload, and still reports, when the check code cannot load', async () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the real chunk loads here, so the one failure it cannot produce is the rejection itself.
    vi.mocked(runSavedFileCheck).mockRejectedValueOnce(new TypeError('Importing a module script failed.'));
    const saved = exportOf(savedPlain);
    const state = await run(saved);
    expect(reportError).toHaveBeenCalledWith('redact', expect.any(TypeError), 'check_saved_file');
    expect(state.status).toBe('updated');
  });

  // DEBT-51: the File may have moved on disk; the bytes read at load are what the check compares.
  it('checks against the held bytes, so a File that moved on disk cannot fail it', async () => {
    const saved = exportOf(savedPlain);
    const state = await run(saved);
    expect(reportError).not.toHaveBeenCalled();
    expect(state.status).toBe('done');
    // The original it compared is the held bytes, read for real.
    expect(state).toMatchObject({ status: 'done', outcome: { traces: { original: { title: 'Held title' } } } });
  });
});

describe('useSavedFileCheck results', () => {
  const blob = () => exportOf(savedPlain);
  const blobWithThumbnail = () => exportOf(savedWithThumbnail);
  // Everything after the hook's first await is settled promises, so one event-loop turn runs it out.
  const settle = () => act(async () => { await drainPromises(); });
  // A saved export whose read waits for release(): the older export is still being read when a newer one arrives.
  const heldExport = () => new HeldFile(savedWithThumbnail as Uint8Array<ArrayBuffer>, 'saved.pdf');
  // After release the older effect reads, then starts its real check, which is the last call so far.
  const olderCheckFinished = async (calls: number) => {
    await settle();
    expect(runSavedFileCheck).toHaveBeenCalledTimes(calls);
    await act(async () => { await vi.mocked(runSavedFileCheck).mock.results[calls - 1].value; });
    await settle();
  };

  // A rendered hook whose export can change under it, as it does when the person edits and exports again.
  function mount(first: Blob | null, announce?: (message: string) => void) {
    const pdfDocument = original.doc;
    const heldBytes = toBuffer(originalBytes);
    const seen = { state: { status: 'idle' } as SavedFileCheckState, detailsSurvived: [] as string[] };
    function Probe({ saved }: { saved: Blob | null }) {
      const result = useSavedFileCheck({
        pdfDocument, originalBytes: heldBytes, saved, boxes: [], deletedWords: [], picturePages: [],
        announce, detailEdits: {} as never, detailRows: [],
      });
      seen.state = result.state;
      seen.detailsSurvived = result.detailsSurvived;
      return null;
    }
    const container = document.createElement('div');
    act(() => render(<Probe saved={first} />, container));
    return { seen, exportAgain: (saved: Blob | null) => act(() => render(<Probe saved={saved} />, container)) };
  }

  beforeEach(() => {
    vi.mocked(reportError).mockClear();
    vi.mocked(runSavedFileCheck).mockClear();
    vi.spyOn(console, 'error');
  });
  afterEach(() => vi.restoreAllMocks());

  it('does not let a slow check for an old export overwrite the result of the newer export', async () => {
    const announce = vi.fn();
    const older = heldExport();
    const { seen, exportAgain } = mount(older, announce);
    await act(async () => { await older.started; });
    await exportAgain(blob());
    await waitUntil(() => seen.state.status === 'done');
    const newer = seen.state;
    expect(newer).toMatchObject({ status: 'done', typed: [] });

    older.release();
    await olderCheckFinished(2);
    expect(seen.state).toBe(newer);
    expect(seen.detailsSurvived).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('shows nothing once the export goes stale, even when its check finishes afterwards', async () => {
    const announce = vi.fn();
    const pending = heldExport();
    const { seen, exportAgain } = mount(pending, announce);
    await act(async () => { await pending.started; });
    expect(seen.state.status).toBe('checking');
    await exportAgain(null);
    expect(seen.state.status).toBe('idle');

    pending.release();
    await olderCheckFinished(1);
    expect(seen.state.status).toBe('idle');
    expect(seen.detailsSurvived).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('says so, and reports it, when even one trace survives the export', async () => {
    const announce = vi.fn();
    const { seen } = mount(blobWithThumbnail(), announce);
    await waitUntil(() => seen.detailsSurvived.length > 0);
    expect(seen.detailsSurvived).toEqual(['Page pictures']);
    expect(announce).toHaveBeenCalledWith(DETAILS_SURVIVED_ANNOUNCEMENT('Page pictures'));
    expect(reportError).toHaveBeenCalledWith('redact', expect.any(Error), 'export_trace_survived');
  });

  it('stays quiet when no trace survives', async () => {
    const announce = vi.fn();
    const { seen } = mount(blob(), announce);
    await waitUntil(() => seen.state.status === 'done');
    await settle();
    expect(seen.state.status).toBe('done');
    expect(announce).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });
});
