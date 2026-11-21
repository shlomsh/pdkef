import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainPromises } from './drainPromises.ts';

const hops = (count: number, onDone: () => void) => {
  let chain = Promise.resolve();
  for (let i = 0; i < count; i += 1) chain = chain.then(() => undefined);
  void chain.then(onDone);
};

describe('drainPromises in a real browser', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('lets a long promise chain reach its end', async () => {
    let done = false;
    hops(50, () => { done = true; });
    await drainPromises();
    expect(done).toBe(true);
  });

  it('also runs work that a finished chain queues as a new chain', async () => {
    let done = false;
    hops(10, () => { hops(10, () => { done = true; }); });
    await drainPromises();
    expect(done).toBe(true);
  });

  it('works while a test has faked the timers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    let done = false;
    hops(20, () => { done = true; });
    await drainPromises();
    expect(done).toBe(true);
  });
});
