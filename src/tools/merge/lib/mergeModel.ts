/**
 * The Merge document model: what the history stack (useDocumentHistory) holds.
 * Types and the entry factory only; every transformation of it is a pure
 * function in mergePlan.ts.
 */
import type { PlanEntry } from '../../../lib/pages/pagePlan.ts';

let nextId = 0;

export interface FileEntry {
  id: number;
  file: File;
  /** From inspectPdf; null until read. The plan gets this file's pages only
   * once it is known, so a file with an unknown count has no plan entries. */
  pageCount: number | null;
  pdfCreationDate: number | null;
  thumbnail: string | null;
  /** MERGE-04: a file that cannot take part is kept in the list, marked, so
   * the error block and the row agree on which one it is. */
  error: 'encrypted' | 'unreadable' | null;
}

/* Direction A wave 2 (Shlomi): Reverse folded into the Sort select as its
 * own option, rather than a separate button beside it. */
export type SortMode = 'added' | 'reversed' | 'nameAsc' | 'nameDesc' | 'dateAsc' | 'dateDesc';

export interface Model {
  entries: FileEntry[];
  /** MERGE-09: the single source of output order. Every page of every file,
   * as PlanEntry { key, fileId, pageIndex, rotation, skipped }. Grouped by
   * file until a page crosses a file boundary in the grid. */
  plan: PlanEntry[];
  /** The file sort the menu shows. Part of the document so undoing a sort
   * brings the menu's choice back with the order it produced. */
  sortMode: SortMode;
}

export const EMPTY_MODEL: Model = { entries: [], plan: [], sortMode: 'added' };

export function toEntry(file: File): FileEntry {
  return { id: nextId++, file, pageCount: null, pdfCreationDate: null, thumbnail: null, error: null };
}
