import type { SavedSignature } from '../../../editor/model/savedSignature.ts';

/** How many saved signatures the on-device library keeps; the newest first. */
export const MAX_SAVED_SIGNATURES = 10;

export function createSavedSignature(
  dataUrl: string,
  aspectRatio: number,
  now: number = Date.now(),
  random: number = Math.random(),
): SavedSignature {
  return { id: `sig-${now}-${random.toString(36).slice(2, 11)}`, dataUrl, aspectRatio };
}

/** The library after saving one more: newest first, the oldest dropped past the cap. */
export function withSavedSignature(list: SavedSignature[], added: SavedSignature): SavedSignature[] {
  return [added, ...list].slice(0, MAX_SAVED_SIGNATURES);
}

export function withoutSavedSignature(list: SavedSignature[], id: string): SavedSignature[] {
  return list.filter((signature) => signature.id !== id);
}

/** The active signature once `removedId` left `remaining`: the first one left, or none. */
export function fallbackActiveSignature(remaining: SavedSignature[]): SavedSignature | null {
  return remaining.length > 0 ? remaining[0] : null;
}

/** The active signature after another tab changed the library: keep it if it is still there. */
export function activeAfterSync(next: SavedSignature[], current: SavedSignature | null): SavedSignature | null {
  return next.find((signature) => signature.id === current?.id) ?? next[0] ?? null;
}
