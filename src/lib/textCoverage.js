/**
 * @file textCoverage.js
 * @description Which characters in a document no font can draw - the one
 * implementation, shared by the save-time refusal and the while-typing warning.
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
 * The policy is what must never fork. `signPdf` refuses a download using it,
 * and the editor warns while typing using it; if those two ever disagree, the
 * editor either nags about a document that would export fine or stays quiet
 * about one that is about to be refused. Both call `findUnrepresentableCharacters`
 * below and differ only in how they load a font, which is the `loadFont`
 * argument.
 */
import { combCellCount, combCharacters, isComb } from './comb.js';
import { resolveFontFamily } from './fonts.js';
import { unrepresentableCharacters } from '../editor/registry/text.ts';

/**
 * Every character across every text element that its resolved, embedded font
 * has no glyph for - deduplicated, in first-seen order across the whole
 * document (see docs/hebrew-text-shaping-export.md, "Layer 3").
 *
 * Judged against `resolveFontFamily`'s result, not the family the user picked,
 * because that is the font the export will actually embed: a Latin-only face
 * typed with Hebrew, or any face typed with Hindi or Thai, has already been
 * swapped for one that can draw it by the time this runs. That ordering is
 * what makes this check narrow - it only ever reports characters no bundled
 * font can draw *at all* (Arabic, CJK, emoji), never ones a substitution
 * already rescued.
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
  for (const element of elements || []) {
    if (element.type !== 'text') continue;
    const textValue = (element.text || '').trim();
    if (!textValue) continue;
    const embeddedFamily = resolveFontFamily(element.fontFamily, textValue, element.fontWeight, element.fontStyle);
    const resolvedFont = (await loadFont(embeddedFamily, element.fontWeight, element.fontStyle))
      || (await loadFont('Arimo', element.fontWeight, element.fontStyle));
    if (!resolvedFont) continue;
    const drawnText = isComb(element)
      ? combCharacters(element).slice(0, combCellCount(element)).join('')
      : textValue;
    const found = unrepresentableCharacters(resolvedFont, drawnText);
    if (found.length > 0) pages.add((element.pageIndex ?? 0) + 1);
    for (const ch of found) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      missing.push(ch);
    }
  }
  return { characters: missing, pageNumbers: [...pages].sort((a, b) => a - b) };
}

/**
 * The aside shown when a coverage substitution changed the font under the
 * user.
 *
 * The swap itself is visible the moment they type - the box re-renders in the
 * new face - so this only has to answer "why did that just happen", calmly and
 * without implying they did something wrong. Empty string when nothing was
 * substituted, so the caller can render it or not on truthiness alone.
 *
 * Names the actual characters the requested family could not draw, from
 * `missing` (docs/wysiwyg-text-architecture.md §3.5), rather than naming a
 * script the way this used to ("Arimo has no Hebrew letters"). That claim was
 * a guess derived from which SCRIPT_FALLBACKS row matched, and it was
 * provably wrong on mixed-script text - naming the characters is simply what
 * is true, on every input, with nothing to approximate.
 *
 * @param {{ requested: string, family: string, missing: string[] }} substitution
 *   as returned by `resolveFontSubstitution` in fonts.js
 */
export function describeFontSubstitution({ requested, family, missing }) {
  if (family === requested) return '';
  const list = missing.join(', ');
  return `${requested} has no match for: ${list}, so this text box is using ${family} instead. ${family} is what will be embedded in your download.`;
}

/**
 * The sentence shown for a coverage failure, built in one place so the
 * while-typing warning and the save-time refusal cannot word it differently.
 *
 * Naming the page matters: a document flagged without saying where leaves the
 * user hunting through a long file for a character they may not even be able
 * to see.
 *
 * @param {string[]} characters - as returned above
 * @param {number[]} [pageNumbers] - 1-based
 * @param {{ saving?: boolean }} [options] - `saving` picks the wording for the
 *   refusal at save time; the default is the calmer while-typing wording,
 *   which is a heads-up rather than a stop.
 */
export function describeUnrepresentableText(characters, pageNumbers = [], { saving = false } = {}) {
  const where = pageNumbers.length === 0 ? ''
    : pageNumbers.length === 1 ? ` on page ${pageNumbers[0]}`
      : ` on pages ${pageNumbers.slice(0, -1).join(', ')} and ${pageNumbers[pageNumbers.length - 1]}`;
  const list = characters.join(', ');
  return saving
    ? `The font you picked has no match for: ${list}. Change the font for that text${where}, or remove those characters, then save again.`
    : `None of the bundled fonts can draw: ${list}. That text${where} will stop the download, so it is worth swapping those characters now.`;
}
