import { describe, expect, it, vi } from 'vitest';
import { createLatestOnly } from './latestOnly';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('createLatestOnly', () => {
  it('starts the task when idle', () => {
    const task = vi.fn(() => Promise.resolve());
    createLatestOnly(task).request();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('never runs two at once, and runs once more after the first settles however many requests came in', async () => {
    const runs = [deferred(), deferred(), deferred()];
    const task = vi.fn(() => runs[task.mock.calls.length - 1].promise);
    const runner = createLatestOnly(task);
    runner.request();
    runner.request();
    runner.request();
    expect(task).toHaveBeenCalledTimes(1);
    runs[0].resolve();
    await flush();
    expect(task).toHaveBeenCalledTimes(2);
    runs[1].resolve();
    await flush();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('runs the follow-up when the first run rejects', async () => {
    const first = deferred();
    const task = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const runner = createLatestOnly(task);
    runner.request();
    runner.request();
    first.reject(new Error('boom'));
    await flush();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('starts fresh after going idle', async () => {
    const task = vi.fn(() => Promise.resolve());
    const runner = createLatestOnly(task);
    runner.request();
    await flush();
    runner.request();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('cancelPending drops the queued follow-up but lets the run in flight finish', async () => {
    const first = deferred();
    const task = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const runner = createLatestOnly(task);
    runner.request();
    runner.request();
    runner.cancelPending();
    first.resolve();
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    runner.request();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
