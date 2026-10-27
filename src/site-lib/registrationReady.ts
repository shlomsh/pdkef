// MEM-17: when the page is quiet enough for the service worker to start
// downloading. `load` fires before a client:load island has hydrated, and the
// worker's install would compete with the island's own requests for bandwidth.
// So: `load`, every island hydrated (Astro removes `ssr` on hydration, the
// selector e2e/support/tool.js waits on), then one idle callback.

const ISLAND_SELECTOR = 'astro-island[client="load"][ssr]';
const IDLE_TIMEOUT_MS = 2000;

interface ObserverLike {
  observe(target: unknown, opts: Record<string, unknown>): void;
  disconnect(): void;
}

export interface ReadyDeps {
  loaded: Promise<void>;
  document: { querySelector(selector: string): unknown };
  /** Missing in Safari: a zero-delay timer stands in. */
  requestIdleCallback?: (fn: () => void, opts: { timeout: number }) => unknown;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
  MutationObserver?: new (cb: () => void) => ObserverLike;
  /** Registers anyway this long after `load`, whatever the islands are doing. */
  capMs?: number;
}

export function whenReadyToRegister(deps: ReadyDeps): Promise<void> {
  const { document: doc, capMs = 10_000 } = deps;
  const waiting = () => doc.querySelector(ISLAND_SELECTOR) !== null;
  return new Promise<void>((resolve) => {
    let finished = false;
    let observer: ObserverLike | undefined;
    let capTimer: unknown;
    const finish = () => {
      if (finished) return;
      finished = true;
      observer?.disconnect();
      if (capTimer !== undefined) deps.clearTimeout?.(capTimer);
      resolve();
    };
    const idle = () => {
      if (deps.requestIdleCallback) deps.requestIdleCallback(finish, { timeout: IDLE_TIMEOUT_MS });
      else deps.setTimeout(finish, 0);
    };
    void deps.loaded.then(() => { // reason: `loaded` resolves on the load event and never rejects
      if (finished) return;
      capTimer = deps.setTimeout(finish, capMs);
      if (!waiting()) return idle();
      if (!deps.MutationObserver) return; // the cap decides
      let idling = false;
      const check = () => {
        if (idling || waiting()) return;
        idling = true;
        observer?.disconnect();
        idle();
      };
      observer = new deps.MutationObserver(check);
      observer.observe(doc, { attributes: true, attributeFilter: ['ssr'], subtree: true });
      check();
    });
  });
}
