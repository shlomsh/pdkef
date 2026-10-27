/**
 * `next` when any field differs from `prev` (Object.is), else `prev` itself. A reducer that
 * replaced separate useState setters returns through this, so an action that changes nothing
 * skips the render, as each setter did on an unchanged value.
 */
export function unlessUnchanged<T extends object>(prev: T, next: T): T {
  if (prev === next) return prev;
  const keys = Object.keys(next) as (keyof T)[];
  if (keys.length !== Object.keys(prev).length) return next;
  return keys.every((key) => Object.is(prev[key], next[key])) ? prev : next;
}
