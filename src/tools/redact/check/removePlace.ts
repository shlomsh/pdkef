/**
 * RED-25: removes one place outside page text from a saved PDF, for "Remove
 * it" in the check. Which place it is comes from `placeLocator.ts`, the same
 * reading `readSavedFile` does, never from a guess. Pure bytes in, bytes out.
 */
import { PDFDocument, ParseSpeeds } from '@cantoo/pdf-lib';
import { dropUnreachable } from '../../../editor/adapters/pdf/reachability.js';
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
 * was, except parts of the file no page shows, which always go (RED-49): no producer, no dates, no regenerated form pictures. */
export async function removePlace(bytes: Uint8Array, place: SavedPlace): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, parseSpeed: ParseSpeeds.Fastest });
  const found = locatePlaces(doc).find((located) => isSamePlace(located, place));
  if (!found) throw new PlaceNotFoundError(place);
  found.remove();
  // RED-49: whatever the file already carried that no page reaches (and whatever
  // this removal just left unreached) does not ride along into the new copy.
  dropUnreachable(doc);
  return doc.save({ updateFieldAppearances: false });
}
