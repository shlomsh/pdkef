import { describe, expect, it, vi } from 'vitest';
import { whenReadyToRegister } from './registrationReady';

// A fake page: `islands` is how many astro-island[client="load"][ssr] are
// still waiting; hydrate() removes one and notifies the observer.
function makePage(islands: number) {
  let remaining = islands;
  let notify: () => void = () => {};
  let idle: (() => void) | null = null;
  let resolveLoaded: () => void = () => {};
  const loaded = new Promise<void>((r) => { resolveLoaded = r; });
  const document = {
    querySelector: (sel: string) => (sel === 'astro-island[client="load"][ssr]' && remaining > 0 ? {} : null),
  };
  const MutationObserver = class {
    constructor(cb: () => void) { notify = cb; }
    observe() {}
    disconnect() { notify = () => {}; }
  };
  const deps = {
    loaded,
    document,
    MutationObserver: MutationObserver as any,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (t: unknown) => clearTimeout(t as any),
    requestIdleCallback: (fn: () => void, _o?: { timeout: number }) => { idle = fn; return 1; },
  };
  const done = vi.fn();
  return {
    deps, done,
    load: () => resolveLoaded(),
    hydrate: () => { remaining -= 1; notify(); },
    fireIdle: () => { const f = idle; idle = null; f?.(); },
    hasIdle: () => idle !== null,
  };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('whenReadyToRegister', () => {
  it('waits for the island to lose ssr, even after load', async () => {
    vi.useFakeTimers();
    const p = makePage(1);
    void whenReadyToRegister(p.deps).then(p.done);
    p.load();
    await flush();
    expect(p.hasIdle()).toBe(false);
    expect(p.done).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('resolves after hydration and one idle callback', async () => {
    vi.useFakeTimers();
    const p = makePage(1);
    void whenReadyToRegister(p.deps).then(p.done);
    p.load();
    await flush();
    p.hydrate();
    await flush();
    expect(p.hasIdle()).toBe(true);
    expect(p.done).not.toHaveBeenCalled();
    p.fireIdle();
    await flush();
    expect(p.done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('without an island goes straight to idle after load', async () => {
    vi.useFakeTimers();
    const p = makePage(0);
    void whenReadyToRegister(p.deps).then(p.done);
    await flush();
    expect(p.hasIdle()).toBe(false);
    p.load();
    await flush();
    expect(p.hasIdle()).toBe(true);
    p.fireIdle();
    await flush();
    expect(p.done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('resolves capMs after load if an island never hydrates', async () => {
    vi.useFakeTimers();
    const p = makePage(1);
    void whenReadyToRegister({ ...p.deps, capMs: 5_000 }).then(p.done);
    p.load();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(p.done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(p.done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('falls back to setTimeout where requestIdleCallback is missing', async () => {
    vi.useFakeTimers();
    const p = makePage(0);
    const { requestIdleCallback: _omit, ...deps } = p.deps;
    void whenReadyToRegister(deps).then(p.done);
    p.load();
    await flush();
    await vi.advanceTimersByTimeAsync(1);
    expect(p.done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
