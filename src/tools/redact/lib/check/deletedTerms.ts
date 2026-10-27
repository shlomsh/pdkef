/**
 * The text a person deleted becomes `CheckTerm`s too, so the check of a
 * Delete-only download looks for what was taken out, the same way it looks
 * for what a box covers. Pure: it reads the delete marks' own previews, which
 * come from the glyph read (RED-16), so Hebrew is already in reading order.
 */
import { termFinder } from '../find/finders.ts';
import { MIN_COVERED_CHARS } from './coveredTerms.ts';
import type { CheckTerm } from './types.ts';

export interface DeleteMarkLike {
  type: string;
  kind?: string;
  preview?: string;
}

/** A label with spacing and case ignored, so variants count as one term. */
export function foldLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/** The terms with repeats (by folded label) dropped; the first wins. */
export function uniqueTerms(terms: CheckTerm[]): CheckTerm[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = foldLabel(term.label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One term per deleted text run, in mark order, skipping runs too short to
 * search reliably (the covered-text rule) and repeats. */
export function deletedTerms(marks: readonly DeleteMarkLike[]): CheckTerm[] {
  const terms: CheckTerm[] = [];
  const seen = new Set<string>();
  for (const mark of marks) {
    if (mark.type !== 'delete' || (mark.kind !== 'text' && mark.kind !== 'mark')) continue;
    const label = (mark.preview ?? '').replace(/\s+/g, ' ').trim();
    if (label.replace(/\s/g, '').length < MIN_COVERED_CHARS || seen.has(foldLabel(label))) continue;
    seen.add(foldLabel(label));
    terms.push({ label, source: 'deleted', finder: termFinder(label) });
  }
  return terms;
}
