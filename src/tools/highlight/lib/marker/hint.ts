/** R8: the one-time hint after the first mark. */
export const HINT_MS = 4000;
/** @testSeam */
export const HINT_KEY = 'pdkef:highlight:hint-seen';

interface ReadStore { getItem(key: string): string | null }
interface WriteStore { setItem(key: string, value: string): void }

/** Whether the reader has been shown the hint. Storage is optional: without it the hint shows once per visit. */
export function hintSeen(storage: ReadStore | null): boolean {
  try {
    return storage?.getItem(HINT_KEY) === '1';
  } catch {
    return false; // expected: blocked storage reads as "not seen yet"
  }
}

export function markHintSeen(storage: WriteStore | null): void {
  try {
    storage?.setItem(HINT_KEY, '1');
  } catch {
    // expected: blocked or full storage only means the hint may show again
  }
}
