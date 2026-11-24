import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { saveHandoff } from '#lib/drafts/draftStore.ts';
import { DRIVE_TOKEN_KEY } from '#lib/handoff/driveSaveLink.ts';
import { reportResult, reportToolLifecycleEvent as report, resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { useSaveToDrive } from './useSaveToDrive.ts';

vi.mock('#lib/drafts/draftStore.ts', { spy: true });
vi.mock('#lib/telemetry/productAnalytics.ts', { spy: true });
const connect = (until = Date.now() + 3_600_000) => localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify({ token: 't', until }));
const closed = async (tab: Window) => { while (!tab.closed) await new Promise((resolve) => { requestAnimationFrame(resolve); }); };
const deleteDatabases = async () => {
  for (const { name } of await indexedDB.databases()) {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(String(name));
      request.onsuccess = request.onerror = resolve;
    });
  }
};

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

describe('useSaveToDrive', () => {
  let container: HTMLElement;
  let latest: ReturnType<typeof useSaveToDrive>;
  let open: MockInstance<typeof window.open>;
  const tabAt = (index: number) => open.mock.results[index].value as Window;
  const Probe = (props: Parameters<typeof useSaveToDrive>[0]) => { latest = useSaveToDrive(props); return null; };
  const mount = (props: Partial<Parameters<typeof useSaveToDrive>[0]> = {}) => {
    const full = { tool: 'redact' as const, build, generation: 1, ready: true, ...props };
    act(() => render(<Probe {...full} />, container));
  };
  const build = async () => ({ blob: pdf, fileName: 'a.pdf' });
  beforeEach(() => {
    container = document.createElement('div');
    open = vi.spyOn(window, 'open');
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
    for (const result of open.mock.results) (result.value as Window | null)?.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await deleteDatabases();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stops saving when the person closes the Drive tab with no answer', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    mount();
    act(() => latest.save());
    await parked();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(latest.state).toBe('saving');
    tabAt(0).close();
    await closed(tabAt(0));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(latest.state).toBe('idle');
    vi.useRealTimers();
  });
});
