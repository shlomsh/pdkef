// Captured at import, before any test installs fake timers, so a faked setImmediate cannot hold it.
const realSetImmediate = (globalThis as unknown as { setImmediate: (callback: () => void) => unknown }).setImmediate;

/**
 * Resolves once every promise already queued has run, including the work those promises queue in
 * turn: the event loop reaches its next check phase only after the microtask queue is empty. It does
 * not wait on the clock. Use it after a signal that an operation finished (a deferred resolved by the
 * mock that runs it), before asserting that its result was or was not applied; call it inside
 * `act(async () => { ... })` so Preact renders what the drained work set.
 */
export function drainPromises(): Promise<void> {
  return new Promise((resolve) => { realSetImmediate(() => resolve()); });
}
