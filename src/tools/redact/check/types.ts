/**
 * RED-17 contract: check the saved file. Everything here but the adapters
 * (`readSavedFile.ts`, `renderBoxes.ts`) is pure, so it runs the same in a unit
 * test, a corpus script in Node, and the island.
 *
 *   original pages + boxes ──coveredTerms──▶ CheckTerm[] (plus Find's and typed terms)
 *   saved bytes ──readSavedFile──▶ SavedFile
 *   terms + original + boxes + SavedFile ──checkSavedFile──▶ TermResult[]
 *   saved page render + boxes ──boxSolidity──▶ BoxSolidity[]
 *
 * Nothing here ever reports that a term is absent. A term with no findings
 * means only that no match was found in the text we could read; the UI says
 * so, names the picture pages, and leaves the decision to the person.
 */
import type { SearchablePage } from '../find/findMatches.ts';
import type { Finder, PercentBox } from '../find/types.ts';

/** Where a term came from: under a box, a deleted text run, a Find search, or typed in the check. */
export type TermSource = 'covered' | 'deleted' | 'find' | 'typed';

export interface CheckTerm {
  /** What the person sees: the covered or deleted text, the Find term, or the preset's label. */
  label: string;
  source: TermSource;
  finder: Finder;
}

/** A box the person drew, in page-percent units. */
export interface CheckBox extends PercentBox {
  pageIndex: number;
  type: 'blur' | 'blackout' | 'whiteout';
  /** Fill colour of a blackout or whiteout, `#rrggbb`. */
  color?: string;
}

/** Places outside page text where a secret can sit. */
export type PlaceKind =
  | 'field'
  | 'comment'
  | 'link'
  | 'bookmark'
  | 'title'
  | 'author'
  | 'subject'
  | 'keywords'
  | 'metadata'
  | 'attachment'
  /** A part of the file no page shows (RED-49): an old revision's leftovers,
   * an orphaned stream. One place for all of them, since Remove it drops them together. */
  | 'unused';

export interface SavedPlace {
  kind: PlaceKind;
  text: string;
  /** Set for page-bound places (a field, a comment). */
  pageIndex?: number;
  /** False for a place Remove it cannot take out alone (a form field's name).
   * Absent means removable. */
  removable?: boolean;
}

/** What `readSavedFile` reads from the saved bytes. */
export interface SavedFile {
  /** Each saved page's text, visible and invisible, as Find reads it. */
  pages: SearchablePage[];
  places: SavedPlace[];
  /** Pages saved as a picture, or whose content is a picture (a scan):
   * text search can't see what they show. Sorted, zero-based. */
  picturePages: number[];
  attachmentCount: number;
}

export type Finding =
  /** In the original, under no box, on a page that is now a picture. */
  | { kind: 'visible-in-picture'; pageIndex: number }
  /** Found in a saved page's text. */
  | { kind: 'in-text'; pageIndex: number }
  /** Found in a place outside page text. `placeIndex` is that place's index in
   * `SavedFile.places`, and `text` its text, so a caller can hand the place
   * back unchanged (to `removePlaces`). */
  | { kind: 'in-place'; place: PlaceKind; pageIndex?: number; text: string; placeIndex: number; removable?: boolean };

export interface TermResult {
  term: CheckTerm;
  /** In page order, then place order. Empty means no match was found in what
   * could be read, never that the term is absent. */
  findings: Finding[];
}

export interface BoxSolidity {
  /** Index into the boxes passed in. */
  boxIndex: number;
  /** True when every pixel inside the box's inset area is its fill colour,
   * within tolerance. Blur boxes are not checked and never appear here. */
  solid: boolean;
}
