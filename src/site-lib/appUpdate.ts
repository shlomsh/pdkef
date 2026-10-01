/**
 * MEM-10: the update coordinator in every page. A new build reaches open tabs
 * silently: on any navigation the service worker asks every open tab whether
 * it holds work a reload would lose (`src/lib/appUpdate/updateHolds.ts`), and
 * when none does, the new build takes over and every tab reloads itself on
 * `controllerchange`. This module is the tab's side of that:
 *
 * - it answers the worker's busy query (idle while this tab is navigating
 *   away, since the reload is the person's own);
 * - it reloads on `controllerchange`, after its holds release and its draft
 *   saves flush;
 * - it shows the quiet line only when an update is waiting, ready, and held
 *   up by another tab: 'waiting' when that tab is working, 'blocked' when it
 *   does not answer. A single tab, or several idle ones, never see it.
 *
 * Decisions are small pure functions; `startAppUpdates` is thin wiring over
 * injected dependencies so it runs against fakes in tests. No string lives
 * here: the line's copy is static markup (`AppUpdateLine.astro`).
 */
import { flushBeforeUpdateReload, isUpdateHeld, onUpdateHoldChange } from '../lib/appUpdate/updateHolds.ts';

export const CHANNEL_NAME = 'pdkef:app-update';
export const BUSY_QUERY = 'pdkef:busy-query';
export const CHECK_AFTER_MS = 30 * 60 * 1000;
export const CHECK_EVERY_MS = 60 * 60 * 1000;
export const STATUS_TIMEOUT_MS = 2000;
export const TAB_CLOSED_RECHECK_MS = 1000;
export const LEAVING_RESET_MS = 1000;
export const RECHECK_SHOWN_MS = 5000;
export const REFRESH_EVERY_MS = 60 * 1000;

/** 'waiting': another tab is working. 'blocked': another tab does not answer. */
export type LineState = 'waiting' | 'blocked';

export type UpdateMessage = { type: 'busy-changed' } | { type: 'tab-closed' };

/** The waiting worker's answer to `pdkef:update-status`, about the other tabs. */
export interface StatusReply { ready?: boolean; windows?: number; busy?: number; silent?: number }

/** An update, never a first install: a waiting worker beside a controller. */
export function isUpdateWaiting(reg: { waiting?: unknown } | null | undefined, controller: unknown): boolean {
  return !!reg?.waiting && !!controller;
}

/**
 * The line only for a ready build that another tab holds up. Nothing when the
 * build is not ready (it would cost offline coverage) or nothing holds it: the
 * next navigation in any tab updates every tab silently.
 */
export function lineStateFor(reply: StatusReply | null): LineState | null {
  if (!reply?.ready) return null;
  if ((reply.busy ?? 0) > 0) return 'waiting';
  if ((reply.silent ?? 0) > 0) return 'blocked';
  return null;
}

export function shouldCheckForUpdate(lastCheck: number, now: number, afterMs = CHECK_AFTER_MS): boolean {
  return now - lastCheck >= afterMs;
}

interface WorkerLike {
  state?: string;
  postMessage(message: unknown, transfer?: unknown[]): void;
  addEventListener?(type: string, listener: () => void): void;
}
interface RegistrationLike {
  active?: WorkerLike | null;
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  update(): Promise<unknown>;
  addEventListener(type: string, listener: () => void): void;
}
interface PortLike {
  onmessage?: ((event: { data: StatusReply }) => void) | null;
  postMessage?(message: unknown): void;
}
export interface WorkerMessageEvent { data?: { type?: string }; ports?: readonly PortLike[] }
interface ContainerLike {
  controller: unknown;
  register(url: string): Promise<RegistrationLike>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: WorkerMessageEvent) => void): void;
  startMessages?(): void;
}
interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: UpdateMessage }) => void): void;
}
interface MessageChannelLike { port1: PortLike; port2: unknown }

export interface AppUpdateDeps {
  serviceWorker: ContainerLike;
  line: HTMLElement | null;
  createChannel: (name: string) => ChannelLike | null;
  reload: () => void;
  document: Pick<Document, 'visibilityState' | 'addEventListener'>;
  window: {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  };
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  now: () => number;
  /** Resolves once the page has loaded; registration waits for it. Default: now. */
  loaded?: Promise<void>;
  createMessageChannel?: () => MessageChannelLike;
}

export async function startAppUpdates(deps: AppUpdateDeps): Promise<void> {
  const { serviceWorker, line, document: doc } = deps;
  // Whether this tab was already controlled before the next controllerchange.
  // Not a snapshot at load: a first visit is uncontrolled until the worker
  // claims it, and that tab must still reload on the update after that.
  let controlled = !!serviceWorker.controller;
  const channel = deps.createChannel(CHANNEL_NAME);

  let state: LineState | 'hidden' = 'hidden';
  // Dismissed lines stay hidden until this page's next load. The tab still
  // answers busy queries and still reloads with the others on an update.
  let dismissed = false;
  let reloading = false;
  let lastCheck = deps.now();

  const post = (message: UpdateMessage) => channel?.postMessage(message);

  function hideLine() {
    state = 'hidden';
    if (line) line.hidden = true;
  }

  // Set from beforeunload, while this tab holds: a navigation away is the
  // person's own choice, so it must not hold the update back on its way out.
  // Reset after a moment in case the navigation was cancelled.
  let leaving = false;
  const onBeforeUnload = () => {
    leaving = true;
    deps.setTimeout(() => { leaving = false; }, LEAVING_RESET_MS);
  };
  if (isUpdateHeld()) deps.window.addEventListener('beforeunload', onBeforeUnload);

  // Answered before the page finishes loading: the worker asks every tab on
  // every navigation, and a tab that does not answer counts as holding.
  serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== BUSY_QUERY) return;
    event.ports?.[0]?.postMessage?.({ busy: isUpdateHeld() && !leaving });
  });
  serviceWorker.startMessages?.();

  onUpdateHoldChange((held) => {
    // Only a holding tab listens for beforeunload; the listener keeps a page
    // out of the back/forward cache in some engines.
    if (held) deps.window.addEventListener('beforeunload', onBeforeUnload);
    else deps.window.removeEventListener('beforeunload', onBeforeUnload);
    post({ type: 'busy-changed' });
  });

  function waitForRelease(): Promise<void> {
    if (!isUpdateHeld()) return Promise.resolve();
    return new Promise((resolve) => {
      const stop = onUpdateHoldChange((held) => {
        if (held) return;
        stop();
        resolve();
      });
    });
  }

  serviceWorker.addEventListener('controllerchange', async () => {
    // The first claim (no controller -> controller) is a first install, not
    // an update: nothing in this tab is running against a deleted cache.
    if (!controlled) {
      controlled = !!serviceWorker.controller;
      return;
    }
    if (reloading) return;
    reloading = true;
    hideLine();
    await waitForRelease();
    await flushBeforeUpdateReload();
    deps.reload();
  });

  await deps.loaded;

  // A browser that refuses or blocks workers (private modes, enterprise
  // policy, Playwright's serviceWorkers: 'block') gets no worker and no line.
  let registered: RegistrationLike | undefined;
  try {
    registered = await serviceWorker.register('/sw.js');
  } catch {
    return;
  }
  if (!registered) return;
  const reg = registered;
  // Uncontrolled beside an active worker (a hard reload): not a first visit,
  // so the next claim is an update this tab must reload for.
  if (reg.active) controlled = true;

  // One question to the waiting worker; null when it does not answer in time.
  function ask(worker: WorkerLike, message: unknown, timeoutMs: number): Promise<StatusReply | null> {
    const mc = deps.createMessageChannel ? deps.createMessageChannel() : (new MessageChannel() as unknown as MessageChannelLike);
    return new Promise<StatusReply | null>((resolve) => {
      const timer = deps.setTimeout(() => resolve(null), timeoutMs);
      mc.port1.onmessage = (event) => {
        deps.clearTimeout(timer);
        resolve(event.data ?? {});
      };
      worker.postMessage(message, [mc.port2]);
    });
  }

  let refreshSeq = 0;
  async function refreshLine(): Promise<void> {
    if (reloading) return;
    const seq = ++refreshSeq;
    const worker = reg.waiting;
    if (!worker || !serviceWorker.controller) {
      hideLine();
      return;
    }
    const reply = await ask(worker, { type: 'pdkef:update-status' }, STATUS_TIMEOUT_MS);
    if (seq !== refreshSeq || reloading) return;
    const next = lineStateFor(reply);
    if (!next) {
      hideLine();
      return;
    }
    state = next;
    if (!line) return;
    line.dataset.appUpdateState = next;
    if (!dismissed) line.hidden = false;
  }

  channel?.addEventListener('message', (event) => {
    const type = event.data?.type;
    if (type === 'busy-changed') void refreshLine();
    // The closing window is still a client while its pagehide runs.
    else if (type === 'tab-closed') deps.setTimeout(() => { void refreshLine(); }, TAB_CLOSED_RECHECK_MS);
  });

  line?.querySelector('[data-app-update-dismiss]')?.addEventListener('click', () => {
    dismissed = true;
    line.hidden = true;
  });

  function watchInstalling(worker: WorkerLike | null) {
    worker?.addEventListener?.('statechange', () => {
      if (worker.state === 'installed') void refreshLine();
    });
  }
  reg.addEventListener('updatefound', () => watchInstalling(reg.installing));
  // A tab that loads mid-install missed that updatefound.
  watchInstalling(reg.installing);

  function checkForUpdate() {
    lastCheck = deps.now();
    reg.update().catch(() => {});
  }
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return;
    void refreshLine();
    if (shouldCheckForUpdate(lastCheck, deps.now())) checkForUpdate();
  });
  deps.setInterval(() => {
    if (doc.visibilityState === 'visible') checkForUpdate();
  }, CHECK_EVERY_MS);

  deps.window.addEventListener('online', () => { void refreshLine(); });
  deps.window.addEventListener('offline', () => { void refreshLine(); });
  deps.window.addEventListener('pagehide', () => post({ type: 'tab-closed' }));
  // A shown line follows the other tabs closely (a holder that crashed sends
  // nothing); a hidden one only needs the occasional look.
  deps.setInterval(() => { if (state !== 'hidden') void refreshLine(); }, RECHECK_SHOWN_MS);
  deps.setInterval(() => { if (state === 'hidden' && reg.waiting) void refreshLine(); }, REFRESH_EVERY_MS);

  await refreshLine();
}
