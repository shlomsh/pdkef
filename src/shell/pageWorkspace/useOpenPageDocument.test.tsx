import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';
import { repairedPdfLoader, useOpenPageDocument, type OpenPageDocument, type OpenPageDocumentOptions } from './useOpenPageDocument.ts';

const mocks = vi.hoisted(() => ({ probe: vi.fn(), load: vi.fn(), report: vi.fn() }));
vi.mock('../../lib/pdfEncryption.ts', () => ({ probeEncryption: mocks.probe }));
vi.mock('../../lib/loadPdfPages.ts', () => ({ loadPdfWithPages: mocks.load }));
vi.mock('../../lib/errorReport.ts', () => ({ reportError: mocks.report }));

const messages = { needsPassword: 'needs password', restricted: 'restricted', loaded: '{name} {count}', loadFailed: 'failed' };
const pdf = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });

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
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  host = document.createElement('div');
  onPick = vi.fn();
  onLoaded = vi.fn();
  announce = vi.fn();
  mocks.probe.mockReset().mockResolvedValue('open');
  mocks.load.mockReset().mockResolvedValue({ pageCount: 3, bytes: new ArrayBuffer(3), repaired: false });
  mocks.report.mockReset();
  resetActionTrailForTests();
});
afterEach(() => act(() => render(null, host)));

describe('useOpenPageDocument', () => {
  it('opens an ordinary PDF', async () => {
    mount();
    const f = pdf('a.pdf');
    await act(async () => { current.open(f); });
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
    mocks.load.mockResolvedValue({ pageCount: 2, bytes: new Uint8Array([9]), repaired: true });
    mount();
    const f = pdf('a.pdf');
    await act(async () => { current.open(f); });
    await flush();
    expect(current.workingFile).not.toBe(f);
    expect(current.workingFile?.name).toBe('a.pdf');
    expect(current.file).toBe(f);
  });

  it('lands an encrypted file in the unlock state without opening it', async () => {
    mocks.probe.mockResolvedValue('needs-password');
    mount();
    await act(async () => { current.open(pdf('p.pdf')); });
    await flush();
    expect(current.needsUnlock?.kind).toBe('needs-password');
    expect(current.loadStatus).toBe('idle');
    expect(mocks.load).not.toHaveBeenCalled();
    expect(onLoaded).not.toHaveBeenCalled();
    expect(announce).toHaveBeenLastCalledWith('needs password');
  });

  it('lets an owner-restricted file through when the tool does not gate on it', async () => {
    mocks.probe.mockResolvedValue('owner-restricted');
    mount({ unlockKinds: ['needs-password'] });
    await act(async () => { current.open(pdf('o.pdf')); });
    await flush();
    expect(current.needsUnlock).toBeNull();
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('drops a stale pick that resolves after a newer one', async () => {
    let releaseOld: (v: unknown) => void = () => {};
    mocks.load
      .mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }))
      .mockResolvedValueOnce({ pageCount: 5, bytes: new ArrayBuffer(1), repaired: false });
    mount();
    const older = pdf('old.pdf');
    const newer = pdf('new.pdf');
    await act(async () => { current.open(older); });
    await flush();
    await act(async () => { current.open(newer); });
    await flush();
    await act(async () => { releaseOld({ pageCount: 99, bytes: new ArrayBuffer(1), repaired: false }); });
    await flush();
    expect(current.file).toBe(newer);
    expect(current.pageCount).toBe(5);
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith({ pageCount: 5, file: newer });
  });

  it('reports a damaged PDF and shows the error state', async () => {
    const boom = new Error('bad xref');
    mocks.load.mockRejectedValue(boom);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    await act(async () => { current.open(pdf('x.pdf')); });
    await flush();
    expect(mocks.report).toHaveBeenCalledWith('pdf_tool_run', boom, 'load_document');
    expect(current.loadStatus).toBe('error');
    expect(announce).toHaveBeenLastCalledWith('failed');
  });

  it('records a replacement when a file is already open', async () => {
    mount();
    await act(async () => { current.open(pdf('a.pdf')); });
    await flush();
    await act(async () => { current.open(pdf('b.pdf')); });
    await flush();
    expect(recentActions().at(-1)).toMatch(/replace_file/);
  });
});
