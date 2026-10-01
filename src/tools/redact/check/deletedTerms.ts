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

/** One term per deleted text run, in mark order, skipping runs too short to
 * search reliably (the covered-text rule) and repeats. */
export function deletedTerms(marks: readonly DeleteMarkLike[]): CheckTerm[] {
  const terms: CheckTerm[] = [];
  const seen = new Set<string>();
  for (const mark of marks) {
    if (mark.type !== 'delete' || mark.kind !== 'text') continue;
    const label = (mark.preview ?? '').replace(/\s+/g, ' ').trim();
    if (label.replace(/\s/g, '').length < MIN_COVERED_CHARS || seen.has(label)) continue;
    seen.add(label);
    terms.push({ label, source: 'deleted', finder: termFinder(label) });
  }
  return terms;
}
