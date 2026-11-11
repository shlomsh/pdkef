import { describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_WINDOW_MS,
  decideChunkReload,
  installChunkReload,
  isChunkLoadFailure,
} from './chunkReload.ts';

describe('isChunkLoadFailure', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://pdkef.com/_astro/a.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: https://pdkef.com/_astro/a.js',
  ])('recognises %s', (message) => {
    expect(isChunkLoadFailure(new TypeError(message))).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isChunkLoadFailure(new Error('IMPORTING A MODULE SCRIPT FAILED'))).toBe(true);
  });

  it('ignores ordinary errors and non-errors', () => {
    expect(isChunkLoadFailure(new TypeError('x is not a function'))).toBe(false);
    expect(isChunkLoadFailure(new Error('Failed to fetch'))).toBe(false);
    expect(isChunkLoadFailure('Importing a module script failed')).toBe(false);
    expect(isChunkLoadFailure(null)).toBe(false);
  });
});

describe('decideChunkReload', () => {
  const now = 1_000_000;
  it('reports a held tab, whatever else is true', () => {
    expect(decideChunkReload({ held: true, lastReloadAt: null, now })).toBe('report-held');
    expect(decideChunkReload({ held: true, lastReloadAt: now - 1, now })).toBe('report-held');
  });
  it('reloads with no earlier reload', () => {
    expect(decideChunkReload({ held: false, lastReloadAt: null, now })).toBe('reload');
  });
  it('reports a repeat inside the window and reloads at its edge', () => {
    expect(decideChunkReload({ held: false, lastReloadAt: now - (CHUNK_RELOAD_WINDOW_MS - 1), now })).toBe('report-repeat');
    expect(decideChunkReload({ held: false, lastReloadAt: now - CHUNK_RELOAD_WINDOW_MS, now })).toBe('reload');
  });
});

function setup(opts: { held?: boolean; storage?: Storage | null; flush?: () => Promise<void>; store?: Map<string, string> } = {}) {
  const listeners = new Map<string, (event: any) => void>();
  const calls: string[] = [];
  const store = opts.store ?? new Map<string, string>();
  const storage = opts.storage === undefined
    ? ({
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
      } as unknown as Storage)
    : opts.storage;
  const win = {
    addEventListener: (type: string, fn: (event: any) => void) => { listeners.set(type, fn); },
    location: { reload: vi.fn(() => { calls.push('reload'); }) },
  };
  const report = vi.fn((_area: string, _err: unknown, step: string) => { calls.push(`report:${step}`); });
  const flush = opts.flush ?? (async () => { calls.push('flush'); });
  let t = 5_000_000;
  installChunkReload({
    win: win as any,
    storage: () => storage,
    now: () => t,
    report: report as any,
    flush,
    isHeld: () => !!opts.held,
  });
  return { listeners, calls, store, win, report, advance: (ms: number) => { t += ms; } };
}

const preloadEvent = () => ({ payload: new TypeError('Failed to fetch dynamically imported module'), preventDefault: vi.fn() });
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

describe('installChunkReload', () => {
  it('reloads after the flush, records the time and reports once', async () => {
    const s = setup();
    const event = preloadEvent();
    s.listeners.get('vite:preloadError')!(event);
    await flushMicrotasks();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(s.calls.indexOf('flush')).toBeGreaterThanOrEqual(0);
    expect(s.calls.indexOf('flush')).toBeLessThan(s.calls.indexOf('reload'));
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
    expect(s.report).toHaveBeenCalledTimes(1);
    expect(s.report.mock.calls[0][0]).toBe('chunk_load');
    expect(s.store.size).toBe(1);
  });

  it('waits for a slow flush before reloading', async () => {
    let release!: () => void;
    const s = setup({ flush: () => new Promise<void>((r) => { release = r; }) });
    s.listeners.get('vite:preloadError')!(preloadEvent());
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    release();
    await flushMicrotasks();
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('a held tab reports and neither reloads nor prevents default', async () => {
    const s = setup({ held: true });
    const event = preloadEvent();
    s.listeners.get('vite:preloadError')!(event);
    await flushMicrotasks();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    expect(s.report).toHaveBeenCalledTimes(1);
    expect(s.report.mock.calls[0][2]).toBe('chunk_failure_held');
  });

  it('a second failure inside the window, on the reloaded page, reports and does not reload', async () => {
    const first = setup();
    first.listeners.get('vite:preloadError')!(preloadEvent());
    await flushMicrotasks();
    expect(first.win.location.reload).toHaveBeenCalledTimes(1);
    // The reload gave a new page: fresh listeners, the same session storage.
    const second = setup({ store: first.store });
    const event = preloadEvent();
    second.listeners.get('vite:preloadError')!(event);
    await flushMicrotasks();
    expect(second.win.location.reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(second.report.mock.calls[0][2]).toBe('chunk_failure_repeat');
  });

  it('storage that throws still reloads once', async () => {
    const storage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    } as unknown as Storage;
    const s = setup({ storage });
    s.listeners.get('vite:preloadError')!(preloadEvent());
    await flushMicrotasks();
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('no storage at all still reloads once', async () => {
    const s = setup({ storage: null });
    s.listeners.get('vite:preloadError')!(preloadEvent());
    await flushMicrotasks();
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('two events in one tick reload once', async () => {
    const s = setup();
    s.listeners.get('vite:preloadError')!(preloadEvent());
    s.listeners.get('unhandledrejection')!({ reason: new TypeError('Importing a module script failed.') });
    await flushMicrotasks();
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
    expect(s.report).toHaveBeenCalledTimes(1);
  });

  it('reloads on an unhandled rejection carrying an import failure', async () => {
    const s = setup();
    s.listeners.get('unhandledrejection')!({ reason: new TypeError('error loading dynamically imported module: x') });
    await flushMicrotasks();
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('ignores an unrelated unhandled rejection', async () => {
    const s = setup();
    s.listeners.get('unhandledrejection')!({ reason: new Error('boom') });
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    expect(s.report).not.toHaveBeenCalled();
  });
});
