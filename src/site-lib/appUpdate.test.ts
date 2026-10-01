// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdUpdate, registerBeforeUpdateReload } from '../lib/appUpdate/updateHolds';
import {
  BUSY_QUERY,
  CHECK_EVERY_MS,
  CRITICAL_CHECK,
  CRITICAL_PAGE_CAP_MS,
  CRITICAL_UPDATE,
  LEAVING_RESET_MS,
  RECHECK_SHOWN_MS,
  STATUS_TIMEOUT_MS,
  TAB_CLOSED_RECHECK_MS,
  VISIBLE_CHECK_MIN_MS,
  isUpdateWaiting,
  lineStateFor,
  respondToCriticalUpdate,
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

// MEM-13: a forced update. The worker's message arrives with a port; the
// tab's only answer is { ready: true } on it, once its work is safe.
function sendCritical(tab: ReturnType<typeof makeTab>) {
  const port = { postMessage: vi.fn() };
  tab.sw.emit('message', { data: { type: CRITICAL_UPDATE }, ports: [port] });
  return port.postMessage;
}
const holdOpen = () => { const release = holdUpdate('open'); releases.push(release); return release; };

describe('respondToCriticalUpdate', () => {
  function makeDeps(over: Partial<Parameters<typeof respondToCriticalUpdate>[0]> = {}) {
    let inFlight = false;
    const listeners = new Set<(v: boolean) => void>();
    const deps = {
      flushDrafts: vi.fn(async () => {}),
      exportInFlight: () => inFlight,
      onExportChange: (l: (v: boolean) => void) => { listeners.add(l); return () => listeners.delete(l); },
      capMs: 1000,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: unknown) => clearTimeout(id as any),
      ...over,
    };
    return { deps, listeners, setInFlight: (v: boolean) => { inFlight = v; listeners.forEach((l) => l(v)); } };
  }

  it('flushes and replies at once with no export in flight', async () => {
    const { deps } = makeDeps();
    await expect(respondToCriticalUpdate(deps)).resolves.toEqual({ ready: true });
    expect(deps.flushDrafts).toHaveBeenCalledTimes(1);
  });

  it('does not look at exports until the flush has settled', async () => {
    let finish!: () => void;
    const { deps } = makeDeps({ flushDrafts: () => new Promise<void>((r) => { finish = r; }) });
    let replied = false;
    void respondToCriticalUpdate(deps).then(() => { replied = true; });
    await settle();
    expect(replied).toBe(false);
    finish();
    await settle();
    expect(replied).toBe(true);
  });

  it('waits for an export to end, then replies and stops listening', async () => {
    const { deps, listeners, setInFlight } = makeDeps();
    setInFlight(true);
    let replied = false;
    void respondToCriticalUpdate(deps).then(() => { replied = true; });
    await settle();
    expect(replied).toBe(false);
    expect(listeners.size).toBe(1);
    setInFlight(false);
    await settle();
    expect(replied).toBe(true);
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up at the cap', async () => {
    const { deps, listeners, setInFlight } = makeDeps();
    setInFlight(true);
    let replied = false;
    void respondToCriticalUpdate(deps).then(() => { replied = true; });
    await vi.advanceTimersByTimeAsync(999);
    expect(replied).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(replied).toBe(true);
    expect(listeners.size).toBe(0);
  });
});

describe('forced update in the tab', () => {
  it('shows the force variant and replies ready on the port', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    const reply = sendCritical(tab);
    expect(tab.line.dataset.appUpdateState).toBe('critical');
    expect(tab.line.hidden).toBe(false);
    await settle();
    expect(reply.mock.calls).toEqual([[{ ready: true }]]);
  });

  it('answers before the page has loaded', async () => {
    const tab = makeTab(new Bus());
    void tab.start({ loaded: new Promise<void>(() => {}) });
    const reply = sendCritical(tab);
    await settle();
    expect(reply.mock.calls).toEqual([[{ ready: true }]]);
  });

  it('flushes pending draft saves before replying', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    let finish!: () => void;
    const unregister = registerBeforeUpdateReload(() => new Promise<void>((r) => { finish = r; }));
    try {
      const reply = sendCritical(tab);
      await settle();
      expect(reply).not.toHaveBeenCalled();
      finish();
      await settle();
      expect(reply).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it('waits while an export is in flight, and replies when it ends', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    const release = hold();
    const reply = sendCritical(tab);
    await vi.advanceTimersByTimeAsync(CRITICAL_PAGE_CAP_MS - 1);
    expect(reply).not.toHaveBeenCalled();
    release();
    await settle();
    expect(reply.mock.calls).toEqual([[{ ready: true }]]);
  });

  it('gives up on an export at CRITICAL_PAGE_CAP_MS', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    hold();
    const reply = sendCritical(tab);
    await vi.advanceTimersByTimeAsync(CRITICAL_PAGE_CAP_MS - 1);
    expect(reply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reply.mock.calls).toEqual([[{ ready: true }]]);
  });

  it('a file open in a draftless tool does not hold a force', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    holdOpen();
    const reply = sendCritical(tab);
    await settle();
    expect(reply.mock.calls).toEqual([[{ ready: true }]]);
  });

  it('answers every ask, flushing once', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    const flush = vi.fn();
    const unregister = registerBeforeUpdateReload(flush);
    try {
      const first = sendCritical(tab);
      const second = sendCritical(tab);
      await settle();
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(flush).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it('shows even after a dismissal, and later refreshes leave it alone', async () => {
    const bus = new Bus();
    const worker = makeWorker({ ready: true, busy: 1 });
    const tab = makeTab(bus, { waiting: worker });
    await tab.start();
    tab.dismiss.click();
    expect(tab.line.hidden).toBe(true);
    sendCritical(tab);
    expect(tab.line.hidden).toBe(false);
    new FakeChannel(bus).postMessage({ type: 'busy-changed' });
    await vi.advanceTimersByTimeAsync(RECHECK_SHOWN_MS * 2);
    expect(tab.line.dataset.appUpdateState).toBe('critical');
    expect(tab.line.hidden).toBe(false);
  });

  it('the controllerchange reload does not wait for a file open here, but still reloads once', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    holdOpen();
    sendCritical(tab);
    await settle();
    tab.sw.emit('controllerchange');
    tab.sw.emit('controllerchange');
    await settle();
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });

  it('without a force, an open file still holds the reload (MEM-10)', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    const release = holdOpen();
    tab.sw.emit('controllerchange');
    await settle();
    expect(tab.reload).not.toHaveBeenCalled();
    release();
    await settle();
    expect(tab.reload).toHaveBeenCalledTimes(1);
  });
});

describe('discovery', () => {
  const criticalChecks = (worker: any) => worker.postMessage.mock.calls.filter((c: any[]) => c[0].type === CRITICAL_CHECK).length;

  it('a tab becoming visible asks for an update, then nudges the waiting worker', async () => {
    const worker = makeWorker({ ready: true, busy: 0, silent: 0 });
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    const before = criticalChecks(worker);
    tab.advanceClock(VISIBLE_CHECK_MIN_MS);
    tab.doc.emit('visibilitychange');
    expect(tab.reg.update).toHaveBeenCalledTimes(1);
    expect(criticalChecks(worker)).toBe(before);
    await settle();
    expect(criticalChecks(worker)).toBe(before + 1);
  });

  it('visible checks are throttled to VISIBLE_CHECK_MIN_MS; a hidden tab does not ask', async () => {
    const tab = makeTab(new Bus());
    await tab.start();
    tab.doc.emit('visibilitychange');
    expect(tab.reg.update).not.toHaveBeenCalled();
    tab.advanceClock(VISIBLE_CHECK_MIN_MS);
    tab.doc.visibilityState = 'hidden';
    tab.doc.emit('visibilitychange');
    expect(tab.reg.update).not.toHaveBeenCalled();
  });

  it('coming online asks at once, whatever the throttle says', async () => {
    const worker = makeWorker({ ready: true, busy: 0, silent: 0 });
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    const before = criticalChecks(worker);
    tab.win.emit('online');
    await settle();
    expect(tab.reg.update).toHaveBeenCalledTimes(1);
    expect(criticalChecks(worker)).toBe(before + 1);
  });

  it('asks once an hour while open and visible', async () => {
    const worker = makeWorker({ ready: true, busy: 0, silent: 0 });
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    const before = criticalChecks(worker);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(tab.reg.update).toHaveBeenCalledTimes(1);
    expect(criticalChecks(worker)).toBe(before + 1);
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(tab.reg.update).toHaveBeenCalledTimes(2);
  });

  it('posts nothing when no worker is waiting', async () => {
    const worker = makeWorker();
    const tab = makeTab(new Bus(), { active: worker });
    await tab.start();
    tab.win.emit('online');
    await settle();
    expect(tab.reg.update).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('a rejected update() is swallowed and still nudges a waiting worker', async () => {
    const worker = makeWorker({ ready: true, busy: 0, silent: 0 });
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    const before = criticalChecks(worker);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    tab.reg.update = vi.fn(() => Promise.reject(new Error('offline')));
    tab.win.emit('online');
    await settle();
    expect(tab.reg.update).toHaveBeenCalledTimes(1);
    expect(criticalChecks(worker)).toBe(before + 1);
    expect(errors).not.toHaveBeenCalled();
    expect(tab.line.dataset.appUpdateState).not.toBe('critical');
    errors.mockRestore();
  });

  it('a worker that throws on postMessage is swallowed', async () => {
    const worker = makeWorker({ ready: true, busy: 0, silent: 0 });
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    const answer = worker.postMessage;
    worker.postMessage = vi.fn((message: any, transfer: any[]) => {
      if (message.type === CRITICAL_CHECK) throw new Error('redundant');
      answer(message, transfer);
    });
    tab.win.emit('online');
    await settle();
    expect(criticalChecks(worker)).toBe(1);
  });

  it('a build already waiting at load is nudged once', async () => {
    const worker = makeWorker({ ready: true, busy: 0, silent: 0 });
    const tab = makeTab(new Bus(), { waiting: worker });
    await tab.start();
    expect(criticalChecks(worker)).toBe(1);
  });
});
