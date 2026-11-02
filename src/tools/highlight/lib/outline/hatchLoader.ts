// READ-14: rough.js is fetched the first time a Pencil mark is drawn and never before, so the first paint carries none of it.
type HatchModule = typeof import('#editor/geometry/hatchStroke.ts');

let pending: Promise<HatchModule> | null = null;
let loaded: HatchModule | null = null;

export function loadHatch(): Promise<HatchModule> {
  pending ??= import('#editor/geometry/hatchStroke.ts').then((m) => (loaded = m)).catch((err) => { pending = null; throw err; });
  return pending;
}

/** The module once `loadHatch` has resolved, for the callers (print, the live swipe) that draw without waiting. */
export const hatchIfLoaded = (): HatchModule | null => loaded;

/** @testSeam */
export function _resetForTest(): void {
  pending = null;
  loaded = null;
}
