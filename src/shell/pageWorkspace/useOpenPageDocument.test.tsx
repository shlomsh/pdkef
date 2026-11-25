import { render } from 'preact';
import { act } from 'preact/test-utils';
import { readFileSync } from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { loadPdfWithPages } from '#lib/pdf/loadPdfPages.ts';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { repairedPdfLoader, useOpenPageDocument, type OpenPageDocument, type OpenPageDocumentOptions } from './useOpenPageDocument.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { noPagesKey } from '../../test/support/pdfPageTreeFixtures.ts';
import { HeldFile } from '../../test/support/heldFile.ts';
import '../../test/support/realPdfjs.ts';

vi.mock('#lib/telemetry/errorReport.ts', { spy: true });
// The probe and the page loader run for real, on real PDFs; the spies only let a test see a call. The one
// race that cannot be held by a file's bytes holds the page loader (forced, in that test).
vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('#lib/pdf/loadPdfPages.ts', { spy: true });

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
  vi.mocked(reportError).mockClear();
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
    await waitUntil(() => current.loadStatus === 'idle' && current.pageCount > 0);
    await flush();
    expect((await vi.mocked(loadPdfWithPages).mock.results[0].value).repaired).toBe(true);
    expect(current.workingFile).not.toBe(f);
    expect(current.workingFile?.name).toBe('a.pdf');
    expect(current.file).toBe(f);
  });

  it('lands an encrypted file in the unlock state without opening it', async () => {
    mount();
    await act(async () => { current.open(fixture('needs-password')); });
    await waitUntil(() => current.needsUnlock !== null);
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
    await waitUntil(() => current.loadStatus === 'idle' && current.pageCount > 0);
    await flush();
    await expect(vi.mocked(probeEncryption).mock.results[0].value).resolves.toBe('owner-restricted');
    expect(current.needsUnlock).toBeNull();
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('drops a stale pick that resolves after a newer one', async () => {
    let releaseOld: (v: never) => void = () => {};
    let oldReachedLoad: () => void = () => {};
    const oldLoadStarted = new Promise<void>((r) => { oldReachedLoad = r; });
    // Forced: the page loader takes bytes, not a file, so only its answer can wait; the newer pick loads for real.
    vi.mocked(loadPdfWithPages).mockImplementationOnce(() => new Promise((r) => { releaseOld = r; oldReachedLoad(); }));
    mount();
    const older = await pdfOfPages('old.pdf', 2);
    const newer = await pdfOfPages('new.pdf', 5);
    await act(async () => { current.open(older); });
    await oldLoadStarted;
    await act(async () => { current.open(newer); });
    await waitUntil(() => current.file === newer && current.loadStatus === 'idle' && current.pageCount === 5);
    await act(async () => { releaseOld({ pageCount: 99, bytes: new ArrayBuffer(1), repaired: false } as never); });
    await flush();
    expect(current.file).toBe(newer);
    expect(current.pageCount).toBe(5);
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith({ pageCount: 5, file: newer });
  });

  it('drops a probe result that lands after a newer pick', async () => {
    // The older pick is an encrypted file whose bytes are held, so its probe lands after the newer pick has finished.
    const encrypted = fixture('needs-password');
    const older = new HeldFile(new Uint8Array(await encrypted.arrayBuffer()), 'old.pdf');
    mount();
    const newer = await pdfOfPages('new.pdf', 2);
    await act(async () => { current.open(older); });
    await older.started;
    await act(async () => { current.open(newer); });
    await waitUntil(() => current.file === newer && current.loadStatus === 'idle' && current.pageCount === 2);
    await act(async () => { older.release(); });
    // The older probe really ran and found a password.
    await waitUntil(() => vi.mocked(probeEncryption).mock.calls.length === 2);
    const probed = await Promise.all(vi.mocked(probeEncryption).mock.results.map((r) => r.value));
    expect(probed).toContain('needs-password');
    await flush();
    expect(current.file).toBe(newer);
    expect(current.needsUnlock).toBeNull();
    expect(announce).not.toHaveBeenCalledWith(messages.needsPassword);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('reports a damaged PDF and shows the error state', async () => {
    const logged = vi.spyOn(console, 'error');
    mount();
    await act(async () => { current.open(new File(['this is not a pdf'], 'x.pdf', { type: 'application/pdf' })); });
    await waitUntil(() => current.loadStatus === 'error');
    await flush();
    // The literal message pdf.js raises for a file with no header, captured once from the real run.
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('No PDF header found') }));
    expect(vi.mocked(reportError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportError)).toHaveBeenCalledWith(
      'pdf_tool_run',
      expect.objectContaining({ name: 'Error', message: 'Failed to parse PDF document (line:0 col:34 offset=17): No PDF header found' }),
      'load_document',
    );
    expect(current.loadStatus).toBe('error');
    expect(announce).toHaveBeenLastCalledWith('failed');
  });

  it('records a replacement when a file is already open', async () => {
    mount();
    await act(async () => { current.open(await pdfOfPages('a.pdf', 1)); });
    await waitUntil(() => current.file?.name === 'a.pdf' && current.loadStatus === 'idle' && current.pageCount === 1);
    await act(async () => { current.open(await pdfOfPages('b.pdf', 1)); });
    await waitUntil(() => current.file?.name === 'b.pdf' && current.loadStatus === 'idle' && current.pageCount === 1);
    await flush();
    expect(recentActions().at(-1)).toMatch(/replace_file/);
  });
});
