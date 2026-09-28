/**
 * RED-17: the words a box covers become `CheckTerm`s so the check can look
 * for them elsewhere in the saved file. Pure; the words themselves come from
 * `wordsUnderBoxes`, the same drop rule `planTextLayer` uses to redact them.
 */
import { wordsUnderBoxes } from '../../../editor/adapters/pdf/textLayer.ts';
import type { PageGeometry } from '../../../editor/geometry/coords.ts';
import type { PageGlyph } from '../../../editor/adapters/pdf/pageGlyphs.ts';
import type { PercentBox } from '../find/types.ts';
import { termFinder } from '../find/finders.ts';
import type { CheckTerm } from './types.ts';

/** A phrase shorter than this (non-space characters) is too little to search
 * for reliably, so it is dropped rather than turned into a term. */
export const MIN_COVERED_CHARS = 4;

/**
 * One `CheckTerm` per box across `pages`, in page then box order: the words
 * that box covers, joined with a single space. A box whose phrase has fewer
 * than `MIN_COVERED_CHARS` non-space characters is skipped, and a phrase
 * already seen (by its label) is skipped too, so the first box to cover a
 * phrase owns its term.
 */
export function coveredTerms(
  pages: { glyphs: PageGlyph[]; geometry: PageGeometry; boxes: PercentBox[] }[],
): CheckTerm[] {
  const terms: CheckTerm[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    const words = wordsUnderBoxes(page.glyphs, page.geometry, page.boxes);
    for (const boxWords of words) {
      const phrase = boxWords.join(' ');
      const nonSpaceCount = phrase.replace(/\s+/g, '').length;
      if (nonSpaceCount < MIN_COVERED_CHARS) continue;
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      terms.push({ label: phrase, source: 'covered', finder: termFinder(phrase) });
    }
  }

  return terms;
}
