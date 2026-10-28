import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { recentActions, resetActionTrailForTests } from '../../lib/telemetry/actionTrail.ts';
import { repairedPdfLoader } from './useOpenPageDocument.ts';
import { usePageToolSession, type PageToolSession } from './usePageToolSession.ts';

const mocks = vi.hoisted(() => ({ probe: vi.fn(), load: vi.fn(), take: vi.fn() }));
vi.mock('../../lib/pdf/pdfEncryption.ts', () => ({ probeEncryption: mocks.probe }));
vi.mock('../../lib/pdf/loadPdfPages.ts', () => ({ loadPdfWithPages: mocks.load }));
vi.mock('../../lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));
vi.mock('../../lib/drafts/draftStore.ts', () => ({ takeHandoff: mocks.take }));

const messages = {
  announceNeedsPassword: 'needs password', announceRestricted: 'restricted', loaded: '{name} {count}', loadFailed: 'failed',
  undoneAnnouncement: 'undone', redoneAnnouncement: 'redone', allIncluded: 'all in', allSkipped: 'all out', inverted: 'swapped',
};
const pdf = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });

let host: HTMLDivElement;
let current: PageToolSession;
let announce: Mock<(text: string) => void>;
let onPick: Mock<() => void>;
let onRejected: Mock<(names: string[]) => void>;

function mount() {
  function Probe() {
    current = usePageToolSession({
      tool: 'split', loader: repairedPdfLoader, unlockKinds: ['needs-password', 'owner-restricted'],
      messages, announce, onPick, onRejected,
    });
    return null;
  }
  act(() => render(<Probe />, host));
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function openThree() {
  await act(async () => { current.handleFilesAdded([pdf('a.pdf')]); });
  await flush();
}

beforeEach(() => {
  host = document.createElement('div');
  announce = vi.fn();
  onPick = vi.fn();
  onRejected = vi.fn();
  mocks.probe.mockReset().mockResolvedValue('open');
  mocks.load.mockReset().mockResolvedValue({ pageCount: 3, bytes: new ArrayBuffer(3), repaired: false });
  mocks.take.mockReset().mockResolvedValue(null);
  resetActionTrailForTests();
  mount();
});
afterEach(() => act(() => render(null, host)));

describe('usePageToolSession', () => {
  it('a non-PDF is reported rejected and the first PDF opens', async () => {
    const first = pdf('a.pdf');
    await act(async () => { current.handleFilesAdded([new File(['x'], 'notes.txt', { type: 'text/plain' }), first, pdf('b.pdf')]); });
    await flush();
    expect(onRejected).toHaveBeenCalledWith(['notes.txt']);
    expect(current.file).toBe(first);
    expect(onPick).toHaveBeenCalledWith(first);
    expect(current.present.plan).toHaveLength(3);
  });

  it('only non-PDFs open nothing', async () => {
    await act(async () => { current.handleFilesAdded([new File(['x'], 'notes.txt', { type: 'text/plain' })]); });
    await flush();
    expect(onRejected).toHaveBeenCalledWith(['notes.txt']);
    expect(current.file).toBeNull();
  });

  it('a bulk action that changes nothing records nothing and announces nothing', async () => {
    await openThree();
    announce.mockClear();
    resetActionTrailForTests();
    act(() => current.onIncludeAll());
    expect(current.canUndo).toBe(false);
    expect(announce).not.toHaveBeenCalled();
    expect(recentActions().some((a: string) => /select_pages/.test(a))).toBe(false);
  });

  it('a bulk action is one history step, recorded and announced', async () => {
    await openThree();
    announce.mockClear();
    act(() => current.onSkipAll());
    expect(current.present.plan.every((p) => p.skipped)).toBe(true);
    expect(current.canUndo).toBe(true);
    expect(announce).toHaveBeenCalledWith('all out');
    expect(recentActions().at(-1)).toMatch(/select_pages/);
    act(() => current.handleUndo());
    expect(current.canUndo).toBe(false);
  });
});
