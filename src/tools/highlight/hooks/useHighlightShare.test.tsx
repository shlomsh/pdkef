import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useState } from 'preact/hooks';

vi.mock('#lib/telemetry/actionTrail.ts', { spy: true });
import { recordAction, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
const { useHighlightShare } = await import('./useHighlightShare.ts');
const { usePdfShare } = await import('#lib/output/usePdfShare.js');
const { englishHighlightMessages: t } = await import('../messages.ts');

type Share = ReturnType<typeof usePdfShare>;

// What the native share sheet was handed, one list of files per share.
const sheets: File[][] = [];
// Forced: jsdom has no navigator.share, so the sheet is a function that records the files it is handed and answers as queued.
const answers: Array<() => Promise<void>> = [];
const openSheet = () => Object.defineProperty(navigator, 'share', {
  configurable: true,
  value: (data: { files: File[] }) => { sheets.push(data.files); return (answers.shift() ?? (() => Promise.resolve()))(); },
});
const closeSheet = () => { delete (navigator as { share?: unknown }).share; };

let host: HTMLElement | null = null;
beforeEach(() => { sheets.length = 0; answers.length = 0; openSheet(); });
afterEach(() => { if (host) act(() => render(null, host!)); host?.remove(); host = null; vi.mocked(recordAction).mockClear(); resetActionTrailForTests(); closeSheet(); });

const pdf = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });

function mount(prepareFile: (share: Share) => Promise<boolean>, setAnnouncement = vi.fn()) {
  let api!: ReturnType<typeof useHighlightShare>;
  let share!: Share;
  let bump!: () => void;
  function Probe() {
    const [key, setKey] = useState(0);
    bump = () => setKey((k) => k + 1);
    share = usePdfShare();
    api = useHighlightShare({ share, prepareFile: () => prepareFile(share), resetKey: key, setAnnouncement });
    return null;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  const rerender = () => act(async () => { render(<Probe />, host!); });
  act(() => render(<Probe />, host!));
  return { get api() { return api; }, get share() { return share; }, rerender, bump: () => act(() => bump()), setAnnouncement };
}

describe('useHighlightShare', () => {
  it('reports canShare and shareReady from the share object', () => {
    const m = mount(async () => true);
    expect(m.api.canShare).toBe(true);
    expect(m.api.shareReady).toBe(false);
    act(() => { m.share.prepare(pdf(), 'a.pdf'); });
    expect(m.api.shareReady).toBe(true);
  });

  it('drops a prepared file when the reset key changes', () => {
    const m = mount(async () => true);
    act(() => { m.share.prepare(pdf(), 'a.pdf'); });
    expect(m.api.shareReady).toBe(true);
    m.bump();
    expect(m.api.shareReady).toBe(false);
  });

  it('announces an error when the file cannot be prepared, and does not share', async () => {
    closeSheet();
    expect(navigator.share).toBeUndefined();
    const m = mount(async (share) => share.prepare(pdf(), 'a.pdf'));
    await act(async () => { await m.api.onPrepareShare(); });
    expect(m.setAnnouncement).toHaveBeenCalledWith(t.shareError);
    expect(m.api.shareReady).toBe(false);
    expect(sheets).toEqual([]);
  });

  it('opens the sheet at once when the file becomes ready from a tap', async () => {
    const m = mount(async (share) => share.prepare(pdf(), 'a.pdf'));
    await act(async () => { await m.api.onPrepareShare(); });
    await m.rerender();
    expect(sheets.map((files) => files.map((f) => f.name))).toEqual([['a.pdf']]);
    expect(m.setAnnouncement).toHaveBeenCalledWith(t.shared);
    expect(vi.mocked(recordAction)).toHaveBeenCalledWith('share');
    await m.rerender();
    expect(sheets).toHaveLength(1);
  });

  it('keeps the file and asks for another tap when the automatic attempt errors', async () => {
    answers.push(() => Promise.reject(new Error('x')));
    const error = vi.spyOn(console, 'error');
    const m = mount(async (share) => share.prepare(pdf(), 'a.pdf'));
    await act(async () => { await m.api.onPrepareShare(); });
    await m.rerender();
    expect(sheets).toHaveLength(1);
    expect(m.setAnnouncement).toHaveBeenLastCalledWith(t.shareReady);
    expect(m.api.shareReady).toBe(true);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
    expect(vi.mocked(recordAction)).not.toHaveBeenCalled();
  });

  it('announces a canceled automatic attempt', async () => {
    answers.push(() => Promise.reject(new DOMException('closed', 'AbortError')));
    const m = mount(async (share) => share.prepare(pdf(), 'a.pdf'));
    await act(async () => { await m.api.onPrepareShare(); });
    await m.rerender();
    expect(sheets).toHaveLength(1);
    expect(m.setAnnouncement).toHaveBeenLastCalledWith(t.shareCanceled);
  });

  it('ignores a second tap while the file is building', async () => {
    let release!: (v: boolean) => void;
    let builds = 0;
    const m = mount(() => { builds++; return new Promise<boolean>((r) => { release = r; }); });
    let first!: Promise<void>;
    act(() => { first = m.api.onPrepareShare(); });
    await act(async () => { await m.api.onPrepareShare(); });
    expect(builds).toBe(1);
    await act(async () => { release(false); await first; });
  });

  it('a later tap on a prepared file shares it and records it', async () => {
    const m = mount(async () => true);
    act(() => { m.share.prepare(pdf(), 'a.pdf'); });
    await act(async () => { await m.api.onShare(); });
    expect(sheets).toHaveLength(1);
    expect(m.setAnnouncement).toHaveBeenCalledWith(t.shared);
    expect(vi.mocked(recordAction)).toHaveBeenCalledWith('share');
  });

  it('a later tap announces cancel and error', async () => {
    answers.push(() => Promise.reject(new DOMException('closed', 'AbortError')), () => Promise.reject(new Error('x')));
    const error = vi.spyOn(console, 'error');
    const m = mount(async () => true);
    act(() => { m.share.prepare(pdf(), 'a.pdf'); });
    await act(async () => { await m.api.onShare(); });
    expect(m.setAnnouncement).toHaveBeenLastCalledWith(t.shareCanceled);
    await act(async () => { await m.api.onShare(); });
    expect(m.setAnnouncement).toHaveBeenLastCalledWith(t.shareError);
    expect(error.mock.calls).toEqual([[expect.objectContaining({ message: 'x' })]]);
    error.mockRestore();
    expect(vi.mocked(recordAction)).not.toHaveBeenCalled();
  });
});
