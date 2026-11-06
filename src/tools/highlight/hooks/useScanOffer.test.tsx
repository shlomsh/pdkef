import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanVerdict } from '../lib/enhance/scanCheck.ts';
import { useScanOffer } from './useScanOffer.ts';

const sendHandoff = vi.hoisted(() => vi.fn());
const sourceIdForBytes = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
vi.mock('#lib/handoff/sendHandoff.ts', () => ({ sendHandoff }));
vi.mock('#lib/drafts/draftSourceId.ts', () => ({ sourceIdForBytes }));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError }));

type Input = Parameters<typeof useScanOffer>[0];
type Offer = ReturnType<typeof useScanOffer>;

let container: HTMLElement;
let latest: Offer;
const buffer = new ArrayBuffer(8);
const file = new File([buffer], 'crooked.pdf');

function Probe(props: Input) {
  latest = useScanOffer(props);
  return null;
}
const base: Input = { verdict: null, file, bytes: () => buffer, hasMarks: false };
const mount = (over: Partial<Input> = {}) => act(() => render(<Probe {...base} {...over} />, container));
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  localStorage.clear();
  sendHandoff.mockReset().mockResolvedValue(true);
  reportError.mockReset();
  sourceIdForBytes.mockReset().mockResolvedValue('sha256:one');
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => render(null, container));
  container.remove();
});

const open = async (verdict: ScanVerdict | null = 'lean', over: Partial<Input> = {}) => {
  await mount({ verdict, ...over });
  await settle();
};

describe('useScanOffer', () => {
  it('shows the first time a crooked scan opens', async () => {
    await open('lean');
    expect(latest.verdict).toBe('lean');
  });

  it('says so once, when the line appears', async () => {
    const onOffer = vi.fn();
    await open('lean', { onOffer });
    await mount({ verdict: 'lean', onOffer });
    await settle();
    expect(onOffer.mock.calls).toEqual([['lean']]);
  });

  it('is not left busy once the hand-off is under way, so Back finds the buttons working', async () => {
    await open('lean');
    await act(async () => { latest.straighten(); await Promise.resolve(); await Promise.resolve(); });
    expect(latest.busy).toBe(false);
  });

  it('does not show a second open of the same bytes', async () => {
    await open('lean');
    await mount({ verdict: null });
    await open('lean');
    expect(latest.verdict).toBeNull();
  });

  it('claims but does not show when marks exist at verdict time', async () => {
    await open('bent', { hasMarks: true });
    expect(latest.verdict).toBeNull();
    await mount({ verdict: null });
    await open('bent');
    expect(latest.verdict).toBeNull();
  });

  it('hides for good when a mark lands, even after undo', async () => {
    await open('lean');
    await mount({ verdict: 'lean', hasMarks: true });
    expect(latest.verdict).toBeNull();
    await mount({ verdict: 'lean', hasMarks: false });
    await settle();
    expect(latest.verdict).toBeNull();
  });

  it('keepAsIs clears the line', async () => {
    await open('spread');
    act(() => latest.keepAsIs());
    expect(latest.verdict).toBeNull();
  });

  it('straighten sends the exact payload and goes busy', async () => {
    await open('lean');
    act(() => latest.straighten());
    expect(sendHandoff).toHaveBeenCalledWith('scan-to-pdf', { fileName: 'crooked.pdf', fileType: 'application/pdf', fileBytes: buffer, from: 'highlight-pdf' });
    expect(latest.busy).toBe(true);
  });

  it('a failed hand-off sets failed and clears busy', async () => {
    sendHandoff.mockRejectedValue(new Error('handoff'));
    await open('lean');
    await act(async () => { latest.straighten(); await Promise.resolve(); await Promise.resolve(); });
    expect(latest.failed).toBe(true);
    expect(latest.busy).toBe(false);
  });

  it('shows nothing for a straight verdict', async () => {
    await open('straight');
    expect(latest.verdict).toBeNull();
  });

  it('shows nothing for a null id, and reports a rejected hash', async () => {
    sourceIdForBytes.mockResolvedValueOnce(null);
    await open('lean');
    expect(latest.verdict).toBeNull();
    await mount({ verdict: null });
    const err = new Error('hash');
    sourceIdForBytes.mockRejectedValueOnce(err);
    await open('lean');
    expect(latest.verdict).toBeNull();
    expect(reportError).toHaveBeenCalledWith('pdf_tool_run', err, 'scan_offer');
  });

  it('ignores a stale hash that lands after a new document opened', async () => {
    let resolve!: (id: string) => void;
    sourceIdForBytes.mockReturnValueOnce(new Promise<string>((r) => { resolve = r; }));
    await mount({ verdict: 'lean' });
    await mount({ verdict: null });
    await act(async () => { resolve('sha256:old'); await Promise.resolve(); });
    expect(latest.verdict).toBeNull();
  });
});
