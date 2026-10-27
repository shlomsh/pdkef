/**
 * RED-17 / RED-25: the text rules for "places outside page text", shared by the
 * two readers of those places so they can never disagree about what counts as
 * a place or what its text is:
 *
 *   readSavedFile.ts  reads them from a pdf.js document (what the check shows)
 *   placeLocator.ts   finds the same ones in a pdf-lib document (what Remove it edits)
 *
 * Pure; no pdf.js and no pdf-lib import.
 */

/** A string with something in it. A blank value is not a place. */
export function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** The texts a form field's value stands for: a string, or the strings of a list. */
export function fieldValueTexts(fieldValue: unknown): string[] {
  if (isNonBlank(fieldValue)) return [fieldValue];
  if (Array.isArray(fieldValue)) return fieldValue.filter(isNonBlank);
  return [];
}

/** The name pdf.js shows for an attachment: slashes normalised, the folder part
 * dropped, and "unnamed" when the path leaves nothing. */
export function attachmentName(rawFilename: string): string {
  const normalised = rawFilename.replaceAll('\\\\', '\\').replaceAll('\\/', '/').replaceAll('\\', '/');
  return normalised.substring(normalised.lastIndexOf('/') + 1) || 'unnamed';
}

function normalise(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

/** Two readings of one place's text are the same when only line endings and
 * outer blanks differ. */
export function sameText(a: string, b: string): boolean {
  return normalise(a) === normalise(b);
}
