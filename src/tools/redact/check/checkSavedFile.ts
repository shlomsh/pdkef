/**
 * RED-17: follows each term from the original document to the saved file.
 * Pure; no DOM, no pdf.js import. See `types.ts` for the contract.
 */
import { findMatches, isCovered } from '../find/findMatches.ts';
import type { CheckBox, CheckTerm, Finding, SavedFile, TermResult } from './types.ts';
import type { SearchablePage } from '../find/findMatches.ts';

export interface CheckSavedFileInput {
  terms: CheckTerm[];
  /** The original document's pages, as Find reads them. */
  original: SearchablePage[];
  /** Every box drawn, any type. */
  boxes: CheckBox[];
  saved: SavedFile;
}

/** One finding per term, following it from the original into the saved file. */
export function checkSavedFile(input: CheckSavedFileInput): TermResult[] {
  const { terms, original, boxes, saved } = input;

  return terms.map((term) => {
    type PageFinding = { kind: 'visible-in-picture' | 'in-text'; pageIndex: number };
    const pageFindings: PageFinding[] = [];
    const seen = new Set<string>();

    const addPageFinding = (kind: PageFinding['kind'], pageIndex: number): void => {
      const key = `${kind}:${pageIndex}`;
      if (seen.has(key)) return;
      seen.add(key);
      pageFindings.push({ kind, pageIndex });
    };

    // 1. Visible in a picture: an uncovered original match on a page the
    // saved file kept only as a picture, so text search can't see it.
    for (const match of findMatches(original, term.finder)) {
      if (!saved.picturePages.includes(match.pageIndex)) continue;
      if (isCovered(match, boxes)) continue;
      addPageFinding('visible-in-picture', match.pageIndex);
    }

    // 2. Still in the saved file's own text.
    for (const page of saved.pages) {
      if (term.finder(page.text.text).length > 0) {
        addPageFinding('in-text', page.text.pageIndex);
      }
    }

    // Page findings sort by page, visible-in-picture before in-text on the
    // same page; place findings come after, in the order they were saved.
    pageFindings.sort((a, b) => {
      if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
      if (a.kind === b.kind) return 0;
      return a.kind === 'visible-in-picture' ? -1 : 1;
    });

    const findings: Finding[] = [...pageFindings];

    // 3. In a place outside page text (a field, a comment, metadata, ...).
    for (const place of saved.places) {
      if (term.finder(place.text).length === 0) continue;
      const key = `in-place:${place.kind}:${place.pageIndex ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ kind: 'in-place', place: place.kind, pageIndex: place.pageIndex });
    }

    return { term, findings };
  });
}
