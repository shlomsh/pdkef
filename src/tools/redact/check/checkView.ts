/**
 * What the saved-file check shows, decided in one pure place: whether it opens
 * on its own, which summary lines lead it, and which term rows it lists. The
 * component only renders this.
 */
import { ALL_CLEAR, NOTHING_COVERED_SHORT, picturePagesNote } from './checkCopy.ts';
import type { TermResult } from './types.ts';

export interface CheckView {
  /** Open the check: something needs the person (a finding, an unsolid box, a surviving detail, a removal note). */
  expanded: boolean;
  /** One-line summaries shown above the disclosure, in order. */
  lines: string[];
  /** Term results to list. Rows with no finding are dropped when every saved page is a picture. */
  rows: TermResult[];
}

export function checkView(input: {
  results: TermResult[];
  typed: TermResult[];
  pageCount: number;
  picturePages: number[];
  unsolidPages: number[];
  detailsSurvived: number;
  hasNote: boolean;
}): CheckView {
  const { results, typed, pageCount, picturePages, unsolidPages, detailsSurvived, hasNote } = input;
  const found = (list: TermResult[]) => list.some(({ findings }) => findings.length > 0);
  const expanded = found(results) || found(typed) || unsolidPages.length > 0 || detailsSurvived > 0 || hasNote;
  const allPictures = pageCount > 0 && picturePages.length >= pageCount;
  const hasText = !allPictures;

  const lines: string[] = [];
  if (hasText && results.length > 0 && !expanded) lines.push(ALL_CLEAR);
  else if (hasText && results.length === 0) lines.push(NOTHING_COVERED_SHORT);
  const pictures = picturePagesNote(picturePages);
  if (pictures) lines.push(pictures);

  const rows = [...results.filter(({ findings }) => !allPictures || findings.length > 0), ...typed];
  return { expanded, lines, rows };
}
