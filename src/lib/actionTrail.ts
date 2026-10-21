/**
 * The last few things a person did in a tool (DEBT-31), kept in memory only for the life of the page
 * so an error report can say what led to it. A name off the closed list in `errorReportSchema.ts`,
 * nothing else: no file name, count, position or text. It never throws and never leaves the page
 * by itself; only `reportError` reads it, when something already broke.
 */
import { ACTIONS, MAX_ACTIONS, type ActionName } from './errorReportSchema.ts';

const trail: ActionName[] = [];
const listeners = new Set<(name: ActionName) => void>();
const KNOWN: ReadonlySet<string> = new Set(ACTIONS);

/**
 * Call from a handler, after the person did the thing. A repeat of the last action is dropped, so
 * a drag or a slider cannot push the useful history out of the ring.
 */
export function recordAction(name: ActionName): void {
  if (!KNOWN.has(name)) return; // a cast or untyped caller must not poison every report
  for (const listener of listeners) {
    try {
      listener(name);
    } catch {
      // expected: a listener must never break the tool that recorded the action
    }
  }
  if (trail[trail.length - 1] === name) return;
  trail.push(name);
  if (trail.length > MAX_ACTIONS) trail.shift();
}

/** Oldest first. */
export function recentActions(): readonly ActionName[] {
  return [...trail];
}

export function resetActionTrailForTests(): void {
  trail.length = 0;
}

/** Hears every recorded action, repeats included (SEO-46: the moment of a download). Returns the unsubscribe. */
export function onAction(listener: (name: ActionName) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
