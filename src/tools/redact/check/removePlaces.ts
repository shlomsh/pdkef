/**
 * RED-60: replays a list of "Remove it" choices onto an open pdf-lib document,
 * so every export applies them again instead of patching one saved copy. Which
 * place each entry means comes from `placeLocator.ts`, the reading
 * `readSavedFile` shares. Pure on the document: no save and no
 * `dropUnreachable`, the caller does both once, after the last removal.
 */
import type { PDFDocument } from '@cantoo/pdf-lib';
import { isSamePlace, locatePlaces } from './placeLocator.ts';
import type { SavedPlace } from './types.ts';

/** Removes the first still-present match of each place, in order, and returns
 * how many were found. A place no longer there is skipped; two identical
 * entries remove two identical places. */
export function removePlaces(doc: PDFDocument, places: readonly SavedPlace[]): number {
  let removed = 0;
  for (const place of places) {
    // Locate afresh: an earlier removal (a bookmark with children) can take others with it.
    const found = locatePlaces(doc).find((located) => isSamePlace(located, place));
    if (!found) continue;
    found.remove();
    removed += 1;
  }
  return removed;
}
