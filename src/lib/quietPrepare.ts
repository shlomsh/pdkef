// Prepare the output in the background, only once the person has gone quiet.
// Pure and framework-free: timers are injectable, nothing touches a tool.

export interface QuietPolicy {
  baseMs: number;
  stepMs: number;
  maxMs: number;
  burstWindowMs: number;
}

export const DEFAULT_QUIET: QuietPolicy = { baseMs: 1500, stepMs: 500, maxMs: 4000, burstWindowMs: 3000 };

/** Wait after the latest change: baseMs plus stepMs per earlier change in the burst, capped at maxMs. */
export function quietDelay(changeTimes: readonly number[], _now: number, policy: QuietPolicy = DEFAULT_QUIET): number {
  let earlier = 0;
  for (let i = changeTimes.length - 1; i > 0; i--) {
    if (changeTimes[i] - changeTimes[i - 1] >= policy.burstWindowMs) break;
    earlier++;
  }
  return Math.min(policy.maxMs, policy.baseMs + earlier * policy.stepMs);
}

/** Small LRU of prepared results, keyed by a caller-built state key. */
export function createResultCache<T>(limit = 4) {
  const map = new Map<string, T>();
  return {
    get(key: string): T | undefined {
      if (!map.has(key)) return undefined;
      const value = map.get(key) as T;
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key: string, value: T): void {
      map.delete(key);
      map.set(key, value);
      while (map.size > limit) map.delete(map.keys().next().value as string);
    },
    clear(): void {
      map.clear();
    },
  };
}

interface QuietClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const realClock: QuietClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createQuietPreparer<T>(opts: {
  build: (key: string, signal: AbortSignal) => Promise<T>;
  onReady: (key: string, value: T) => void;
  onError?: (key: string, err: unknown) => void;
  policy?: QuietPolicy;
  clock?: QuietClock;
  cacheLimit?: number;
}) {
  const policy = opts.policy ?? DEFAULT_QUIET;
  const clock = opts.clock ?? realClock;
  const cache = createResultCache<T>(opts.cacheLimit);
  let changeTimes: number[] = [];
  let latest: string | null = null;
  let timer: unknown = null;
  let controller: AbortController | null = null;
  let generation = 0;

  function cancel() {
    generation++;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  }

  function start() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    if (latest === null || controller) return;
    const key = latest;
    const gen = generation;
    const ctl = new AbortController();
    controller = ctl;
    const finish = (fn: () => void) => {
      if (gen !== generation) return;
      controller = null;
      latest = null;
      fn();
    };
    opts.build(key, ctl.signal).then(
      (value) =>
        finish(() => {
          cache.set(key, value);
          opts.onReady(key, value);
        }),
      (err) => finish(() => opts.onError?.(key, err)),
    );
  }

  return {
    change(key: string): void {
      cancel();
      const t = clock.now();
      changeTimes = [...changeTimes.slice(-16), t];
      const hit = cache.get(key);
      if (hit !== undefined) {
        latest = null;
        opts.onReady(key, hit);
        return;
      }
      latest = key;
      const gen = generation;
      timer = clock.setTimeout(() => {
        if (gen === generation) start();
      }, quietDelay(changeTimes, t, policy));
    },
    now(): void {
      if (latest === null || controller) return;
      start();
    },
    dispose(): void {
      cancel();
      latest = null;
    },
    get pendingKey(): string | null {
      return latest;
    },
    get building(): boolean {
      return controller !== null;
    },
  };
}
