import { describe, expect, it } from 'vitest';
import { DEFAULT_QUIET, createQuietPreparer, createResultCache, quietDelay } from './quietPrepare.ts';

function fakeClock() {
  let t = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimeout(fn: () => void, ms: number) {
      const id = nextId++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimeout(id: unknown) {
      timers.delete(id as number);
    },
    async advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
        await Promise.resolve();
      }
      t = end;
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function setup(build?: (key: string, signal: AbortSignal) => Promise<string>) {
  const clock = fakeClock();
  const built: string[] = [];
  const signals: AbortSignal[] = [];
  const ready: Array<[string, string]> = [];
  const errors: unknown[] = [];
  const p = createQuietPreparer<string>({
    build:
      build ??
      (async (key, signal) => {
        built.push(key);
        signals.push(signal);
        return `built:${key}`;
      }),
    onReady: (k, v) => ready.push([k, v]),
    onError: (_k, e) => errors.push(e),
    clock,
  });
  return { clock, p, built, signals, ready, errors };
}

describe('quietDelay', () => {
  it('is the base delay for a single change', () => {
    expect(quietDelay([1000], 1000)).toBe(1500);
  });
  it('adds a step per earlier change in the burst', () => {
    expect(quietDelay([0, 500, 1000], 1000)).toBe(2500);
  });
  it('caps at maxMs', () => {
    expect(quietDelay([0, 500, 1000, 1500, 2000, 2500, 3000, 3500], 3500)).toBe(DEFAULT_QUIET.maxMs);
  });
  it('starts a fresh burst after a long quiet gap', () => {
    expect(quietDelay([0, 500, 1000, 4500], 4500)).toBe(1500);
  });
});

describe('result cache', () => {
  it('evicts the least recently used entry', () => {
    const c = createResultCache<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    c.clear();
    expect(c.get('a')).toBeUndefined();
  });
});

describe('quiet preparer', () => {
  it('builds after the base delay and delivers', async () => {
    const { clock, p, built, ready } = setup();
    p.change('a');
    expect(p.pendingKey).toBe('a');
    await clock.advance(1499);
    expect(built).toEqual([]);
    await clock.advance(1);
    expect(built).toEqual(['a']);
    expect(ready).toEqual([['a', 'built:a']]);
    expect(p.pendingKey).toBeNull();
  });

  it('waits 2500ms after the last of three changes 500ms apart', async () => {
    const { clock, p, built } = setup();
    p.change('a');
    await clock.advance(500);
    p.change('b');
    await clock.advance(500);
    p.change('c');
    await clock.advance(2499);
    expect(built).toEqual([]);
    await clock.advance(1);
    expect(built).toEqual(['c']);
  });

  it('aborts a superseded build and never delivers it', async () => {
    let release!: (v: string) => void;
    const { clock, p, ready, errors, signals } = setup(
      (key, signal) =>
        new Promise<string>((res) => {
          signals.push(signal);
          if (key === 'a') release = res;
          else res('built:b');
        }),
    );
    p.change('a');
    await clock.advance(1500);
    expect(p.building).toBe(true);
    p.change('b');
    expect(signals[0].aborted).toBe(true);
    release('built:a');
    await clock.advance(5000);
    expect(ready).toEqual([['b', 'built:b']]);
    expect(errors).toEqual([]);
  });

  it('does not report AbortError from a superseded build', async () => {
    const { clock, p, errors } = setup(
      (_k, signal) =>
        new Promise<string>((_res, rej) => {
          signal.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')));
        }),
    );
    p.change('a');
    await clock.advance(1500);
    p.change('b');
    await clock.advance(0);
    expect(errors).toEqual([]);
  });

  it('delivers a cached key synchronously with no build', async () => {
    const { clock, p, built, ready } = setup();
    p.change('a');
    await clock.advance(1500);
    p.change('b');
    await clock.advance(1500);
    built.length = 0;
    p.change('a');
    expect(ready[ready.length - 1]).toEqual(['a', 'built:a']);
    await clock.advance(5000);
    expect(built).toEqual([]);
  });

  it('now() builds immediately, and not twice', async () => {
    const { clock, p, built } = setup();
    p.change('a');
    p.now();
    expect(built).toEqual(['a']);
    p.now();
    expect(built).toEqual(['a']);
    await clock.advance(5000);
    expect(built).toEqual(['a']);
  });

  it('now() with nothing pending is a no-op', () => {
    const { p, built } = setup();
    p.now();
    expect(built).toEqual([]);
  });

  it('reports real build errors', async () => {
    const { clock, p, errors } = setup(async () => {
      throw new Error('boom');
    });
    p.change('a');
    await clock.advance(1500);
    expect(errors).toHaveLength(1);
  });

  it('dispose cancels the timer and running build', async () => {
    const { clock, p, built, ready } = setup();
    p.change('a');
    p.dispose();
    await clock.advance(5000);
    expect(built).toEqual([]);
    const s = setup();
    s.p.change('a');
    await s.clock.advance(1500);
    s.p.change('b');
    s.p.dispose();
    await s.clock.advance(5000);
    expect(s.ready.every(([k]) => k !== 'b')).toBe(true);
    expect(s.p.pendingKey).toBeNull();
    expect(ready).toEqual([]);
  });
});
