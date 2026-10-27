// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitUntil } from './waitUntil.ts';

// Real work the tests wait on: a timer the fake clock does not own.
const realSetTimeout = globalThis.setTimeout;
const later = (ms: number) => new Promise((resolve) => { realSetTimeout(resolve, ms); });

describe('waitUntil', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('waits for work that takes longer than a fixed sleep would allow', async () => {
    let done = false;
    void later(120).then(() => { done = true; });
    await waitUntil(() => done);
    expect(done).toBe(true);
  });

  it('accepts an expect() that throws until it holds', async () => {
    const seen: number[] = [];
    void later(60).then(() => { seen.push(1); });
    await waitUntil(() => expect(seen).toEqual([1]));
  });

  it('leaves a fake clock where it was', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'Date'] });
    const before = Date.now();
    let done = false;
    void later(80).then(() => { done = true; });
    await waitUntil(() => done);
    expect(Date.now()).toBe(before);
  });

  it('fails with the last assertion error once the timeout passes', async () => {
    await expect(waitUntil(() => expect(1).toBe(2), { timeout: 100 })).rejects.toThrow(/expected 1 to be 2/);
  });

  it('fails with a plain message when the check only returns false', async () => {
    await expect(waitUntil(() => false, { timeout: 50 })).rejects.toThrow('waitUntil: condition still false after 50 ms');
  });
});
