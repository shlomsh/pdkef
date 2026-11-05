import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useState } from 'preact/hooks';

const recordAction = vi.hoisted(() => vi.fn());
vi.mock('#lib/telemetry/actionTrail.ts', () => ({ recordAction }));
const { useHighlightShare } = await import('./useHighlightShare.ts');
const { englishHighlightMessages: t } = await import('../messages.ts');

type Result = { status: string; error?: unknown };
function fakeShare(results: Result[] = [{ status: 'shared' }]) {
  const s = {
    canSharePdf: true, shareReady: false,
    clearPrepared: vi.fn(() => { s.shareReady = false; }),
    sharePrepared: vi.fn(async () => results.shift() ?? { status: 'shared' }),
  };
  return s;
}

let host: HTMLElement | null = null;
afterEach(() => { if (host) act(() => render(null, host!)); host?.remove(); host = null; recordAction.mockClear(); });

function mount(share: ReturnType<typeof fakeShare>, prepareFile: () => Promise<boolean>, setAnnouncement = vi.fn()) {
  let api!: ReturnType<typeof useHighlightShare>;
  let bump!: () => void;
  function Probe() {
    const [key, setKey] = useState(0);
    bump = () => setKey((k) => k + 1);
    api = useHighlightShare({ share, prepareFile, resetKey: key, setAnnouncement });
    return null;
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  const rerender = () => act(async () => { render(<Probe />, host!); });
  act(() => render(<Probe />, host!));
  return { get api() { return api; }, rerender, bump: () => act(() => bump()), setAnnouncement };
}

describe('useHighlightShare', () => {
  it('reports canShare and shareReady from the share object', () => {
    const share = fakeShare(); share.shareReady = true;
    const m = mount(share, async () => true);
    expect(m.api.canShare).toBe(true);
    expect(m.api.shareReady).toBe(true);
  });

  it('drops a prepared file when the reset key changes', () => {
    const share = fakeShare();
    const m = mount(share, async () => true);
    share.clearPrepared.mockClear();
    m.bump();
    expect(share.clearPrepared).toHaveBeenCalled();
  });

  it('announces an error when the file cannot be prepared, and does not share', async () => {
    const share = fakeShare();
    const m = mount(share, async () => false);
    await act(async () => { await m.api.onPrepareShare(); });
    expect(m.setAnnouncement).toHaveBeenCalledWith(t.shareError);
    expect(share.sharePrepared).not.toHaveBeenCalled();
  });

  it('opens the sheet at once when the file becomes ready from a tap', async () => {
    const share = fakeShare();
    const m = mount(share, async () => { share.shareReady = true; return true; });
    await act(async () => { await m.api.onPrepareShare(); });
    await m.rerender();
    expect(share.sharePrepared).toHaveBeenCalledTimes(1);
    expect(m.setAnnouncement).toHaveBeenCalledWith(t.shared);
    expect(recordAction).toHaveBeenCalledWith('share');
    await m.rerender();
    expect(share.sharePrepared).toHaveBeenCalledTimes(1);
  });

  it('keeps the file and asks for another tap when the automatic attempt errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const share = fakeShare([{ status: 'error', error: new Error('x') }]);
    const m = mount(share, async () => { share.shareReady = true; return true; });
    share.clearPrepared.mockClear();
    await act(async () => { await m.api.onPrepareShare(); });
    await m.rerender();
    expect(m.setAnnouncement).toHaveBeenLastCalledWith(t.shareReady);
    expect(share.clearPrepared).not.toHaveBeenCalled();
    expect(recordAction).not.toHaveBeenCalled();
  });

  it('announces a canceled automatic attempt', async () => {
    const share = fakeShare([{ status: 'canceled' }]);
    const m = mount(share, async () => { share.shareReady = true; return true; });
    await act(async () => { await m.api.onPrepareShare(); });
    await m.rerender();
    expect(m.setAnnouncement).toHaveBeenLastCalledWith(t.shareCanceled);
  });

  it('ignores a second tap while the file is building', async () => {
    const share = fakeShare();
    let release!: (v: boolean) => void;
    const prepareFile = vi.fn(() => new Promise<boolean>((r) => { release = r; }));
    const m = mount(share, prepareFile);
    let first!: Promise<void>;
    act(() => { first = m.api.onPrepareShare(); });
    await act(async () => { await m.api.onPrepareShare(); });
    expect(prepareFile).toHaveBeenCalledTimes(1);
    await act(async () => { release(false); await first; });
  });

  it('a later tap on a prepared file shares it and records it', async () => {
    const share = fakeShare([{ status: 'shared' }]);
    share.shareReady = true;
    const m = mount(share, async () => true);
    await act(async () => { await m.api.onShare(); });
    expect(m.setAnnouncement).toHaveBeenCalledWith(t.shared);
    expect(recordAction).toHaveBeenCalledWith('share');
  });

  it('a later tap announces cancel and error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const share = fakeShare([{ status: 'canceled' }, { status: 'error', error: new Error('x') }]);
    share.shareReady = true;
    const m = mount(share, async () => true);
    await act(async () => { await m.api.onShare(); });
    expect(m.setAnnouncement).toHaveBeenLastCalledWith(t.shareCanceled);
    await act(async () => { await m.api.onShare(); });
    expect(m.setAnnouncement).toHaveBeenLastCalledWith(t.shareError);
    expect(recordAction).not.toHaveBeenCalled();
  });
});
