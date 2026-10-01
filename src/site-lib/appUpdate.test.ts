// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdUpdate, registerBeforeUpdateReload } from '../lib/appUpdate/updateHolds';
import { decideRequest, isUpdateWaiting, shouldCheckForUpdate, shouldShowLine, startAppUpdates } from './appUpdate';

type Listener = (event: any) => void;

class Bus {
  channels: FakeChannel[] = [];
}
class FakeChannel {
  listeners: Listener[] = [];
  constructor(private bus: Bus) { bus.channels.push(this); }
  postMessage(data: unknown) {
    for (const other of this.bus.channels) {
      if (other !== this) other.listeners.forEach((l) => queueMicrotask(() => l({ data })));
    }
  }
  addEventListener(_type: string, l: Listener) { this.listeners.push(l); }
}

class Emitter {
  handlers = new Map<string, Listener[]>();
  addEventListener(type: string, l: Listener) { this.handlers.set(type, [...(this.handlers.get(type) ?? []), l]); }
  emit(type: string) { (this.handlers.get(type) ?? []).forEach((l) => l({})); }
}

// The waiting worker answers update-status from `status` (mutable) and
// skip-waiting with `ok`; `messages` records only skip-waiting posts.
function makeWorker(ok = true, status: { ready: boolean; windows: number } | 'silent' = { ready: true, windows: 2 }) {
  const worker: any = new Emitter();
  worker.state = 'installed';
  worker.messages = [] as any[];
  worker.status = status;
  worker.postMessage = vi.fn((message: any, transfer: any[]) => {
    if (message.type === 'pdkef:update-status') {
      if (worker.status !== 'silent') transfer[0].postMessage({ ...worker.status });
      return;
    }
    worker.messages.push(message);
    transfer[0].postMessage({ ok, windows: message.windows, ready: worker.status === 'silent' ? true : worker.status.ready });
  });
  return worker;
}

function makeTab(bus: Bus, opts: { controller?: boolean; waiting?: any } = {}) {
  const line = document.createElement('p');
  line.hidden = true;
  line.dataset.appUpdateState = 'ready';
  line.innerHTML = '<button type="button" data-app-update-reload></button><button type="button" data-app-update-dismiss></button>';
  const reg: any = new Emitter();
  reg.waiting = opts.waiting ?? null;
  reg.installing = null;
  reg.update = vi.fn(() => Promise.resolve());
  const sw: any = new Emitter();
  sw.controller = opts.controller === false ? null : {};
  sw.register = vi.fn(async () => reg);
  const doc: any = new Emitter();
  doc.visibilityState = 'visible';
  const win: any = new Emitter();
  let n = 0;
  let clock = 1_000_000;
  const reload = vi.fn();
  const ports = () => {
    const port1: any = { onmessage: null };
    const port2 = { postMessage: (data: unknown) => port1.onmessage?.({ data }) };
    return { port1, port2 };
  };
  return {
    line, reg, sw, doc, win, reload,
    button: line.querySelector('button') as HTMLButtonElement,
    advanceClock: (ms: number) => { clock += ms; },
    start: () => startAppUpdates({
      serviceWorker: sw,
      line,
      createChannel: () => new FakeChannel(bus),
      reload,
      document: doc,
      window: win,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (t) => clearTimeout(t as any),
      setInterval: (fn, ms) => setInterval(fn, ms),
      now: () => clock,
      randomId: () => `id-${n++}-${Math.random()}`,
      createMessageChannel: ports as any,
    }),
  };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('pure decisions', () => {
  it('isUpdateWaiting needs a waiting worker and a controller', () => {
    expect(isUpdateWaiting({ waiting: {} }, {})).toBe(true);
    expect(isUpdateWaiting({ waiting: {} }, null)).toBe(false);
    expect(isUpdateWaiting({ waiting: null }, {})).toBe(false);
  });
  it('decideRequest waits on any hold and counts distinct windows', () => {
    expect(decideRequest({ selfHeld: true, answers: [] })).toEqual({ action: 'wait' });
    expect(decideRequest({ selfHeld: false, answers: [{ from: 'a', held: true }] })).toEqual({ action: 'wait' });
    expect(decideRequest({ selfHeld: false, answers: [{ from: 'a', held: false }, { from: 'a', held: false }] }))
      .toEqual({ action: 'skip-waiting', windows: 2 });
  });
  it('shouldCheckForUpdate is true from 30 minutes', () => {
    expect(shouldCheckForUpdate(0, 29 * 60_000)).toBe(false);
    expect(shouldCheckForUpdate(0, 30 * 60_000)).toBe(true);
  });
  it('shouldShowLine needs a ready build and more than one window', () => {
    expect(shouldShowLine({ ready: true, windows: 2 })).toBe(true);
    expect(shouldShowLine({ ready: true, windows: 1 })).toBe(false);
    expect(shouldShowLine({ ready: false, windows: 3 })).toBe(false);
    expect(shouldShowLine({ ready: false, windows: 1 })).toBe(false);
  });
});

describe('startAppUpdates', () => {
  it('stays hidden with no waiting worker', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    expect(tab.line.hidden).toBe(true);
  });

  it('stays hidden on a first install (waiting but no controller)', async () => {
    const tab = makeTab(new Bus(), { controller: false, waiting: makeWorker() });
    await tab.start();
    expect(tab.line.hidden).toBe(true);
  });

  it('shows on waiting plus controller', async () => {
    const tab = makeTab(new Bus(), { waiting: makeWorker() });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    expect(tab.line.dataset.appUpdateState).toBe('ready');
  });

  it('shows after updatefound reaches installed', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    const installing: any = new Emitter();
    installing.state = 'installing';
    tab.reg.installing = installing;
    tab.reg.emit('updatefound');
    installing.state = 'installed';
    tab.reg.waiting = makeWorker();
    installing.emit('statechange');
    await settle();
    expect(tab.line.hidden).toBe(false);
  });

  it('a single tab never shows the line', async () => {
    const tab = makeTab(new Bus(), { waiting: makeWorker(true, { ready: true, windows: 1 }) });
    await tab.start();
    expect(tab.line.hidden).toBe(true);
  });

  it('a build that is not ready never shows the line', async () => {
    const tab = makeTab(new Bus(), { waiting: makeWorker(true, { ready: false, windows: 3 }) });
    await tab.start();
    expect(tab.line.hidden).toBe(true);
  });

  it('a status timeout hides the line', async () => {
    const worker = makeWorker();
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    worker.status = 'silent';
    tab.doc.emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(2500);
    expect(tab.line.hidden).toBe(true);
  });

  it('drops from two windows to one on a tab-closed message and hides the line', async () => {
    const bus = new Bus();
    const worker = makeWorker();
    const tab = makeTab(bus, { waiting: worker });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    worker.status = { ready: true, windows: 1 };
    new FakeChannel(bus).postMessage({ type: 'tab-closed' });
    await vi.advanceTimersByTimeAsync(1100);
    expect(tab.line.hidden).toBe(true);
    expect(tab.line.dataset.appUpdateState).toBe('ready');
  });

  it('pagehide tells the other tabs this one closed', async () => {
    const bus = new Bus();
    const a = makeTab(bus, { waiting: makeWorker() });
    const bWorker = makeWorker();
    const b = makeTab(bus, { waiting: bWorker });
    await a.start();
    await b.start();
    expect(b.line.hidden).toBe(false);
    bWorker.status = { ready: true, windows: 1 };
    a.win.emit('pagehide');
    await vi.advanceTimersByTimeAsync(1100);
    expect(b.line.hidden).toBe(true);
  });

  it('going offline re-checks and hides when the build is no longer ready; online brings it back', async () => {
    const worker = makeWorker();
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    worker.status = { ready: false, windows: 2 };
    tab.win.emit('offline');
    await vi.advanceTimersByTimeAsync(0);
    expect(tab.line.hidden).toBe(true);
    worker.status = { ready: true, windows: 2 };
    tab.win.emit('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(tab.line.hidden).toBe(false);
  });

  it('a skip-waiting reply with ready:false hides the line instead of blocking', async () => {
    const worker = makeWorker(false);
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    worker.status = { ready: false, windows: 2 };
    tab.button.click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tab.line.hidden).toBe(true);
    expect(worker.messages).toHaveLength(1);
  });

  it('click with no holds posts skip-waiting with windows = answering tabs + 1', async () => {
    const bus = new Bus();
    const worker = makeWorker();
    const a = makeTab(bus, { waiting: worker });
    const b = makeTab(bus, { waiting: makeWorker() });
    await a.start();
    await b.start();
    a.button.click();
    await vi.advanceTimersByTimeAsync(500);
    expect(worker.messages).toEqual([{ type: 'pdkef:skip-waiting', windows: 2 }]);
  });

  it('a held answer posts nothing and puts both tabs in waiting; the release brings Reload back without reloading', async () => {
    const bus = new Bus();
    const worker = makeWorker();
    const a = makeTab(bus, { waiting: worker });
    const b = makeTab(bus, { waiting: makeWorker() });
    await a.start();
    await b.start();
    const release = holdUpdate();
    try {
      // The module-scoped registry is shared by both fake tabs, so both answer held.
      a.button.click();
      await vi.advanceTimersByTimeAsync(500);
      expect(worker.messages).toEqual([]);
      expect(a.line.dataset.appUpdateState).toBe('waiting');
      expect(b.line.dataset.appUpdateState).toBe('waiting');
    } finally {
      release();
    }
    await vi.advanceTimersByTimeAsync(500);
    // The finished export's result may still be waiting for its Download, so
    // the person clicks again; nothing reloads on its own.
    expect(worker.messages).toEqual([]);
    expect(a.line.dataset.appUpdateState).toBe('ready');
    expect(b.line.dataset.appUpdateState).toBe('ready');
  });

  it('a waiting tab gets Reload back when the holding tab is gone', async () => {
    const bus = new Bus();
    const a = makeTab(bus, { waiting: makeWorker() });
    await a.start();
    // Another tab said it was exporting, then closed without a word.
    new FakeChannel(bus).postMessage({ type: 'update-waiting' });
    await vi.advanceTimersByTimeAsync(0);
    expect(a.line.dataset.appUpdateState).toBe('waiting');
    await vi.advanceTimersByTimeAsync(6000);
    expect(a.line.dataset.appUpdateState).toBe('ready');
    expect(a.reload).not.toHaveBeenCalled();
  });

  it('does nothing when registration is refused or blocked', async () => {
    const refused = makeTab(new Bus());
    refused.sw.register = vi.fn(async () => { throw new Error('SecurityError'); });
    await expect(refused.start()).resolves.toBeUndefined();
    const blocked = makeTab(new Bus());
    blocked.sw.register = vi.fn(async () => undefined);
    await expect(blocked.start()).resolves.toBeUndefined();
    expect(blocked.line.hidden).toBe(true);
  });

  it('dismiss hides the line for this page only; it stays in the update', async () => {
    const bus = new Bus();
    const worker = makeWorker();
    const a = makeTab(bus, { waiting: worker });
    const b = makeTab(bus, { waiting: makeWorker() });
    await a.start();
    await b.start();
    (b.line.querySelector('[data-app-update-dismiss]') as HTMLButtonElement).click();
    expect(b.line.hidden).toBe(true);
    expect(a.line.hidden).toBe(false);
    // A state change elsewhere does not bring it back...
    new FakeChannel(bus).postMessage({ type: 'update-waiting' });
    await vi.advanceTimersByTimeAsync(0);
    expect(b.line.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(6000);
    // ...and it still counts as an answering window and reloads with the rest.
    a.button.click();
    await vi.advanceTimersByTimeAsync(500);
    expect(worker.messages).toEqual([{ type: 'pdkef:skip-waiting', windows: 2 }]);
    b.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(0);
    expect(b.reload).toHaveBeenCalledTimes(1);
  });

  it('shows the line for a worker that was already installing when the tab loaded', async () => {
    const tab = makeTab(new Bus());
    const installing: any = new Emitter();
    installing.state = 'installing';
    tab.reg.installing = installing;
    await tab.start();
    installing.state = 'installed';
    tab.reg.waiting = makeWorker();
    installing.emit('statechange');
    await settle();
    expect(tab.line.hidden).toBe(false);
  });

  it('ok:false retries, then says to close the other tabs and keeps the button', async () => {
    const worker = makeWorker(false);
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    tab.button.click();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(worker.messages).toHaveLength(3);
    expect(tab.line.dataset.appUpdateState).toBe('blocked');
    expect(tab.button.disabled).toBe(false);
  });

  it('controllerchange awaits registered flushes before reloading', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    let finish!: () => void;
    const unregister = registerBeforeUpdateReload(() => new Promise<void>((r) => { finish = r; }));
    tab.sw.emit('controllerchange');
    await settle();
    expect(tab.reload).not.toHaveBeenCalled();
    finish();
    await settle();
    expect(tab.reload).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('controllerchange on a first install never reloads', async () => {
    const tab = makeTab(new Bus(), { controller: false });
    await tab.start();
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).not.toHaveBeenCalled();
  });

  it('a tab first controlled by the install claim still reloads on the next update', async () => {
    const tab = makeTab(new Bus(), { controller: false });
    await tab.start();
    tab.sw.controller = {};
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).not.toHaveBeenCalled();
    tab.sw.controller = {};
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once even if controllerchange fires twice', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    tab.sw.emit('controllerchange');
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });

  it('controllerchange waits for a hold to clear', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    const release = holdUpdate();
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });

  it('the visibility check throttles update()', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    tab.doc.emit('visibilitychange');
    expect(tab.reg.update).not.toHaveBeenCalled();
    tab.advanceClock(31 * 60_000);
    tab.doc.emit('visibilitychange');
    expect(tab.reg.update).toHaveBeenCalledTimes(1);
    tab.doc.emit('visibilitychange');
    expect(tab.reg.update).toHaveBeenCalledTimes(1);
  });

  it('swallows an update() rejection', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    tab.reg.update = vi.fn(() => Promise.reject(new Error('offline')));
    tab.advanceClock(31 * 60_000);
    tab.doc.emit('visibilitychange');
    await settle();
    expect(tab.reg.update).toHaveBeenCalled();
  });
});
