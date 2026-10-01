/**
 * RED-25: removes one place outside page text from a saved PDF, for "Remove
 * it" in the check. Which place it is comes from `placeLocator.ts`, the same
 * reading `readSavedFile` does, never from a guess. Pure bytes in, bytes out.
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import { isSamePlace, locatePlaces } from './placeLocator.ts';
import type { SavedPlace } from './types.ts';

/** The place was not found in the bytes, so nothing was removed. */
export class PlaceNotFoundError extends Error {
  constructor(place: SavedPlace) {
    super(`No ${place.kind} with that text is in the file any more.`);
    this.name = 'PlaceNotFoundError';
  }
}

/** The same PDF without that one place. When identical places repeat, the
 * first goes; the check then shows the next. Everything else is left as it
 * was: no producer, no dates, no regenerated form pictures. */
export async function removePlace(bytes: Uint8Array, place: SavedPlace): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const found = locatePlaces(doc).find((located) => isSamePlace(located, place));
  if (!found) throw new PlaceNotFoundError(place);
  found.remove();
  return doc.save({ updateFieldAppearances: false });
}
