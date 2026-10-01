/**
 * MEM-10: the update line's coordinator. Registers the service worker, shows
 * the quiet "a new version is ready" line when a worker is waiting beside a
 * controlling one, and on one click moves every open tab onto the new build
 * together, unless a tab has an export in flight (see
 * `src/lib/appUpdate/updateHolds.ts`).
 *
 * Decisions are small pure functions; `startAppUpdates` is thin wiring over
 * injected dependencies so it runs against fakes in tests. No string lives
 * here: the line's copy is static markup (`AppUpdateLine.astro`).
 */
import { flushBeforeUpdateReload, isUpdateHeld, onUpdateHoldChange } from '../lib/appUpdate/updateHolds.ts';

export const CHANNEL_NAME = 'pdkef:app-update';
export const CHECK_AFTER_MS = 30 * 60 * 1000;
export const CHECK_EVERY_MS = 60 * 60 * 1000;
export const ANSWER_WINDOW_MS = 400;
export const ACK_TIMEOUT_MS = 3000;
export const RETRY_DELAY_MS = 1500;
export const MAX_ATTEMPTS = 3;
export const RECHECK_WAITING_MS = 5000;

/**
 * 'ready': the Reload button. 'waiting': a tab has an export in flight; the
 * button comes back once none does, and the person clicks again (an export's
 * result may still be waiting for its Download, so finishing never reloads on
 * its own). 'blocked': the worker refused because a window did not answer
 * (a frozen tab, or one on a build from before MEM-10); the line says to close
 * other tabs and keeps the button.
 */
export type LineState = 'ready' | 'waiting' | 'blocked';

export type UpdateMessage =
  | { type: 'hold-query'; from: string; query: string }
  | { type: 'hold-answer'; to: string; from: string; query: string; held: boolean }
  | { type: 'hold-changed' }
  | { type: 'update-waiting' };

/** An update, never a first install: a waiting worker beside a controller. */
export function isUpdateWaiting(reg: { waiting?: unknown } | null | undefined, controller: unknown): boolean {
  return !!reg?.waiting && !!controller;
}

export interface Answer { from: string; held: boolean }

export type RequestDecision =
  | { action: 'wait' }
  | { action: 'skip-waiting'; windows: number };

/** Held anywhere: wait. Otherwise the worker needs every window (this one included). */
export function decideRequest({ selfHeld, answers }: { selfHeld: boolean; answers: Answer[] }): RequestDecision {
  if (selfHeld || answers.some((answer) => answer.held)) return { action: 'wait' };
  return { action: 'skip-waiting', windows: new Set(answers.map((answer) => answer.from)).size + 1 };
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
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  update(): Promise<unknown>;
  addEventListener(type: string, listener: () => void): void;
}
interface ContainerLike {
  controller: unknown;
  register(url: string): Promise<RegistrationLike>;
  addEventListener(type: string, listener: () => void): void;
}
interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: UpdateMessage }) => void): void;
}
interface PortLike { onmessage: ((event: { data: { ok?: boolean } }) => void) | null }
interface MessageChannelLike { port1: PortLike; port2: unknown }

export interface AppUpdateDeps {
  serviceWorker: ContainerLike;
  line: HTMLElement | null;
  createChannel: (name: string) => ChannelLike | null;
  reload: () => void;
  document: Pick<Document, 'visibilityState' | 'addEventListener'>;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  now: () => number;
  randomId: () => string;
  createMessageChannel?: () => MessageChannelLike;
}

export async function startAppUpdates(deps: AppUpdateDeps): Promise<void> {
  const { serviceWorker, line, document: doc } = deps;
  // Whether this tab was already controlled before the next controllerchange.
  // Not a snapshot at load: a first visit is uncontrolled until the worker
  // claims it, and that tab must still reload on the update after that.
  let controlled = !!serviceWorker.controller;
  const id = deps.randomId();
  const channel = deps.createChannel(CHANNEL_NAME);
  const button = line?.querySelector<HTMLButtonElement>('[data-app-update-reload]') ?? null;

  let state: LineState | 'hidden' = 'hidden';
  let running = false;
  let rechecking = false;
  let reloading = false;
  let lastCheck = deps.now();
  let answers = new Map<string, boolean>();
  let currentQuery = '';

  const post = (message: UpdateMessage) => channel?.postMessage(message);
  const sleep = (ms: number) => new Promise<void>((resolve) => { deps.setTimeout(resolve, ms); });

  function setState(next: LineState) {
    state = next;
    if (!line) return;
    line.dataset.appUpdateState = next;
    line.removeAttribute('hidden');
  }

  const reg = await serviceWorker.register('/sw.js');

  function showIfWaiting() {
    if (state === 'hidden' && isUpdateWaiting(reg, serviceWorker.controller)) setState('ready');
  }

  function collectAnswers(): Promise<Answer[]> {
    currentQuery = deps.randomId();
    answers = new Map();
    post({ type: 'hold-query', from: id, query: currentQuery });
    return sleep(ANSWER_WINDOW_MS).then(() => [...answers].map(([from, held]) => ({ from, held })));
  }

  function postSkipWaiting(windows: number): Promise<boolean> {
    const worker = reg.waiting;
    if (!worker) return Promise.resolve(false);
    const mc = deps.createMessageChannel ? deps.createMessageChannel() : (new MessageChannel() as unknown as MessageChannelLike);
    return new Promise<boolean>((resolve) => {
      const timer = deps.setTimeout(() => resolve(false), ACK_TIMEOUT_MS);
      mc.port1.onmessage = (event) => {
        deps.clearTimeout(timer);
        resolve(!!event.data?.ok);
      };
      worker.postMessage({ type: 'pdkef:skip-waiting', windows }, [mc.port2]);
    });
  }

  async function requestUpdate(): Promise<void> {
    if (running || reloading) return;
    running = true;
    if (button) button.disabled = true;
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const decision = decideRequest({ selfHeld: isUpdateHeld(), answers: await collectAnswers() });
        if (decision.action === 'wait') {
          setState('waiting');
          post({ type: 'update-waiting' });
          return;
        }
        if (await postSkipWaiting(decision.windows)) return;
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      }
      if (!reloading) setState('blocked');
    } finally {
      running = false;
      if (button) button.disabled = false;
    }
  }

  channel?.addEventListener('message', (event) => {
    const message = event.data;
    if (!message) return;
    if (message.type === 'hold-query' && message.from !== id) {
      post({ type: 'hold-answer', to: message.from, from: id, query: message.query, held: isUpdateHeld() });
    } else if (message.type === 'hold-answer' && message.to === id && message.query === currentQuery) {
      answers.set(message.from, message.held);
    } else if (message.type === 'update-waiting') {
      setState('waiting');
    } else if (message.type === 'hold-changed') {
      void recheckWaiting();
    }
  });

  // Back to the button once no tab holds. Asked again on every hold change and
  // on a timer, so a holder that closed or crashed cannot strand the line.
  async function recheckWaiting(): Promise<void> {
    if (state !== 'waiting' || rechecking || running || reloading) return;
    rechecking = true;
    try {
      const decision = decideRequest({ selfHeld: isUpdateHeld(), answers: await collectAnswers() });
      if (decision.action !== 'wait' && state === 'waiting') setState('ready');
    } finally {
      rechecking = false;
    }
  }
  deps.setInterval(() => { void recheckWaiting(); }, RECHECK_WAITING_MS);

  onUpdateHoldChange(() => {
    post({ type: 'hold-changed' });
    void recheckWaiting();
  });

  button?.addEventListener('click', () => { void requestUpdate(); });

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
    await waitForRelease();
    await flushBeforeUpdateReload();
    deps.reload();
  });

  function watchInstalling(worker: WorkerLike | null) {
    worker?.addEventListener?.('statechange', () => {
      if (worker.state === 'installed') showIfWaiting();
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
    if (doc.visibilityState === 'visible' && shouldCheckForUpdate(lastCheck, deps.now())) checkForUpdate();
  });
  deps.setInterval(() => {
    if (doc.visibilityState === 'visible') checkForUpdate();
  }, CHECK_EVERY_MS);

  showIfWaiting();
}
