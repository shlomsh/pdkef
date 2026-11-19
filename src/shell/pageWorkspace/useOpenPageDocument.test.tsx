import { render } from 'preact';
import { act } from 'preact/test-utils';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { readFileSync } from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { loadPdfWithPages } from '#lib/pdf/loadPdfPages.ts';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { repairedPdfLoader, useOpenPageDocument, type OpenPageDocument, type OpenPageDocumentOptions } from './useOpenPageDocument.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { noPagesKey } from '../../test/support/pdfPageTreeFixtures.ts';

const mocks = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: mocks.report }));
// The probe and the page loader run for real, on real PDFs; the spies only let a test see a call, or hold
// one back to put two picks in a race (forced, per test).
vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('#lib/pdf/loadPdfPages.ts', { spy: true });
// The shipped pdf.js loader points at a browser Worker, which node does not have. Forced: the same pdf.js,
// its legacy (node) build, so the probe still parses the file for real.
vi.mock('#lib/pdf/loadPdfjs.js', { spy: true });

const fixture = (name: string) => new File([readFileSync(`src/lib/__fixtures__/encrypted/${name}.pdf`)], `${name}.pdf`, { type: 'application/pdf' });
async function pdfOfPages(name: string, pages: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 200]);
  return new File([await doc.save()], name, { type: 'application/pdf' });
}

const messages = { needsPassword: 'needs password', restricted: 'restricted', loaded: '{name} {count}', loadFailed: 'failed' };

let host: HTMLDivElement;
let current: OpenPageDocument;
let onPick: Mock<OpenPageDocumentOptions['onPick']>;
let onLoaded: Mock<OpenPageDocumentOptions['onLoaded']>;
let announce: Mock<OpenPageDocumentOptions['announce']>;

function mount(extra: Partial<OpenPageDocumentOptions> = {}) {
  function Probe() {
    current = useOpenPageDocument({ loader: repairedPdfLoader, unlockKinds: ['needs-password', 'owner-restricted'], messages, announce, onPick, onLoaded, ...extra });
    return null;
  }
  act(() => render(<Probe />, host));
}
const flush = () => act(async () => { await drainPromises(); });

beforeEach(() => {
  host = document.createElement('div');
  onPick = vi.fn();
  onLoaded = vi.fn();
  announce = vi.fn();
  vi.mocked(probeEncryption).mockReset();
  vi.mocked(loadPdfWithPages).mockReset();
  vi.mocked(getPdfjs).mockReset().mockImplementation(async () => (await import('pdfjs-dist/legacy/build/pdf.mjs')) as never); // forced: the node build
  mocks.report.mockReset();
  resetActionTrailForTests();
});
afterEach(() => act(() => render(null, host)));

describe('useOpenPageDocument', () => {
  it('opens an ordinary PDF', async () => {
    mount();
    const f = await pdfOfPages('a.pdf', 3);
    await act(async () => { current.open(f); });
    await waitUntil(() => current.loadStatus === 'idle' && current.pageCount === 3);
    await flush();
    expect(current.file).toBe(f);
    expect(current.workingFile).toBe(f);
    expect(current.pageCount).toBe(3);
    expect(current.loadStatus).toBe('idle');
    expect(current.needsUnlock).toBeNull();
    expect(onPick).toHaveBeenCalledWith(f);
    expect(onLoaded).toHaveBeenCalledWith({ pageCount: 3, file: f });
    expect(announce).toHaveBeenLastCalledWith('a.pdf 3');
    expect(recentActions().at(-1)).toMatch(/add_files/);
  });

  it('hands back a repaired copy as the working file', async () => {
    mount();
    // A file whose catalog lost its page list: the real loader repairs it and says so.
    const f = new File([noPagesKey() as BlobPart], 'a.pdf', { type: 'application/pdf' });
    await act(async () => { current.open(f); });
    await waitUntil(() => onLoaded.mock.calls.length === 1);
    await flush();
    expect((await vi.mocked(loadPdfWithPages).mock.results[0].value).repaired).toBe(true);
    expect(current.workingFile).not.toBe(f);
    expect(current.workingFile?.name).toBe('a.pdf');
    expect(current.file).toBe(f);
  });

  it('lands an encrypted file in the unlock state without opening it', async () => {
    mount();
    await act(async () => { current.open(fixture('needs-password')); });
    await waitUntil(() => current.needsUnlock !== null || onLoaded.mock.calls.length > 0); // either way the open has finished
    await flush();
    expect(current.needsUnlock?.kind).toBe('needs-password');
    expect(current.loadStatus).toBe('idle');
    expect(loadPdfWithPages).not.toHaveBeenCalled();
    expect(onLoaded).not.toHaveBeenCalled();
    expect(announce).toHaveBeenLastCalledWith('needs password');
  });

  it('lets an owner-restricted file through when the tool does not gate on it', async () => {
    mount({ unlockKinds: ['needs-password'] });
    await act(async () => { current.open(fixture('owner-only')); });
    await waitUntil(() => onLoaded.mock.calls.length === 1);
    await flush();
    await expect(vi.mocked(probeEncryption).mock.results[0].value).resolves.toBe('owner-restricted');
    expect(current.needsUnlock).toBeNull();
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('drops a stale pick that resolves after a newer one', async () => {
    let releaseOld: (v: never) => void = () => {};
    // Forced: the older load is held back so the newer one can finish first; the newer pick loads for real.
    vi.mocked(loadPdfWithPages).mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }));
    mount();
    const older = await pdfOfPages('old.pdf', 2);
    const newer = await pdfOfPages('new.pdf', 5);
    await act(async () => { current.open(older); });
    await waitUntil(() => vi.mocked(loadPdfWithPages).mock.calls.length === 1);
    await act(async () => { current.open(newer); });
    await waitUntil(() => onLoaded.mock.calls.length === 1);
    await act(async () => { releaseOld({ pageCount: 99, bytes: new ArrayBuffer(1), repaired: false } as never); });
    await flush();
    expect(current.file).toBe(newer);
    expect(current.pageCount).toBe(5);
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith({ pageCount: 5, file: newer });
  });

  it('drops a probe result that lands after a newer pick', async () => {
    let releaseOld: (v: never) => void = () => {};
    // Forced: the first probe is held back, to land after the newer pick has finished.
    vi.mocked(probeEncryption).mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }));
    mount();
    const newer = await pdfOfPages('new.pdf', 2);
    await act(async () => { current.open(await pdfOfPages('old.pdf', 2)); });
    await waitUntil(() => vi.mocked(probeEncryption).mock.calls.length === 1);
    await act(async () => { current.open(newer); });
    await waitUntil(() => onLoaded.mock.calls.length === 1);
    await act(async () => { releaseOld('needs-password' as never); });
    await flush();
    expect(current.file).toBe(newer);
    expect(current.needsUnlock).toBeNull();
    expect(announce).not.toHaveBeenCalledWith(messages.needsPassword);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('reports a damaged PDF and shows the error state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    await act(async () => { current.open(new File(['this is not a pdf'], 'x.pdf', { type: 'application/pdf' })); });
    await waitUntil(() => current.loadStatus === 'error');
    await flush();
    const boom = await vi.mocked(loadPdfWithPages).mock.results[0].value.catch((e: unknown) => e);
    expect(boom).toBeInstanceOf(Error);
    expect(mocks.report).toHaveBeenCalledWith('pdf_tool_run', boom, 'load_document');
    expect(current.loadStatus).toBe('error');
    expect(announce).toHaveBeenLastCalledWith('failed');
  });

  it('records a replacement when a file is already open', async () => {
    mount();
    await act(async () => { current.open(await pdfOfPages('a.pdf', 1)); });
    await waitUntil(() => onLoaded.mock.calls.length === 1);
    await act(async () => { current.open(await pdfOfPages('b.pdf', 1)); });
    await waitUntil(() => onLoaded.mock.calls.length === 2);
    await flush();
    expect(recentActions().at(-1)).toMatch(/replace_file/);
  });
});
