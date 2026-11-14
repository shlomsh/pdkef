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

  // MEM-51: the guard's own error, and what each browser says when the old shared chunk has no guard export yet.
  it.each([
    'pdkef:chunk-interface-mismatch scan-late',
    "The requested module './tools-common.js' does not provide an export named 'pdkefIface'",
    "import not found: pdkefIface",
    "Importing binding name 'pdkefIface' is not found.",
  ])('recognises the interface guard failure %s', (message) => {
    expect(isChunkLoadFailure(new Error(message))).toBe(true);
    expect(isChunkLoadFailure(new SyntaxError(message))).toBe(true);
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
  const base = { canRecord: true, online: true };
  it('reports a held tab, whatever else is true', () => {
    expect(decideChunkReload({ ...base, held: true, lastReloadAt: null, now })).toBe('report-held');
    expect(decideChunkReload({ ...base, held: true, lastReloadAt: now - 1, now })).toBe('report-held');
  });
  it('reloads with no earlier reload', () => {
    expect(decideChunkReload({ ...base, held: false, lastReloadAt: null, now })).toBe('reload');
  });
  it('reports a repeat inside the window and reloads at its edge', () => {
    expect(decideChunkReload({ ...base, held: false, lastReloadAt: now - (CHUNK_RELOAD_WINDOW_MS - 1), now })).toBe('report-repeat');
    expect(decideChunkReload({ ...base, held: false, lastReloadAt: now - CHUNK_RELOAD_WINDOW_MS, now })).toBe('reload');
  });
  it('reports instead of reloading when the record cannot be kept', () => {
    expect(decideChunkReload({ ...base, canRecord: false, held: false, lastReloadAt: null, now })).toBe('report-unrecorded');
  });
  it('reports offline instead of reloading', () => {
    expect(decideChunkReload({ ...base, online: false, held: false, lastReloadAt: null, now })).toBe('report-offline');
  });
});

function setup(opts: { held?: boolean; online?: boolean; heldAfterFlush?: boolean; storage?: Storage | null; flush?: () => Promise<void>; store?: Map<string, string>; settle?: () => Promise<void> } = {}) {
  const listeners = new Map<string, (event: any) => void>();
  const calls: string[] = [];
  const store = opts.store ?? new Map<string, string>();
  const storage = opts.storage === undefined
    ? ({
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
      } as unknown as Storage)
    : opts.storage;
  const win = {
    addEventListener: (type: string, fn: (event: any) => void) => { listeners.set(type, fn); },
    location: { reload: vi.fn(() => { calls.push('reload'); }) },
  };
  const report = vi.fn((_area: string, _err: unknown, step: string) => { calls.push(`report:${step}`); });
  let held = !!opts.held;
  const flush = opts.flush ?? (async () => { calls.push('flush'); if (opts.heldAfterFlush) held = true; });
  let t = 5_000_000;
  installChunkReload({
    win: win as any,
    storage: () => storage,
    now: () => t,
    report: report as any,
    flush,
    isHeld: () => held,
    isOnline: () => opts.online !== false,
    settle: opts.settle ?? (async () => {}),
  });
  return { listeners, calls, store, win, report, advance: (ms: number) => { t += ms; } };
}

const preloadEvent = () => ({ payload: new TypeError('Failed to fetch dynamically imported module'), preventDefault: vi.fn() });
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

describe('installChunkReload while the page is leaving', () => {
  // WebKit rejects module loads a navigation cancels with "Importing a module script failed.":
  // reloading then would take the person back to the page they were leaving.
  const gated = () => {
    let release!: () => void;
    const settle = () => new Promise<void>((r) => { release = r; });
    return { settle, release: () => release() };
  };

  it.each(['pagehide', 'beforeunload'])('a failure followed by %s neither reloads nor reports', async (leaving) => {
    const gate = gated();
    const s = setup({ settle: gate.settle });
    s.listeners.get('unhandledrejection')!({ reason: new TypeError('Importing a module script failed.') });
    s.listeners.get(leaving)!({ persisted: false });
    gate.release();
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    expect(s.report).not.toHaveBeenCalled();
    expect(s.store.size).toBe(0);
  });

  it('a page back from the back-forward cache reloads on a later failure', async () => {
    const first = gated();
    let settle = first.settle;
    const s = setup({ settle: () => settle() });
    s.listeners.get('vite:preloadError')!(preloadEvent());
    s.listeners.get('pagehide')!({ persisted: true });
    first.release();
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    s.listeners.get('pageshow')!({ persisted: true });
    settle = async () => {};
    s.listeners.get('vite:preloadError')!(preloadEvent());
    await flushMicrotasks();
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
  });
});

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

  const throwingStorage = () => ({
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  } as unknown as Storage);

  it('storage that throws reports and does not reload or prevent default', async () => {
    const s = setup({ storage: throwingStorage() });
    const event = preloadEvent();
    s.listeners.get('vite:preloadError')!(event);
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(s.report.mock.calls.map((c) => c[2])).toEqual(['chunk_failure_unrecorded']);
  });

  it('no storage at all reports and does not reload', async () => {
    const s = setup({ storage: null });
    s.listeners.get('vite:preloadError')!(preloadEvent());
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    expect(s.report.mock.calls.map((c) => c[2])).toEqual(['chunk_failure_unrecorded']);
  });

  it('a write that does not read back reports and does not reload', async () => {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage;
    const s = setup({ storage });
    s.listeners.get('vite:preloadError')!(preloadEvent());
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    expect(s.report.mock.calls[0][2]).toBe('chunk_failure_unrecorded');
  });

  it('the reloaded page with throwing storage does not loop', async () => {
    const first = setup({ storage: throwingStorage() });
    first.listeners.get('vite:preloadError')!(preloadEvent());
    const second = setup({ storage: throwingStorage() });
    second.listeners.get('vite:preloadError')!(preloadEvent());
    await flushMicrotasks();
    expect(first.win.location.reload).not.toHaveBeenCalled();
    expect(second.win.location.reload).not.toHaveBeenCalled();
  });

  it('a held tab reports once even when the failure arrives twice', async () => {
    const s = setup({ held: true });
    const error = new TypeError('Failed to fetch dynamically imported module');
    s.listeners.get('vite:preloadError')!({ payload: error, preventDefault: vi.fn() });
    s.listeners.get('unhandledrejection')!({ reason: error });
    await flushMicrotasks();
    s.listeners.get('unhandledrejection')!({ reason: error });
    await flushMicrotasks();
    expect(s.report).toHaveBeenCalledTimes(1);
    expect(s.win.location.reload).not.toHaveBeenCalled();
  });

  it('offline reports and does not reload', async () => {
    const s = setup({ online: false });
    const event = preloadEvent();
    s.listeners.get('vite:preloadError')!(event);
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(s.report.mock.calls.map((c) => c[2])).toEqual(['chunk_failure_offline']);
  });

  it('a hold that starts during the flush stops the reload and reports held', async () => {
    const s = setup({ heldAfterFlush: true });
    s.listeners.get('vite:preloadError')!(preloadEvent());
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    expect(s.report.mock.calls.map((c) => c[2])).toEqual(['chunk_failure_reload', 'chunk_failure_held']);
  });

  it('two events in one tick reload once', async () => {
    const s = setup();
    s.listeners.get('vite:preloadError')!(preloadEvent());
    s.listeners.get('unhandledrejection')!({ reason: new TypeError('Importing a module script failed.') });
    await flushMicrotasks();
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
    expect(s.report).toHaveBeenCalledTimes(1);
  });

  const twoInOneWindow = async (opts: { held?: boolean; online?: boolean }) => {
    let release!: () => void;
    const s = setup({ ...opts, settle: () => new Promise<void>((r) => { release = r; }) });
    const first = preloadEvent();
    const second = preloadEvent();
    s.listeners.get('vite:preloadError')!(first);
    s.listeners.get('vite:preloadError')!(second);
    release();
    await flushMicrotasks();
    return { s, first, second };
  };

  it('two failures in one settle window, about to reload, are both default-prevented and reload once', async () => {
    const { s, first, second } = await twoInOneWindow({});
    expect(first.preventDefault).toHaveBeenCalledTimes(1);
    expect(second.preventDefault).toHaveBeenCalledTimes(1);
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it.each([['held', { held: true }], ['offline', { online: false }]])('two failures in one settle window while %s are not default-prevented and report once', async (_name, opts) => {
    const { s, first, second } = await twoInOneWindow(opts);
    expect(first.preventDefault).not.toHaveBeenCalled();
    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(s.report).toHaveBeenCalledTimes(1);
    expect(s.win.location.reload).not.toHaveBeenCalled();
  });

  it('reloads on an unhandled rejection carrying an import failure', async () => {
    const s = setup();
    s.listeners.get('unhandledrejection')!({ reason: new TypeError('error loading dynamically imported module: x') });
    await flushMicrotasks();
    expect(s.win.location.reload).toHaveBeenCalledTimes(1);
  });

  // MEM-51: the same rules for the guard's failure, which also arrives as a preload error (a wrapped import) or a bare rejection.
  describe('an interface guard failure (MEM-51)', () => {
    const mismatch = () => new Error('pdkef:chunk-interface-mismatch scan-late');

    it('reloads once after the flush, from a preload error', async () => {
      const s = setup();
      const event = { payload: mismatch(), preventDefault: vi.fn() };
      s.listeners.get('vite:preloadError')!(event);
      await flushMicrotasks();
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(s.calls.indexOf('flush')).toBeLessThan(s.calls.indexOf('reload'));
      expect(s.win.location.reload).toHaveBeenCalledTimes(1);
    });

    it('reloads once from an unhandled rejection, even when it arrives twice', async () => {
      const s = setup();
      s.listeners.get('unhandledrejection')!({ reason: mismatch() });
      s.listeners.get('unhandledrejection')!({ reason: new SyntaxError("The requested module './x.js' does not provide an export named 'pdkefIface'") });
      await flushMicrotasks();
      expect(s.win.location.reload).toHaveBeenCalledTimes(1);
    });

    it('never reloads while an update hold is set', async () => {
      const s = setup({ held: true });
      s.listeners.get('unhandledrejection')!({ reason: mismatch() });
      await flushMicrotasks();
      expect(s.win.location.reload).not.toHaveBeenCalled();
      expect(s.report.mock.calls[0][2]).toBe('chunk_failure_held');
    });

    it('does not reload when a hold starts during the flush', async () => {
      const s = setup({ heldAfterFlush: true });
      s.listeners.get('unhandledrejection')!({ reason: mismatch() });
      await flushMicrotasks();
      expect(s.win.location.reload).not.toHaveBeenCalled();
    });

    it('reloads at most once per window: the reloaded page that fails again reports a repeat', async () => {
      const store = new Map<string, string>();
      const first = setup({ store });
      first.listeners.get('unhandledrejection')!({ reason: mismatch() });
      await flushMicrotasks();
      expect(first.win.location.reload).toHaveBeenCalledTimes(1);
      const reloaded = setup({ store });
      reloaded.listeners.get('unhandledrejection')!({ reason: mismatch() });
      await flushMicrotasks();
      expect(reloaded.win.location.reload).not.toHaveBeenCalled();
      expect(reloaded.report.mock.calls.map((c) => c[2])).toEqual(['chunk_failure_repeat']);
    });
  });

  it('ignores an unrelated unhandled rejection', async () => {
    const s = setup();
    s.listeners.get('unhandledrejection')!({ reason: new Error('boom') });
    await flushMicrotasks();
    expect(s.win.location.reload).not.toHaveBeenCalled();
    expect(s.report).not.toHaveBeenCalled();
  });
});
