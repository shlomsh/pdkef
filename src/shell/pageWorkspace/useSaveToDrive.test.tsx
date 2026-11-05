import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_SAVE_CHANNEL, DRIVE_TOKEN_KEY } from '#lib/handoff/driveSaveLink.ts';
import { driveSavePayload, useSaveToDrive } from './useSaveToDrive.ts';

const saveHandoff = vi.hoisted(() => vi.fn());
vi.mock('#lib/drafts/draftStore.ts', () => ({ saveHandoff }));
vi.mock('#lib/telemetry/actionTrail.ts', () => ({ recordAction: vi.fn() }));
const report = vi.hoisted(() => vi.fn());
vi.mock('#lib/telemetry/productAnalytics.ts', () => ({ reportToolLifecycleEvent: report }));
const connect = (until = Date.now() + 3_600_000) => localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify({ token: 't', until }));
const events = () => report.mock.calls.map((call) => call[0]);

const pdf = new Blob(['%PDF'], { type: 'application/pdf' });

describe('driveSavePayload', () => {
  it('is one file for a single blob', async () => {
    const payload = await driveSavePayload(pdf, null, 'a.pdf');
    expect(payload.folderName).toBeUndefined();
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0]).toMatchObject({ fileName: 'a.pdf', fileType: 'application/pdf' });
    expect(payload.files[0].fileBytes.byteLength).toBe(4);
  });

  it('is a folder named for the file without its extension for several parts', async () => {
    const parts = [{ blob: pdf, filename: 'p1.pdf' }, { blob: pdf, filename: 'p2.pdf' }];
    const payload = await driveSavePayload(null, parts, 'split_report.zip');
    expect(payload.folderName).toBe('split_report');
    expect(payload.files.map((f) => f.fileName)).toEqual(['p1.pdf', 'p2.pdf']);
  });
});

describe('useSaveToDrive', () => {
  let container: HTMLElement;
  let latest: ReturnType<typeof useSaveToDrive>;
  const Probe = (props: Parameters<typeof useSaveToDrive>[0]) => { latest = useSaveToDrive(props); return null; };
  const mount = (props: Partial<Parameters<typeof useSaveToDrive>[0]> = {}) => {
    const full = { tool: 'redact' as const, blob: pdf, parts: null, fileName: 'a.pdf', generation: 1, ready: true, ...props };
    act(() => render(<Probe {...full} />, container));
  };
  beforeEach(() => {
    container = document.createElement('div');
    saveHandoff.mockReset().mockResolvedValue(true);
    report.mockReset();
    localStorage.clear();
    connect();
  });
  afterEach(() => { render(null, container); vi.restoreAllMocks(); });

  it('is available only when ready', () => {
    mount({ ready: false });
    expect(latest.available).toBe(false);
    mount({ ready: true });
    expect(latest.available).toBe(true);
  });

  it('is not available when not connected, and is with an expired record', () => {
    localStorage.clear();
    mount();
    expect(latest.available).toBe(false);
    connect(1);
    act(() => { window.dispatchEvent(new Event('storage')); });
    expect(latest.available).toBe(true);
  });

  it('reports shown once per output, tapped, and saved or failed', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const channels: { onmessage: ((e: MessageEvent) => void) | null }[] = [];
    class FakeChannel { onmessage = null; constructor() { channels.push(this as never); } close() {} }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    mount();
    expect(report).toHaveBeenCalledWith('tool_drive_shown', 'redact');
    expect(events()).toEqual(['tool_drive_shown']);
    act(() => latest.save());
    expect(events()).toEqual(['tool_drive_shown', 'tool_drive_tapped']);
    await act(async () => { await vi.waitFor(() => expect(saveHandoff).toHaveBeenCalled()); });
    const id = String(saveHandoff.mock.calls[0][0]).replace('drive-save-', '');
    act(() => channels[0].onmessage?.({ data: { id, status: 'saved' } } as MessageEvent));
    expect(events().at(-1)).toBe('tool_drive_saved');
    mount({ generation: 2 });
    expect(events().filter((e) => e === 'tool_drive_shown')).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it('reports failed on a failed answer, a blocked tab and a parking failure', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    mount();
    act(() => latest.save());
    expect(events()).toEqual(['tool_drive_shown', 'tool_drive_tapped', 'tool_drive_failed']);
    report.mockReset();
    open.mockReturnValue({} as Window);
    saveHandoff.mockResolvedValue(false);
    mount({ generation: 2 });
    report.mockReset();
    act(() => latest.save());
    await act(async () => { await vi.waitFor(() => expect(events()).toContain('tool_drive_failed')); });
  });

  it('sends nothing for a closed tab', () => {
    vi.useFakeTimers();
    const tab = { closed: false };
    vi.spyOn(window, 'open').mockReturnValue(tab as Window);
    class FakeChannel { onmessage = null; close() {} }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    mount();
    act(() => latest.save());
    tab.closed = true;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(events()).toEqual(['tool_drive_shown', 'tool_drive_tapped']);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens the Drive tab synchronously, then parks the file', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    mount();
    act(() => latest.save());
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0][0])).toMatch(/^\/drive\/\?save=[a-z0-9-]+$/);
    expect(open.mock.calls[0][2]).toBeUndefined();
    await act(async () => { await vi.waitFor(() => expect(saveHandoff).toHaveBeenCalled()); });
    expect(saveHandoff.mock.calls[0][0]).toMatch(/^drive-save-/);
  });

  it('fails when the browser blocks the tab', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    mount();
    act(() => latest.save());
    expect(latest.state).toBe('failed');
    expect(saveHandoff).not.toHaveBeenCalled();
  });

  it('settles on the answer for its id and returns to idle on a new generation', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const channels: BroadcastChannel[] = [];
    class FakeChannel {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor(public name: string) { channels.push(this as never); }
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    mount();
    act(() => latest.save());
    await act(async () => { await vi.waitFor(() => expect(saveHandoff).toHaveBeenCalled()); });
    const id = String(saveHandoff.mock.calls[0][0]).replace('drive-save-', '');
    expect((channels[0] as never as { name: string }).name).toBe(DRIVE_SAVE_CHANNEL);
    const send = (data: unknown) => act(() => channels[0].onmessage?.({ data } as MessageEvent));
    send({ id: 'other', status: 'saved' });
    expect(latest.state).toBe('saving');
    send({ id, status: 'saved' });
    expect(latest.state).toBe('saved');
    mount({ generation: 2 });
    expect(latest.state).toBe('idle');
    vi.unstubAllGlobals();
  });

  it('stops saving when the person closes the Drive tab with no answer', async () => {
    vi.useFakeTimers();
    const tab = { closed: false };
    vi.spyOn(window, 'open').mockReturnValue(tab as Window);
    class FakeChannel { onmessage = null; close() {} }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    mount();
    act(() => latest.save());
    act(() => { vi.advanceTimersByTime(3000); });
    expect(latest.state).toBe('saving');
    tab.closed = true;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(latest.state).toBe('idle');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
