/**
 * @file textCoverage.js
 * @description Which characters in a document no font can draw.
 *
 * **Three files sit near this name; they do different jobs.** Getting them
 * confused is easy and has bitten this area before, so:
 *
 *  - `fontCoverage.test.js` - a *build-time* check that the catalogue's claims
 *    in fonts.js match the real asset bytes.
 *  - `liveFontCoverage.js` - the *editor's* font loader: fetches a TTF and
 *    parses it with fontkit, cached per file for the life of the page.
 *  - **this file** - the *policy*: which elements get judged, which of their
 *    characters actually reach the page, and which font each one resolves to.
 *
 * Export validation checks actual font bytes here. Editing feedback derives
 * synchronously from the generated glyph data in textFontSupport.js. Both use
 * fonts.js for resolution, textForCoverage for comb truncation, and the same
 * findMissingGlyphs transforms; tests compare their answers against real TTFs.
 * This module returns facts only. Components turn those facts into localized
 * user-facing messages one layer up.
 */
import { textForCoverage } from './comb.js';
import { resolveFontFamily } from './fonts.js';
import { unrepresentableCharacters } from '../registry/text.ts';

/**
 * Every character across every text element that its resolved, embedded font
 * has no glyph for - deduplicated, in first-seen order across the whole
 * document (see docs/hebrew-text-shaping-export.md, "Layer 3").
 *
 * Judged against `resolveFontFamily`'s result, not the family the user picked,
 * because that is the font the export will actually embed: a Latin-only face
 * typed with Hebrew, or any face typed with Hindi or Thai, has already been
 * swapped for one that can draw it by the time this runs. That ordering is
 * what makes this check narrow: it reports missing characters in the resolved
 * font, including mixed scripts with no single shared family, but never ones
 * a complete-text substitution already rescued.
 *
 * Comb fields are elements of `type: 'text'` too (see comb.js), so they get no
 * separate pass; only the cells that actually render are judged, since a comb
 * silently ignores text past its cell count and refusing a document over a
 * character that was never going to reach the page would be a false alarm.
 *
 * Skips an element whose font fails to load entirely (`loadFont` -> null):
 * this pass only judges character coverage, and a font that never loaded is a
 * different failure the caller already surfaces on its own. Never invent a
 * warning out of a loading failure.
 *
 * @param {Array<object>} elements - the document's elements, any type
 * @param {(family: string, fontWeight?: string, fontStyle?: string) => Promise<object|null>} loadFont
 *   resolves to anything `unrepresentableCharacters` accepts (a pdf-lib font,
 *   or `{ embedder: { font } }` around a fontkit instance), or null
 * @returns {Promise<{ characters: string[], pageNumbers: number[] }>}
 *   `pageNumbers` are 1-based, so a message can point at where to look
 */
export async function findUnrepresentableCharacters(elements, loadFont) {
  const seen = new Set();
  const missing = [];
  const pages = new Set();
  // Keep the global summary for save-time validation, but retain the source
  // element too. The editor can then warn at the text box being edited rather
  // than making someone hunt for it from a page-level banner.
  const elementCharacters = {};
  for (const element of elements || []) {
    if (element.type !== 'text') continue;
    // Match text serialization: authored leading/trailing whitespace and
    // blank lines are layout, not disposable input. Only a genuinely empty
    // element has nothing that can need coverage.
    const textValue = element.text || '';
    if (!textValue) continue;
    const embeddedFamily = resolveFontFamily(element.fontFamily, textValue, element.fontWeight, element.fontStyle);
    const resolvedFont = (await loadFont(embeddedFamily, element.fontWeight, element.fontStyle))
      || (await loadFont('Arimo', element.fontWeight, element.fontStyle));
    if (!resolvedFont) continue;
    const drawnText = textForCoverage(element);
    const found = unrepresentableCharacters(resolvedFont, drawnText);
    if (found.length > 0) {
      pages.add((element.pageIndex ?? 0) + 1);
      if (element.id != null) elementCharacters[element.id] = found;
    }
    for (const ch of found) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      missing.push(ch);
    }
  }
  return {
    characters: missing,
    pageNumbers: [...pages].sort((a, b) => a - b),
    elementCharacters,
  };
}
