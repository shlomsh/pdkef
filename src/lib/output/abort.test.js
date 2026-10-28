import { describe, expect, it } from 'vitest';
import { isAbortError, throwIfAborted } from './abort.js';

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

describe('isAbortError', () => {
  it('is true for an AbortError DOMException and for any error named AbortError', () => {
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
    const err = new Error('x');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('is false for other errors, null and undefined', () => {
    expect(isAbortError(new TypeError('x'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
