/**
 * Stops a run whose AbortSignal fired: throws the signal's own reason, which is an
 * AbortError DOMException unless the caller aborted with a custom one. With no signal, or one
 * still live, it does nothing. Native `signal.throwIfAborted()` is the same thing; this
 * one also takes an absent signal and a bare `{ aborted }` stand-in from a test.
 *
 * Callers that swallow a superseded run test it with isAbortError.
 *
 * @param {AbortSignal | { aborted: boolean, reason?: unknown } | null | undefined} signal
 */
export function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException('This operation was aborted.', 'AbortError');
}

/**
 * True when `err` is an AbortError (its `name` says so), the shape throwIfAborted and every
 * aborted fetch, share sheet or signal reason produces. Safe on null, undefined and non-errors.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isAbortError(err) {
  return /** @type {{ name?: unknown } | null | undefined} */ (err)?.name === 'AbortError';
}
