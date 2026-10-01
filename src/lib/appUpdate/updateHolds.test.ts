import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  flushBeforeUpdateReload,
  holdUpdate,
  isExportInFlight,
  isUpdateHeld,
  onExportInFlightChange,
  onUpdateHoldChange,
  registerBeforeUpdateReload,
} from './updateHolds.ts';

// The registry is module-scoped, so every test releases what it takes.
const cleanups: Array<() => void> = [];
const track = <T extends () => void>(fn: T): T => { cleanups.push(fn); return fn; };

afterEach(() => {
  vi.useRealTimers();
  while (cleanups.length) cleanups.pop()!();
});

describe('holdUpdate', () => {
  it('isUpdateHeld follows nested holds', () => {
    expect(isUpdateHeld()).toBe(false);
    const a = track(holdUpdate());
    const b = track(holdUpdate());
    expect(isUpdateHeld()).toBe(true);
    a();
    expect(isUpdateHeld()).toBe(true);
    b();
    expect(isUpdateHeld()).toBe(false);
  });

  it('release is idempotent', () => {
    const a = track(holdUpdate());
    const b = track(holdUpdate());
    a();
    a();
    a();
    expect(isUpdateHeld()).toBe(true);
    b();
    expect(isUpdateHeld()).toBe(false);
  });

  it('listeners fire only on the 0 to 1 and 1 to 0 transitions', () => {
    const listener = vi.fn();
    track(onUpdateHoldChange(listener));
    const a = holdUpdate();
    const b = holdUpdate();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(true);
    a();
    expect(listener).toHaveBeenCalledTimes(1);
    b();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn();
    const off = onUpdateHoldChange(listener);
    off();
    holdUpdate()();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('hold kinds (MEM-13)', () => {
  it('a hold with no kind is an export in flight, the safe reading', () => {
    const a = track(holdUpdate());
    expect(isExportInFlight()).toBe(true);
    a();
    expect(isExportInFlight()).toBe(false);
  });

  it("an 'open' hold holds the update but is not an export", () => {
    const a = track(holdUpdate('open'));
    expect(isUpdateHeld()).toBe(true);
    expect(isExportInFlight()).toBe(false);
    a();
    expect(isUpdateHeld()).toBe(false);
  });

  it('export state follows nested exports while open holds come and go', () => {
    const open = track(holdUpdate('open'));
    const a = track(holdUpdate('export'));
    const b = track(holdUpdate('export'));
    a();
    expect(isExportInFlight()).toBe(true);
    b();
    expect(isExportInFlight()).toBe(false);
    expect(isUpdateHeld()).toBe(true);
    open();
    expect(isUpdateHeld()).toBe(false);
  });

  it('export listeners fire only on the 0 to 1 and 1 to 0 export transitions', () => {
    const listener = vi.fn();
    track(onExportInFlightChange(listener));
    const open = holdUpdate('open');
    expect(listener).not.toHaveBeenCalled();
    const a = holdUpdate('export');
    const b = holdUpdate('export');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(true);
    a();
    expect(listener).toHaveBeenCalledTimes(1);
    b();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(false);
    open();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('the combined listener ignores the kind', () => {
    const listener = vi.fn();
    track(onUpdateHoldChange(listener));
    holdUpdate('open')();
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it('unsubscribe stops export notifications', () => {
    const listener = vi.fn();
    onExportInFlightChange(listener)();
    holdUpdate()();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('flushBeforeUpdateReload', () => {
  it('awaits an async flush', async () => {
    let done = false;
    track(registerBeforeUpdateReload(async () => {
      await new Promise((r) => setTimeout(r, 10));
      done = true;
    }));
    await flushBeforeUpdateReload();
    expect(done).toBe(true);
  });

  it('survives a throwing flush and a rejecting flush, and still runs the others', async () => {
    const ok = vi.fn();
    track(registerBeforeUpdateReload(() => { throw new Error('sync'); }));
    track(registerBeforeUpdateReload(() => Promise.reject(new Error('async'))));
    track(registerBeforeUpdateReload(ok));
    await expect(flushBeforeUpdateReload()).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('resolves after timeoutMs when a flush never settles', async () => {
    vi.useFakeTimers();
    track(registerBeforeUpdateReload(() => new Promise(() => {})));
    let resolved = false;
    const p = flushBeforeUpdateReload(500).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(resolved).toBe(true);
  });

  it('unregister removes a flush', async () => {
    const flush = vi.fn();
    const off = registerBeforeUpdateReload(flush);
    off();
    await flushBeforeUpdateReload();
    expect(flush).not.toHaveBeenCalled();
  });
});
