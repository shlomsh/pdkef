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
  it('is always one file', async () => {
    const payload = await driveSavePayload(pdf, 'a.pdf');
    expect(payload.folderName).toBeUndefined();
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0]).toMatchObject({ fileName: 'a.pdf', fileType: 'application/pdf' });
    expect(payload.files[0].fileBytes.byteLength).toBe(4);
  });
});

describe('useSaveToDrive', () => {
  let container: HTMLElement;
  let latest: ReturnType<typeof useSaveToDrive>;
  const Probe = (props: Parameters<typeof useSaveToDrive>[0]) => { latest = useSaveToDrive(props); return null; };
  const mount = (props: Partial<Parameters<typeof useSaveToDrive>[0]> = {}) => {
    const full = { tool: 'redact' as const, build, generation: 1, ready: true, ...props };
    act(() => render(<Probe {...full} />, container));
  };
  const build = vi.fn(async () => ({ blob: pdf, fileName: 'a.pdf' }));
  beforeEach(() => {
    build.mockClear();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    container = document.createElement('div');
    saveHandoff.mockReset().mockResolvedValue(true);
    report.mockReset();
    localStorage.clear();
    connect();
  });
  afterEach(() => { render(null, container); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('is available only when ready', () => {
    mount({ ready: false });
    expect(latest.available).toBe(false);
    mount({ ready: true });
    expect(latest.available).toBe(true);
  });

  it('is available only on a hover and fine pointer device', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    mount();
    expect(latest.available).toBe(false);
    vi.stubGlobal('matchMedia', undefined);
    mount({ generation: 2 });
    expect(latest.available).toBe(false);
    vi.stubGlobal('matchMedia', () => { throw new Error('no'); });
    mount({ generation: 3 });
    expect(latest.available).toBe(false);
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
    act(() => channels[0].onmessage?.({ data: { id, status: 'saved', link: null } } as MessageEvent));
    expect(events()).toContain('tool_drive_saved');
    expect(events()).toContain('tool_result_ready');
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
    send({ id, status: 'saved', link: 'https://drive.google.com/file/d/1/view' });
    expect(latest.state).toBe('saved');
    expect(latest.link).toBe('https://drive.google.com/file/d/1/view');
    mount({ generation: 2 });
    expect(latest.state).toBe('idle');
    expect(latest.link).toBeNull();
    vi.unstubAllGlobals();
  });

  it('keeps the link only when it is a Drive link', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const channels: { onmessage: ((e: MessageEvent) => void) | null }[] = [];
    class FakeChannel { onmessage = null; constructor() { channels.push(this as never); } close() {} postMessage() {} }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    mount();
    act(() => latest.save());
    await act(async () => { await vi.waitFor(() => expect(saveHandoff).toHaveBeenCalled()); });
    const id = String(saveHandoff.mock.calls[0][0]).replace('drive-save-', '');
    act(() => channels[0].onmessage?.({ data: { id, status: 'saved', link: 'https://evil.example/x' } } as MessageEvent));
    expect(latest.state).toBe('saved');
    expect(latest.link).toBeNull();
  });

  it('builds after the tab is open, and posts cancelled when the build gives nothing or throws', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const posts: unknown[] = [];
    class FakeChannel { onmessage = null; close() {} postMessage(m: unknown) { posts.push(m); } }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    let release: (v: null) => void = () => {};
    build.mockImplementationOnce(() => new Promise((resolve) => { release = resolve as never; }));
    mount();
    act(() => latest.save());
    expect(open).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(saveHandoff).not.toHaveBeenCalled();
    await act(async () => { release(null); await vi.waitFor(() => expect(events()).toContain('tool_drive_failed')); });
    expect(latest.state).toBe('failed');
    expect(posts).toEqual([expect.objectContaining({ status: 'cancelled' })]);
    expect(events()).toContain('tool_drive_failed');
    expect(saveHandoff).not.toHaveBeenCalled();
    build.mockRejectedValueOnce(new Error('boom'));
    mount({ generation: 2 });
    act(() => latest.save());
    await act(async () => { await vi.waitFor(() => expect(posts).toHaveLength(2)); await vi.waitFor(() => expect(events().filter((e) => e === 'tool_drive_failed')).toHaveLength(2)); });
    expect(latest.state).toBe('failed');
  });

  it('ignores a generation change while saving, and resets on one after', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);
    class FakeChannel { onmessage = null; close() {} postMessage() {} }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    let release: (v: { blob: Blob; fileName: string }) => void = () => {};
    build.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    mount();
    act(() => latest.save());
    mount({ generation: 2 });
    expect(latest.state).toBe('saving');
    await act(async () => { release({ blob: pdf, fileName: 'a.pdf' }); await vi.waitFor(() => expect(saveHandoff).toHaveBeenCalled()); });
    expect(latest.state).toBe('saving');
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
