import { useMemo } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import { printNotes } from '../lib/print/printNotes.ts';
import { endNotesPages, END_NOTES_HEADING } from '../lib/print/endNotes.ts';
import type { PrintNotes } from '../lib/print/printMenu.ts';
import type { PrintPage } from '../lib/print/printPlan.ts';
import { useMeasuredHeights } from './useMeasuredHeights.ts';

/**
 * Print with notes at the end: the notes sheet's size (the last page's, upright), the comments in reading
 * order, their hidden measuring, and the sheets they paginate into. Everything is null or empty unless `notes` is 'end'.
 */
export function useEndNotes(notes: PrintNotes, pages: PrintPage[], pageTurns: PageTurns, elements: EditorElement[]) {
  const sheet = useMemo(() => {
    const last = pages[pages.length - 1];
    if (notes !== 'end' || !last) return null;
    return turnsOf(pageTurns, pages.length - 1) % 2 === 1 ? { width: last.height, height: last.width } : { width: last.width, height: last.height };
  }, [notes, pages, pageTurns]);
  const entries = useMemo(() => (sheet ? printNotes(elements, pages) : null), [sheet, elements, pages]);
  const measure = useMeasuredHeights(entries);
  const sheets = useMemo(() => {
    const heights = measure.heights;
    if (!sheet || !entries || !heights) return [];
    return endNotesPages(entries, sheet.height, (n) => heights.get(n.id) ?? 0, END_NOTES_HEADING);
  }, [sheet, entries, measure.heights]);
  return { sheet, entries, measure, pages: sheets };
}
