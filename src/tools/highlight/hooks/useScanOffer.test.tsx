import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanVerdict } from '../lib/enhance/scanCheck.ts';

// The real hand-off (into fake-indexeddb) and the real hash run; the spies let a test see the call and await its result.
vi.mock('#lib/handoff/sendHandoff.ts', { spy: true });
vi.mock('#lib/drafts/draftSourceId.ts', { spy: true });
vi.mock('#lib/telemetry/errorReport.ts', { spy: true });

import { reportError } from '#lib/telemetry/errorReport.ts';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { sourceIdForBytes } from '#lib/drafts/draftSourceId.ts';
import { peekHandoff } from '#lib/drafts/draftStore.ts';
import { openNewerStore } from '#lib/drafts/newerStore.test-helper.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { useScanOffer } from './useScanOffer.ts';

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
// Waits for every hash the hook has asked for to finish, then lets its follow-up state updates land.
const settle = () => act(async () => {
  await Promise.allSettled(vi.mocked(sourceIdForBytes).mock.results.map((r) => r.value));
  await drainPromises();
});
// Waits for the real hand-off to finish (it parks the file in the store, then navigates).
const handoffDone = () => act(async () => {
  await Promise.allSettled(vi.mocked(sendHandoff).mock.results.map((r) => r.value));
  await drainPromises();
});

beforeEach(() => {
  localStorage.clear();
  indexedDB = new IDBFactory();
  vi.mocked(sendHandoff).mockReset();
  vi.mocked(sourceIdForBytes).mockReset();
  vi.mocked(reportError).mockClear();
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
    act(() => latest.straighten());
    await handoffDone();
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
    await handoffDone();
    const parked = await peekHandoff('scan-to-pdf');
    expect(parked?.fileName).toBe('crooked.pdf');
    expect(parked?.fileBytes?.byteLength).toBe(buffer.byteLength);
  });

  it('a failed hand-off sets failed and clears busy', async () => {
    await openNewerStore(); // the store is already at a newer version, so the real hand-off cannot open it
    await open('lean');
    act(() => latest.straighten());
    await handoffDone();
    expect(latest.failed).toBe(true);
    expect(latest.busy).toBe(false);
  });

  it('shows nothing for a straight verdict', async () => {
    await open('straight');
    expect(latest.verdict).toBeNull();
  });

  it('shows nothing for a null id, and reports a rejected hash', async () => {
    await open('lean', { bytes: () => null }); // the real hash gives no id for bytes that are not a buffer
    expect(latest.verdict).toBeNull();
    await mount({ verdict: null });
    // Tagged as a buffer but not one: the real hash passes it to Web Crypto, which rejects it.
    await open('lean', { bytes: () => ({ [Symbol.toStringTag]: 'ArrayBuffer' }) as unknown as ArrayBuffer });
    expect(latest.verdict).toBeNull();
    expect(reportError).toHaveBeenCalledWith('pdf_tool_run', expect.any(Error), 'scan_offer');
  });

  it('ignores a stale hash that lands after a new document opened', async () => {
    // The second document opens before the first one's hash (Web Crypto, off the main thread) lands.
    mount({ verdict: 'lean' });
    mount({ verdict: null });
    await settle();
    expect(vi.mocked(sourceIdForBytes)).toHaveBeenCalledTimes(1);
    expect(latest.verdict).toBeNull();
  });
});
