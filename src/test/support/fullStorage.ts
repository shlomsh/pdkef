/**
 * Fills a real Storage to its quota, so the next write that grows it throws a real QuotaExceededError.
 * Removing or shrinking a key still works, as in a browser. `clear()` empties it again.
 */
export function fillStorage(storage: Storage): void {
  let size = 1 << 22;
  let held = '';
  while (size >= 1) {
    try {
      storage.setItem('filler', held + 'x'.repeat(size));
      held += 'x'.repeat(size);
    } catch {
      // expected: this step does not fit, a smaller one may
      size = Math.floor(size / 2);
    }
  }
}
