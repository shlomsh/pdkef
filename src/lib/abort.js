/**
 * Stops a run whose AbortSignal fired: throws the signal's own reason, which is an
 * AbortError DOMException unless the caller aborted with a custom one. With no signal, or one
 * still live, it does nothing. Native `signal.throwIfAborted()` is the same thing; this
 * one also takes an absent signal and a bare `{ aborted }` stand-in from a test.
 *
 * Callers that swallow a superseded run test `err.name === 'AbortError'`.
 *
 * @param {AbortSignal | { aborted: boolean, reason?: unknown } | null | undefined} signal
 */
export function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException('This operation was aborted.', 'AbortError');
}
