import { describe, expect, it } from 'vitest';
import { throwIfAborted } from './abort.js';

describe('throwIfAborted', () => {
  it('does nothing without a signal or while the signal is live', () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
    expect(() => throwIfAborted(new AbortController().signal)).not.toThrow();
  });

  it('throws the signal\'s AbortError, which is what every catcher tests for', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(expect.objectContaining({ name: 'AbortError' }));
  });

  it('throws a custom reason as it is', () => {
    const controller = new AbortController();
    const reason = new Error('superseded');
    controller.abort(reason);
    expect(() => throwIfAborted(controller.signal)).toThrow(reason);
  });

  it('still throws an AbortError for a bare { aborted } stand-in', () => {
    expect(() => throwIfAborted({ aborted: true })).toThrow(expect.objectContaining({ name: 'AbortError' }));
  });
});
