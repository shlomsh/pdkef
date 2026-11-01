// READ-06: the notes sheets at the end of a print. Pure: measured note heights in points in, sheets of notes out.

/** Blank margin around the notes on a notes sheet, in pt. */
export const END_NOTES_MARGIN = 36;
/** Room the "Notes" heading takes at the top of the first notes sheet, in pt. */
export const END_NOTES_HEADING = 26;
/** Space between two notes, in pt. */
export const END_NOTES_GAP = 6;

/**
 * Splits notes, already in reading order, over sheets of `sheetHeightPt`: each sheet takes notes until the next one
 * would pass the bottom margin, and the rest continue on a new sheet. `headingPt` is taken off the first sheet. A note
 * taller than a whole sheet still gets a sheet of its own, so none is dropped.
 */
export function endNotesPages<T>(notes: readonly T[], sheetHeightPt: number, measure: (note: T) => number, headingPt = 0): T[][] {
  const pages: T[][] = [];
  let used = 0;
  let room = 0;
  for (const note of notes) {
    const height = measure(note);
    const current = pages[pages.length - 1];
    const gap = current && current.length > 0 ? END_NOTES_GAP : 0;
    if (!current || used + gap + height > room) {
      pages.push([note]);
      used = height;
      room = sheetHeightPt - 2 * END_NOTES_MARGIN - (pages.length === 1 ? headingPt : 0);
    } else {
      current.push(note);
      used += gap + height;
    }
  }
  return pages;
}
