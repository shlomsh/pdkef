// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdUpdate, registerBeforeUpdateReload } from '../lib/appUpdate/updateHolds';
import {
  BUSY_QUERY,
  LEAVING_RESET_MS,
  RECHECK_SHOWN_MS,
  STATUS_TIMEOUT_MS,
  TAB_CLOSED_RECHECK_MS,
  isUpdateWaiting,
  lineStateFor,
  shouldCheckForUpdate,
  startAppUpdates,
} from './appUpdate';

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
  removeEventListener(type: string, l: Listener) {
    this.handlers.set(type, (this.handlers.get(type) ?? []).filter((x) => x !== l));
  }
  emit(type: string, event: any = {}) { (this.handlers.get(type) ?? []).forEach((l) => l(event)); }
  count(type: string) { return (this.handlers.get(type) ?? []).length; }
}

// The waiting worker answers update-status from `status` (mutable); 'silent'
// never answers. `posts` records every message it was sent.
type Status = { ready?: boolean; busy?: number; silent?: number } | 'silent';
function makeWorker(status: Status = { ready: true, busy: 1 }) {
  const worker: any = new Emitter();
  worker.state = 'installed';
  worker.status = status;
  worker.postMessage = vi.fn((message: any, transfer: any[]) => {
    if (message.type === 'pdkef:update-status' && worker.status !== 'silent') transfer[0].postMessage({ ...worker.status });
  });
  return worker;
}

function makeTab(bus: Bus, opts: { controller?: boolean; waiting?: any; active?: any } = {}) {
  const line = document.createElement('p');
  line.hidden = true;
  line.innerHTML = '<button type="button" data-app-update-dismiss></button>';
  const reg: any = new Emitter();
  reg.waiting = opts.waiting ?? null;
  reg.active = opts.active ?? null;
  reg.installing = null;
  reg.update = vi.fn(() => Promise.resolve());
  const sw: any = new Emitter();
  sw.controller = opts.controller === false ? null : {};
  sw.register = vi.fn(async () => reg);
  const doc: any = new Emitter();
  doc.visibilityState = 'visible';
  const win: any = new Emitter();
  let clock = 1_000_000;
  const reload = vi.fn();
  const ports = () => {
    const port1: any = { onmessage: null };
    const port2 = { postMessage: (data: unknown) => port1.onmessage?.({ data }) };
    return { port1, port2 };
  };
  return {
    line, reg, sw, doc, win, reload,
    dismiss: line.querySelector('[data-app-update-dismiss]') as HTMLButtonElement,
    advanceClock: (ms: number) => { clock += ms; },
    start: (extra: { loaded?: Promise<void> } = {}) => startAppUpdates({
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
      createMessageChannel: ports as any,
      ...extra,
    }),
  };
}

// Asks the tab's busy query the way the worker does and returns its answer.
function askBusy(tab: ReturnType<typeof makeTab>) {
  const port = { postMessage: vi.fn() };
  tab.sw.emit('message', { data: { type: BUSY_QUERY }, ports: [port] });
  return port.postMessage.mock.calls.map((c) => c[0]);
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const statusAsks = (worker: any) => worker.postMessage.mock.calls.filter((c: any[]) => c[0].type === 'pdkef:update-status').length;

// Every hold and flush a test takes is undone afterwards: the registry is module state.
let releases: Array<() => void> = [];
const hold = () => { const release = holdUpdate(); releases.push(release); return release; };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  releases.forEach((r) => r());
  releases = [];
  vi.useRealTimers();
});

describe('pure decisions', () => {
  it('isUpdateWaiting needs a waiting worker and a controller', () => {
    expect(isUpdateWaiting({ waiting: {} }, {})).toBe(true);
    expect(isUpdateWaiting({ waiting: {} }, null)).toBe(false);
    expect(isUpdateWaiting({ waiting: null }, {})).toBe(false);
    expect(isUpdateWaiting(null, {})).toBe(false);
    expect(isUpdateWaiting(undefined, {})).toBe(false);
  });

  it('lineStateFor: no reply or a build that is not ready shows nothing', () => {
    expect(lineStateFor(null)).toBeNull();
    expect(lineStateFor({ ready: false, busy: 2, silent: 1 })).toBeNull();
    expect(lineStateFor({})).toBeNull();
  });

  it('lineStateFor: busy tabs mean waiting, silent ones blocked, none nothing; busy wins', () => {
    expect(lineStateFor({ ready: true, busy: 1 })).toBe('waiting');
    expect(lineStateFor({ ready: true, busy: 0, silent: 1 })).toBe('blocked');
    expect(lineStateFor({ ready: true, busy: 0, silent: 0 })).toBeNull();
    expect(lineStateFor({ ready: true })).toBeNull();
    expect(lineStateFor({ ready: true, busy: 2, silent: 3 })).toBe('waiting');
  });

  it('shouldCheckForUpdate is true from 30 minutes', () => {
    expect(shouldCheckForUpdate(0, 29 * 60_000)).toBe(false);
    expect(shouldCheckForUpdate(0, 30 * 60_000)).toBe(true);
    expect(shouldCheckForUpdate(0, 10, 10)).toBe(true);
  });
});

describe('busy answer', () => {
  it('is idle when nothing holds and busy while a hold is active', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    expect(askBusy(tab)).toEqual([{ busy: false }]);
    hold();
    expect(askBusy(tab)).toEqual([{ busy: true }]);
  });

  it('ignores messages that are not the busy query', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    const port = { postMessage: vi.fn() };
    tab.sw.emit('message', { data: { type: 'something-else' }, ports: [port] });
    tab.sw.emit('message', { ports: [port] });
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('answers idle while leaving, and busy again after LEAVING_RESET_MS', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    hold();
    expect(askBusy(tab)).toEqual([{ busy: true }]);
    tab.win.emit('beforeunload');
    expect(askBusy(tab)).toEqual([{ busy: false }]);
    await vi.advanceTimersByTimeAsync(LEAVING_RESET_MS - 1);
    expect(askBusy(tab)).toEqual([{ busy: false }]);
    await vi.advanceTimersByTimeAsync(1);
    expect(askBusy(tab)).toEqual([{ busy: true }]);
  });

  it('answers before the page has loaded', () => {
    const tab = makeTab(new Bus());
    void tab.start({ loaded: new Promise<void>(() => {}) });
    expect(askBusy(tab)).toEqual([{ busy: false }]);
    hold();
    expect(askBusy(tab)).toEqual([{ busy: true }]);
    expect(tab.sw.register).not.toHaveBeenCalled();
  });

  it('starts the message queue when the browser has one', async () => {
    const tab = makeTab(new Bus());
    tab.sw.startMessages = vi.fn();
    await tab.start();
    expect(tab.sw.startMessages).toHaveBeenCalledTimes(1);
  });

  it('works without startMessages', async () => {
    const tab = makeTab(new Bus());
    await expect(tab.start()).resolves.toBeUndefined();
  });
});

describe('holds', () => {
  it('listens for beforeunload only while held', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    expect(tab.win.count('beforeunload')).toBe(0);
    const release = hold();
    expect(tab.win.count('beforeunload')).toBe(1);
    release();
    expect(tab.win.count('beforeunload')).toBe(0);
  });

  it('listens from the start when a hold is already active', async () => {
    hold();
    const tab = makeTab(new Bus());
    await tab.start();
    expect(tab.win.count('beforeunload')).toBe(1);
  });

  it('posts busy-changed on the channel when a hold starts and when it ends', async () => {
    const bus = new Bus();
    const tab = makeTab(bus);
    await tab.start();
    const peer = new FakeChannel(bus);
    const seen: unknown[] = [];
    peer.addEventListener('message', (e) => seen.push(e.data));
    const release = hold();
    await settle();
    expect(seen).toEqual([{ type: 'busy-changed' }]);
    release();
    await settle();
    expect(seen).toEqual([{ type: 'busy-changed' }, { type: 'busy-changed' }]);
  });

  it('pagehide tells the other tabs this one closed', async () => {
    const bus = new Bus();
    const tab = makeTab(bus);
    await tab.start();
    const peer = new FakeChannel(bus);
    const seen: unknown[] = [];
    peer.addEventListener('message', (e) => seen.push(e.data));
    tab.win.emit('pagehide');
    await settle();
    expect(seen).toEqual([{ type: 'tab-closed' }]);
  });
});

describe('the line', () => {
  it('stays hidden with no waiting worker', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    expect(tab.line.hidden).toBe(true);
  });

  it('stays hidden on a first install (waiting but no controller)', async () => {
    const worker = makeWorker();
    const tab = makeTab(new Bus(), { controller: false, waiting: worker });
    await tab.start();
    expect(tab.line.hidden).toBe(true);
    expect(statusAsks(worker)).toBe(0);
  });

  it('shows as waiting when another tab is working', async () => {
    const tab = makeTab(new Bus(), { waiting: makeWorker({ ready: true, busy: 1 }) });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    expect(tab.line.dataset.appUpdateState).toBe('waiting');
  });

  it('shows as blocked when another tab does not answer', async () => {
    const tab = makeTab(new Bus(), { waiting: makeWorker({ ready: true, busy: 0, silent: 1 }) });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    expect(tab.line.dataset.appUpdateState).toBe('blocked');
  });

  it('stays hidden when no tab holds the build up', async () => {
    const tab = makeTab(new Bus(), { waiting: makeWorker({ ready: true, busy: 0, silent: 0 }) });
    await tab.start();
    expect(tab.line.hidden).toBe(true);
  });

  it('stays hidden when the build is not ready', async () => {
    const tab = makeTab(new Bus(), { waiting: makeWorker({ ready: false, busy: 1 }) });
    await tab.start();
    expect(tab.line.hidden).toBe(true);
  });

  it('stays hidden when the worker does not answer within STATUS_TIMEOUT_MS', async () => {
    const worker = makeWorker('silent');
    const tab = makeTab(new Bus(), { waiting: worker });
    const started = tab.start();
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS - 1);
    expect(statusAsks(worker)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await started;
    expect(tab.line.hidden).toBe(true);
  });

  it('a busy-changed message re-asks the worker', async () => {
    const bus = new Bus();
    const worker = makeWorker({ ready: true, busy: 0, silent: 0 });
    const tab = makeTab(bus, { waiting: worker });
    await tab.start();
    expect(tab.line.hidden).toBe(true);
    worker.status = { ready: true, busy: 1 };
    new FakeChannel(bus).postMessage({ type: 'busy-changed' });
    await settle();
    expect(tab.line.hidden).toBe(false);
    expect(tab.line.dataset.appUpdateState).toBe('waiting');
  });

  it('a tab-closed message re-asks after TAB_CLOSED_RECHECK_MS', async () => {
    const bus = new Bus();
    const worker = makeWorker({ ready: true, busy: 1 });
    const tab = makeTab(bus, { waiting: worker });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    worker.status = { ready: true, busy: 0, silent: 0 };
    new FakeChannel(bus).postMessage({ type: 'tab-closed' });
    await settle();
    await vi.advanceTimersByTimeAsync(TAB_CLOSED_RECHECK_MS - 1);
    expect(tab.line.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(tab.line.hidden).toBe(true);
  });

  it('while shown it re-asks every RECHECK_SHOWN_MS and hides when the reply turns idle', async () => {
    const worker = makeWorker({ ready: true, busy: 1 });
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    worker.status = { ready: true, busy: 0, silent: 1 };
    await vi.advanceTimersByTimeAsync(RECHECK_SHOWN_MS);
    expect(tab.line.dataset.appUpdateState).toBe('blocked');
    expect(tab.line.hidden).toBe(false);
    worker.status = { ready: true, busy: 0, silent: 0 };
    await vi.advanceTimersByTimeAsync(RECHECK_SHOWN_MS);
    expect(tab.line.hidden).toBe(true);
  });

  it('shows after updatefound reaches installed', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    const installing: any = new Emitter();
    installing.state = 'installing';
    tab.reg.installing = installing;
    tab.reg.emit('updatefound');
    installing.state = 'installed';
    tab.reg.waiting = makeWorker({ ready: true, busy: 1 });
    installing.emit('statechange');
    await settle();
    expect(tab.line.hidden).toBe(false);
  });

  it('online, offline and a visible tab each re-ask; a hidden tab does not', async () => {
    const worker = makeWorker({ ready: true, busy: 1 });
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    expect(tab.line.hidden).toBe(false);

    worker.status = { ready: false, busy: 1 };
    tab.win.emit('offline');
    await settle();
    expect(tab.line.hidden).toBe(true);

    worker.status = { ready: true, busy: 1 };
    tab.win.emit('online');
    await settle();
    expect(tab.line.hidden).toBe(false);

    worker.status = { ready: true, busy: 0, silent: 0 };
    tab.doc.visibilityState = 'hidden';
    const before = statusAsks(worker);
    tab.doc.emit('visibilitychange');
    await settle();
    expect(statusAsks(worker)).toBe(before);
    expect(tab.line.hidden).toBe(false);

    tab.doc.visibilityState = 'visible';
    tab.doc.emit('visibilitychange');
    await settle();
    expect(tab.line.hidden).toBe(true);
  });

  it('dismiss hides the line and later refreshes do not bring it back', async () => {
    const bus = new Bus();
    const worker = makeWorker({ ready: true, busy: 1 });
    const tab = makeTab(bus, { waiting: worker });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    tab.dismiss.click();
    expect(tab.line.hidden).toBe(true);
    new FakeChannel(bus).postMessage({ type: 'busy-changed' });
    await settle();
    expect(tab.line.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(RECHECK_SHOWN_MS * 2);
    expect(tab.line.hidden).toBe(true);
    tab.win.emit('online');
    await settle();
    expect(tab.line.hidden).toBe(true);
  });

  it('swallows an update() rejection and throttles the visibility check', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    tab.doc.emit('visibilitychange');
    expect(tab.reg.update).not.toHaveBeenCalled();
    tab.reg.update = vi.fn(() => Promise.reject(new Error('offline')));
    tab.advanceClock(31 * 60_000);
    tab.doc.emit('visibilitychange');
    await settle();
    expect(tab.reg.update).toHaveBeenCalledTimes(1);
    tab.doc.emit('visibilitychange');
    expect(tab.reg.update).toHaveBeenCalledTimes(1);
  });
});

describe('registration', () => {
  it('returns quietly when registration is refused', async () => {
    const tab = makeTab(new Bus());
    tab.sw.register = vi.fn(async () => { throw new Error('SecurityError'); });
    await expect(tab.start()).resolves.toBeUndefined();
    expect(tab.line.hidden).toBe(true);
  });

  it('returns quietly when registration resolves to nothing', async () => {
    const tab = makeTab(new Bus());
    tab.sw.register = vi.fn(async () => undefined);
    await expect(tab.start()).resolves.toBeUndefined();
    expect(tab.line.hidden).toBe(true);
    expect(tab.win.count('online')).toBe(0);
  });
});

describe('controllerchange', () => {
  it('the first claim of an uncontrolled tab does not reload', async () => {
    const tab = makeTab(new Bus(), { controller: false });
    await tab.start();
    tab.sw.controller = {};
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).not.toHaveBeenCalled();
  });

  it('an uncontrolled tab beside an active worker (a hard reload) reloads on the first claim', async () => {
    const tab = makeTab(new Bus(), { controller: false, active: {} });
    await tab.start();
    tab.sw.controller = {};
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });

  it('an uncontrolled tab with no active worker ignores the first claim', async () => {
    const tab = makeTab(new Bus(), { controller: false, active: null });
    await tab.start();
    tab.sw.controller = {};
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).not.toHaveBeenCalled();
  });

  it('a tab first controlled by the install claim reloads on the next update', async () => {
    const tab = makeTab(new Bus(), { controller: false });
    await tab.start();
    tab.sw.controller = {};
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).not.toHaveBeenCalled();
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });

  it('a controlled tab reloads once even if controllerchange fires twice', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    tab.sw.emit('controllerchange');
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads only after the registered flushes resolve', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    let finish!: () => void;
    const unregister = registerBeforeUpdateReload(() => new Promise<void>((r) => { finish = r; }));
    try {
      tab.sw.emit('controllerchange');
      await settle();
      expect(tab.reload).not.toHaveBeenCalled();
      finish();
      await settle();
      expect(tab.reload).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it('waits for a held tab to release before reloading', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    const release = hold();
    tab.sw.emit('controllerchange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(tab.reload).not.toHaveBeenCalled();
    release();
    await settle();
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });

  it('hides the line while the reload is on its way', async () => {
    const tab = makeTab(new Bus(), { waiting: makeWorker({ ready: true, busy: 1 }) });
    await tab.start();
    expect(tab.line.hidden).toBe(false);
    hold();
    tab.sw.emit('controllerchange');
    await settle();
    expect(tab.line.hidden).toBe(true);
  });
});
