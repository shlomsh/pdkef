import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { peekHandoff, saveHandoff } from '#lib/drafts/draftStore.ts';
import { DRIVE_SAVE_CHANNEL, DRIVE_TOKEN_KEY } from '#lib/handoff/driveSaveLink.ts';
import { reportResult, reportToolLifecycleEvent as report, resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { driveSavePayload, useSaveToDrive } from './useSaveToDrive.ts';

vi.mock('#lib/drafts/draftStore.ts', { spy: true });
vi.mock('#lib/telemetry/productAnalytics.ts', { spy: true });
const connect = (until = Date.now() + 3_600_000) => localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify({ token: 't', until }));
const tell = (data: unknown) => {
  const channel = new BroadcastChannel(DRIVE_SAVE_CHANNEL);
  channel.postMessage(data);
  channel.close();
};
type Tab = { closed: boolean; close(): void };
const events = () => vi.mocked(report).mock.calls.map((call) => call[0]);

/**
 * Call after the tap: resolves with the first park's arguments once the real write has finished. The store marks
 * a finished write in sessionStorage under the Drive tab's id (read from the URL the tap opened), so that is
 * what it waits on.
 */
async function parked(): Promise<unknown[]> {
  const id = new URL(String(vi.mocked(window.open).mock.calls.at(-1)?.[0]), 'http://localhost').searchParams.get('save');
  await waitUntil(() => sessionStorage.getItem(`pdkef:handoff-pending:drive-save-${id}`) !== null);
  await vi.mocked(saveHandoff).mock.results[0].value;
  return vi.mocked(saveHandoff).mock.calls[0];
}

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
  let open: MockInstance<typeof window.open>;
  const tabs: Tab[] = [];
  let harness: ToolHarness;
  const Probe = (props: Parameters<typeof useSaveToDrive>[0]) => { latest = useSaveToDrive(props); return null; };
  const mount = (props: Partial<Parameters<typeof useSaveToDrive>[0]> = {}) => {
    const full = { tool: 'redact' as const, build, generation: 1, ready: true, ...props };
    act(() => render(<Probe {...full} />, container));
  };
  const build = async () => ({ blob: pdf, fileName: 'a.pdf' });
  beforeEach(() => {
    container = document.createElement('div');
    harness = installToolHarness({ trackIndexedDb: true });
    tabs.length = 0;
    // forced: jsdom has no popups.
    open = vi.spyOn(window, 'open').mockImplementation(() => {
      const tab: Tab = { closed: false, close() { this.closed = true; } };
      tabs.push(tab);
      return tab as unknown as Window;
    });
    vi.mocked(saveHandoff).mockReset();
    vi.mocked(report).mockClear();
    vi.mocked(reportResult).mockClear();
    resetUsageEventsForTests();
    localStorage.clear();
    sessionStorage.clear();
    connect();
  });
  afterEach(async () => {
    render(null, container);
    for (const tab of tabs) tab.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await harness.settle();
    harness.restore();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('is available only when ready', () => {
    mount({ ready: false });
    expect(latest.available).toBe(false);
    mount({ ready: true });
    expect(latest.available).toBe(true);
  });

  it('is available only on a hover and fine pointer device', () => {
    // forced: a phone, where the hover and fine pointer query is false
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    mount();
    expect(latest.available).toBe(false);
    // forced: a browser with no matchMedia
    vi.stubGlobal('matchMedia', undefined);
    mount({ generation: 2 });
    expect(latest.available).toBe(false);
    // forced: a matchMedia that throws
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
    mount();
    expect(report).toHaveBeenCalledWith('tool_drive_shown', 'redact');
    expect(events()).toEqual(['tool_drive_shown']);
    act(() => latest.save());
    expect(events()).toEqual(['tool_drive_shown', 'tool_drive_tapped']);
    await parked();
    const id = String(vi.mocked(saveHandoff).mock.calls[0][0]).replace('drive-save-', '');
    tell({ id, status: 'saved', link: null });
    await waitUntil(() => expect(events()).toContain('tool_drive_saved'));
    expect(reportResult).toHaveBeenCalledWith('redact');
    expect(events()).not.toContain('tool_result_ready');
    mount({ generation: 2 });
    expect(events().filter((e) => e === 'tool_drive_shown')).toHaveLength(2);
  });

  it('reports failed on a failed answer, a blocked tab and a parking failure', async () => {
    open.mockReturnValueOnce(null); // forced: a blocked popup
    mount();
    act(() => latest.save());
    expect(events()).toEqual(['tool_drive_shown', 'tool_drive_tapped', 'tool_drive_failed']);
    vi.mocked(report).mockClear();
    vi.mocked(saveHandoff).mockResolvedValue(false); // forced: a store that refuses the file
    mount({ generation: 2 });
    vi.mocked(report).mockClear();
    act(() => latest.save());
    await waitUntil(() => expect(latest.state).toBe('failed')); // fail() sets the state, then reports, in one step
    expect(events()).toContain('tool_drive_failed');
  });

  it('sends nothing for a closed tab', async () => {
    // forced: the Drive tab is polled on a one second interval.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    mount();
    act(() => latest.save());
    await parked();
    tabs[0].close();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(events()).toEqual(['tool_drive_shown', 'tool_drive_tapped']);
  });

  it('opens the Drive tab synchronously, then parks the file', async () => {
    mount();
    act(() => latest.save());
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0][0])).toMatch(/^\/drive\/\?save=[a-z0-9-]+$/);
    expect(open.mock.calls[0][2]).toBeUndefined();
    await parked();
    expect(vi.mocked(saveHandoff).mock.calls[0][0]).toMatch(/^drive-save-/);
    expect((await peekHandoff(String(vi.mocked(saveHandoff).mock.calls[0][0])))?.files?.[0]).toMatchObject({ fileName: 'a.pdf', fileType: 'application/pdf' });
  });

  it('fails when the browser blocks the tab', () => {
    open.mockReturnValue(null); // forced: a blocked popup
    mount();
    act(() => latest.save());
    expect(latest.state).toBe('failed');
    expect(vi.mocked(saveHandoff)).not.toHaveBeenCalled();
  });

  it('settles on the answer for its id and returns to idle on a new generation', async () => {
    mount();
    act(() => latest.save());
    await parked();
    const id = String(vi.mocked(saveHandoff).mock.calls[0][0]).replace('drive-save-', '');
    tell({ id: 'other', status: 'saved' });
    tell({ id, status: 'saved', link: 'https://drive.google.com/file/d/1/view' });
    await waitUntil(() => expect(latest.state).toBe('saved'));
    expect(latest.link).toBe('https://drive.google.com/file/d/1/view');
    mount({ generation: 2 });
    expect(latest.state).toBe('idle');
    expect(latest.link).toBeNull();
  });

  it('keeps the link only when it is a Drive link', async () => {
    mount();
    act(() => latest.save());
    await parked();
    const id = String(vi.mocked(saveHandoff).mock.calls[0][0]).replace('drive-save-', '');
    tell({ id, status: 'saved', link: 'https://evil.example/x' });
    await waitUntil(() => expect(latest.state).toBe('saved'));
    expect(latest.link).toBeNull();
  });

  it('builds after the tab is open, and posts cancelled when the build gives nothing or throws', async () => {
    const posts: unknown[] = [];
    const listener = new BroadcastChannel(DRIVE_SAVE_CHANNEL);
    listener.onmessage = (event) => { posts.push(event.data); };
    let release: (v: null) => void = () => {};
    let built = 0;
    const pendingBuild = () => { built += 1; return new Promise<null>((resolve) => { release = resolve; }); };
    mount({ build: pendingBuild });
    act(() => latest.save());
    expect(open).toHaveBeenCalledTimes(1);
    expect(built).toBe(1);
    expect(vi.mocked(saveHandoff)).not.toHaveBeenCalled();
    act(() => release(null));
    await waitUntil(() => expect(latest.state).toBe('failed'));
    expect(latest.state).toBe('failed');
    await waitUntil(() => expect(posts).toHaveLength(1));
    expect(posts).toEqual([expect.objectContaining({ status: 'cancelled' })]);
    expect(events()).toContain('tool_drive_failed');
    expect(vi.mocked(saveHandoff)).not.toHaveBeenCalled();
    const throwingBuild = async () => { throw new Error('boom'); };
    mount({ generation: 2, build: throwingBuild });
    act(() => latest.save());
    await waitUntil(() => expect(latest.state).toBe('failed'));
    await waitUntil(() => expect(posts).toHaveLength(2));
    expect(events().filter((e) => e === 'tool_drive_failed')).toHaveLength(2);
    listener.close();
  });

  it('ignores a generation change while saving, and resets on one after', async () => {
    let release: (v: { blob: Blob; fileName: string }) => void = () => {};
    const pendingBuild = () => new Promise<{ blob: Blob; fileName: string }>((resolve) => { release = resolve; });
    mount({ build: pendingBuild });
    act(() => latest.save());
    mount({ generation: 2, build: pendingBuild });
    expect(latest.state).toBe('saving');
    await act(async () => { release({ blob: pdf, fileName: 'a.pdf' }); });
    await parked();
    expect(latest.state).toBe('saving');
  });

  it('a late failure from an earlier tap does not end the newer save', async () => {
    // forced: the Drive tab is polled on a one second interval.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let failA: (e: Error) => void = () => {};
    const failingBuild = () => new Promise<never>((_, reject) => { failA = reject; });
    mount({ build: failingBuild });
    act(() => latest.save());
    tabs[0].close();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(latest.state).toBe('idle');
    mount({ build });
    act(() => latest.save());
    expect(latest.state).toBe('saving');
    await parked();
    await act(async () => { failA(new Error('boom')); await Promise.resolve(); await Promise.resolve(); });
    expect(latest.state).toBe('saving');
    const id = String(vi.mocked(saveHandoff).mock.calls[0][0]).replace('drive-save-', '');
    tell({ id, status: 'saved', link: null });
    await waitUntil(() => expect(latest.state).toBe('saved'));
  });
});
