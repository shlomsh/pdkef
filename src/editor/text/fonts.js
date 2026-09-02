/**
 * @file fonts.js
 * @description The bundled font catalogue and the one rule that decides which
 * font actually renders a piece of text.
 *
 * Kept free of pdf-lib/pdfjs imports on purpose: both the editor (Preact island)
 * and the exporter import this, and they must agree character for character.
 * The editor shows a font via @font-face, where the browser silently falls back
 * per character to some system font for glyphs the file lacks — but a PDF
 * embeds exactly one font per run and has no fallback, so a missing glyph is an
 * empty rectangle in the download. Letting the browser pick the fallback means
 * the screen and the export disagree, and you only find out after downloading.
 * So the substitution is decided here, explicitly, and applied on both sides.
 */

import { DEFAULT_FONT_SIZE_PT, DEFAULT_LINE_HEIGHT_EM, TEXT_BOX_PADDING_EM } from '../../constants/signGeometry.js';
import { fontFileHasGlyph } from '../../lib/fontCoverageTable.js';
import { DEFAULT_FONT_FAMILY, FONT_BY_FAMILY, FONT_MANIFEST, RETIRED_FONTS as RETIRED_FONT_MAP } from './fontManifest.js';
import { findMissingGlyphs } from './textTransforms.js';

export const HANDWRITING_FONTS = FONT_MANIFEST.filter((font) => font.kind === 'handwriting').map((font) => font.family);
export const TEXT_FONTS = FONT_MANIFEST.filter((font) => font.kind === 'text').map((font) => font.family);

/**
 * Real ascent/descent for every bundled family, as a fraction of the em —
 * read from each TTF's hhea table (weights within a family share vertical
 * metrics, so this is keyed by family only). Verified against the real asset
 * bytes by src/lib/fontCoverage.test.js, the same way it checks Hebrew glyph
 * coverage — update both together if a font file is ever swapped.
 *
 * CSS `line-height` sets a fixed-height line box, but a browser positions
 * glyphs inside it by the font's own ascent+descent (half-leading, split
 * evenly top and bottom), not by the line-height number itself. Most bundled
 * faces have an ascent+descent bigger than DEFAULT_LINE_HEIGHT_EM, so they
 * paint outside that line box by (ascent+descent - DEFAULT_LINE_HEIGHT_EM)/2
 * on each side — worst for the loopy script faces (Pacifico's loops need
 * roughly 3x what Arimo does), but Heebo, a plain text font, needs real room
 * too. A `<textarea>` clips its own content to its box regardless of
 * `overflow`, so an under-padded box reads as a clipped ascender/descender.
 * textBoxPaddingEm() below is what turns this into the padding each font
 * actually needs, without inflating every other font's box to match the
 * worst case.
 */
export const FONT_VERTICAL_METRICS = Object.freeze(Object.fromEntries(
  FONT_MANIFEST.map((font) => [font.family, font.metrics]),
));

// Slack on top of the computed overhang: the metrics are the font's design
// box, but a real string can still paint past it - a flourish like Gveret
// Levin's ץ tail clipped at the previous, thinner slack (0.02em). Costs
// nothing on fonts that don't need it - they're floored at
// TEXT_BOX_PADDING_EM below regardless.
const VERTICAL_METRICS_SLACK_EM = 0.06;

/**
 * Vertical padding (em, each side) a text box needs so `fontFamily`'s real
 * ascent+descent never spills past its line box. Never goes below
 * TEXT_BOX_PADDING_EM, the box's padding for the common case — this only
 * ever adds room on top of it, never removes it.
 */
export function textBoxPaddingEm(fontFamily) {
  const metrics = FONT_VERTICAL_METRICS[fontFamily];
  if (!metrics) return TEXT_BOX_PADDING_EM;
  const overhang = Math.max(0, (metrics.ascent + metrics.descent - DEFAULT_LINE_HEIGHT_EM) / 2);
  return Math.max(TEXT_BOX_PADDING_EM, overhang + VERTICAL_METRICS_SLACK_EM);
}


/**
 * Bundled families whose Regular TTF carries Hebrew glyphs. This used to feed
 * SCRIPT_FALLBACKS' Hebrew row (see git history); that row is gone, replaced
 * by the coverage rule below, but this list is still exported and still
 * verified against the real asset bytes by src/lib/fontCoverage.test.js and
 * src/editor/registry/hebrewMarkPlacement.test.js's mark-placement guard, so
 * it stays as a plain, hand-checked fact about the catalogue.
 */
export const HEBREW_CAPABLE_FONTS = FONT_MANIFEST
  .filter((font) => font.acceptance?.hebrewMarkPlacement)
  .map((font) => font.family);

/**
 * Families we used to ship, mapped to what replaces them.
 *
 * **Dropping a font is not the same as deleting its name.** Drafts persist for
 * 14 days and carry the family the user picked, so a retired name keeps
 * arriving after the files are gone. Left unmapped it produces exactly the bug
 * this whole area exists to close: the editor falls back per character to some
 * system font while the export, unable to fetch the missing TTF, falls back to
 * Arimo, so the screen and the download disagree again.
 *
 * Mapping is applied first thing in `resolveFontFamily`, so both sides land on
 * the same face without either of them needing to know the font ever existed.
 *
 * **Playpen Sans Hebrew, dropped 2026-08-23.** A handwriting face carrying
 * `calt`, which fontkit and HarfBuzz resolve differently, so the export drew
 * different letterforms than the editor showed - 22 of 25 realistic strings
 * disagreed, and 2.304px on two words with unhinted metrics. No pipeline stage
 * fixes a divergence inside the shaper, and the alternative was bundling a
 * second shaper for one decorative font. Replaced by Gveret Levin, the other
 * bundled handwriting face with Hebrew coverage, so a restored draft keeps its
 * handwritten character. Full reasoning in
 * docs/hebrew-text-shaping-export.md.
 *
 * **Almarai, dropped 2026-08-28.** Not a shaping bug, a screened upgrade: TODO.md's
 * Pashto entry found eleven Pashto letters (ټ ځ څ ډ ړ ږ ښ ګ ڼ ې ۍ) absent from
 * every bundled font including Almarai, and the question was whether a single
 * face could carry Arabic, Farsi/Dari, Urdu *and* Pashto so the catalogue keeps
 * one Arabic face rather than gaining a second. Five OFL candidates were run
 * through the 151-case Arabic pixel guard plus a new 22-case Pashto corpus;
 * Scheherazade New passed both cleanly (Amiri did too but reads as calligraphic,
 * wrong for a form-filling tool; both Noto Arabic faces failed the same
 * stacked-diacritic case). This is a heavier, more traditional Naskh than
 * Almarai's geometric-sans face, so every existing Arabic/Dari/Farsi user's
 * output changes visibly - a real cost, paid once, for Pashto to work at all.
 */
export const RETIRED_FONTS = RETIRED_FONT_MAP;

/** The family everything falls back to when nothing was picked at all. */
const DEFAULT_FAMILY = DEFAULT_FONT_FAMILY;

/**
 * One style tag per catalogue family (docs/wysiwyg-text-architecture.md
 * §3.3): `handwriting` for the eight signature-style faces, and `sans`/
 * `serif`/`mono` for the eight text faces, grouped the way a font picker
 * already groups them visually.
 *
 * This changes nothing about today's output - Tinos is the only serif and
 * Cousine the only mono, so neither ever has a same-tag alternative to prefer
 * - and that is the point. It makes `resolveFontSubstitution`'s ordering rule
 * *right* rather than *accidentally* right, so the day a second serif or a
 * second Hebrew-capable handwriting face joins the catalogue, substitution
 * prefers it automatically instead of falling through to catalogue order.
 */
export const FONT_STYLE_TAGS = Object.freeze(Object.fromEntries(
  FONT_MANIFEST.map((font) => [font.family, font.styleTag]),
));

/**
 * Every family the catalogue offers, in a fixed order used as the last
 * tiebreaker when more than one candidate covers a piece of text.
 *
 * Han unification makes this tiebreaker load-bearing in a way it isn't
 * anywhere else in the catalogue: Noto Sans JP, SC, TC and KR share the same
 * Unicode codepoints for thousands of Han characters, so a piece of Chinese
 * text typed into a non-CJK font (the common case - nobody starts from the
 * Chinese font unless they already know to pick it) can be "covered" by all
 * four at once, and `resolveFontSubstitution` has no signal for which region
 * the writer means - it ranks by style tag, then handwriting-class, then
 * this array's order, none of which encode "this is Chinese, not Japanese".
 * JP is listed first only because it shipped first (see TODO.md's Chinese
 * entry); that means a Chinese sentence built entirely from joyo/jinmeiyo
 * kanji still silently resolves to Japanese letterforms unless the user
 * explicitly picks Noto Sans SC or TC, exactly the "half there, wrong
 * shapes" problem SC/TC were added to fix, now just opt-in instead of
 * unfixable. There is no ranking signal available here that would resolve it
 * automatically - explicit selection is the only correct signal, so the
 * FAQ/Sign languages copy says so rather than claiming the ambiguity is
 * gone. Korean shares nothing with the other three (Hangul sits outside the
 * Han block), so it has no version of this problem.
 */
const CATALOGUE = [...HANDWRITING_FONTS, ...TEXT_FONTS];

const FONT_FACE_KEY = { normal: { normal: 'normal', italic: 'italic' }, bold: { normal: 'bold', italic: 'boldItalic' } };

/**
 * The filename `loadCustomFont()` (src/editor/adapters/pdf/sign.js) would *request* for
 * `(family, weight, style)`, before any 404 fallback - i.e. the file that
 * actually carries this exact weight/style, not whatever ends up embedded.
 * The manifest stores this explicitly rather than deriving it from a family
 * string, so CSS, coverage, export, and the real file cannot disagree.
 */
export function requestedFontFile(family, weight = 'normal', style = 'normal') {
  const face = FONT_FACE_KEY[weight === 'bold' ? 'bold' : 'normal'][style === 'italic' ? 'italic' : 'normal'];
  return FONT_BY_FAMILY[family]?.faces[face] || null;
}

/**
 * Does the canonical manifest list a real file for this exact
 * `(family, weight, style)` - not a fallback, the actual face? Manifest-vs-
 * disk and generated coverage checks keep this from drifting from the bytes.
 *
 * This is the predicate the picker uses to decide whether Bold/Italic is
 * offered at all (docs/wysiwyg-text-architecture.md §3.4, W5). It answers a
 * different question than `covers()` below: `covers()` asks "does the file
 * that will actually be embedded (falling back to Regular if needed) draw
 * this text", which is always true once a font falls back to Regular, since
 * Regular exists for every family. `hasRealFace` asks "is there a face at
 * all", which is what `loadCustomFont`'s silent 404-to-Regular fallback
 * cannot answer for itself - the whole reason "bold X" used to render bold
 * on screen and upright in the download.
 *
 * @param {string} family
 * @param {string} weight - 'normal' | 'bold'
 * @param {string} style - 'normal' | 'italic'
 * @returns {boolean}
 */
export function hasRealFace(family, weight, style) {
  return requestedFontFile(family, weight, style) !== null;
}

/**
 * The exact filename that will actually be embedded for `(family, weight,
 * style)` - mirroring src/editor/adapters/pdf/sign.js's `loadCustomFont()` fallback chain
 * (request the specific weight/style file, fall back to `-Regular.ttf` if it
 * 404s) without doing any network I/O. The exporter calls this function too,
 * so this is one shared decision rather than a mirrored fallback chain.
 *
 * Judging coverage against this filename, not against `family` alone, is
 * what makes `covers()` answer the question that matters: a bold request for
 * a family with no bold face embeds the *Regular* file, so a glyph the
 * Regular file lacks is genuinely missing even if some other weight of the
 * family would have had it.
 */
export function embeddedFontFile(family, weight, style) {
  const requested = requestedFontFile(family, weight, style);
  return requested || requestedFontFile(family, 'normal', 'normal');
}

/**
 * Does `family`, at `(weight, style)`, have a glyph for every character of
 * `text`, once `text` has gone through the same normalize/strip/compose chain
 * that will actually reach the shaper? See
 * docs/wysiwyg-text-architecture.md §3.1 for the exact five steps and why
 * each one matters; `findMissingGlyphs` (src/lib/textTransforms.js) is that
 * chain's one implementation, shared with `unrepresentableCharacters` in
 * src/editor/registry/text.ts so the two can never diverge.
 *
 * Deliberately does not fall back to another family when the requested
 * `(weight, style)` file does not exist - see `embeddedFontFile` above and
 * §3.4: that is the picker's job (W5, not this), and doing it here would
 * quietly trade "bold Caveat" for "bold Arimo", losing the handwriting
 * character to honour a checkbox.
 *
 * @param {string} family
 * @param {string} weight - 'normal' | 'bold'
 * @param {string} style - 'normal' | 'italic'
 * @param {string} text
 * @returns {boolean}
 */
export function covers(family, weight, style, text) {
  return missingGlyphs(family, weight, style, text).length === 0;
}

/** Missing characters in this face, before any automatic family fallback. */
export function missingGlyphs(family, weight, style, text) {
  if (!text) return [];
  const file = embeddedFontFile(family, weight, style);
  return findMissingGlyphs(text, (cp) => fontFileHasGlyph(file, cp));
}

/**
 * The family that should actually render `text`, plus enough context to say
 * *why* it changed - so the editor can explain a substitution to the user
 * without re-deriving the rule and drifting from it.
 *
 * This is the coverage-first rule from docs/wysiwyg-text-architecture.md §3.2,
 * replacing the old per-script SCRIPT_FALLBACKS table (removed - see git
 * history). The table's failure mode was row order: text mixing two scripts
 * that both needed substituting always resolved by whichever row matched
 * first, which could refuse a document a bundled font genuinely could have
 * drawn (`שלום Привіт` in Heebo used to be refused outright, because the
 * Hebrew row matched first and Heebo already passed it - see §3.6). Judging
 * real glyph coverage instead removes that accident.
 *
 * 1. A family we have since retired (see RETIRED_FONTS) is mapped to its
 *    replacement first, so a draft saved against a font that no longer ships
 *    still renders identically on both sides.
 * 2. If the requested family already covers the text, it is left alone.
 * 3. Otherwise every catalogue family that covers the text is a candidate,
 *    ranked by: same style tag as requested (handwriting/sans/serif/mono),
 *    then same class (handwriting vs upright), then catalogue order - see
 *    §3.3. The best-ranked candidate wins, and `missing` names what the
 *    requested family itself could not draw (for `describeFontSubstitution`).
 * 4. If no catalogue family covers the whole text - two scripts with no
 *    shared font, e.g. Hebrew and Arabic - the requested family is kept
 *    rather than substituting to something arbitrary, and `missing` names
 *    the characters that genuinely no bundled family can draw. `signPdf`'s
 *    own refusal (via findUnrepresentableCharacters, judged against this same
 *    `family`) remains the backstop that actually stops the download.
 *
 * Substitutes a whole element at a time rather than a character at a time: a
 * run-by-run split would render "רחוב 17" in two different faces, and the
 * editor and the PDF would have to agree on where every run starts. One
 * family per box is what both sides can guarantee identically.
 *
 * @param {string} [fontFamily] - the family the user chose; falls back to
 *   DEFAULT_FAMILY when unset, so callers may pass undefined
 * @param {string} text - the element's current content
 * @param {string} [weight] - 'normal' | 'bold'
 * @param {string} [style] - 'normal' | 'italic'
 * @returns {{ family: string, requested: string, missing: string[] }}
 *   `family` is what to render and embed; `missing` is empty when nothing
 *   was substituted and non-empty otherwise, naming what forced the change.
 */
export function resolveFontSubstitution(fontFamily, text, weight = 'normal', style = 'normal') {
  // Retired families first, so everything below sees only a family we ship.
  const requested = RETIRED_FONTS[fontFamily] || fontFamily || DEFAULT_FAMILY;
  const value = text || '';

  if (covers(requested, weight, style, value)) return { family: requested, requested, missing: [] };

  const requestedMissing = missingGlyphs(requested, weight, style, value);

  const requestedTag = FONT_STYLE_TAGS[requested];
  const requestedIsHandwriting = HANDWRITING_FONTS.includes(requested);
  const candidates = CATALOGUE.filter((family) => covers(family, weight, style, value));

  if (candidates.length > 0) {
    const ranked = [...candidates].sort((a, b) => {
      const tagRank = (f) => (FONT_STYLE_TAGS[f] === requestedTag ? 0 : 1);
      const classRank = (f) => (HANDWRITING_FONTS.includes(f) === requestedIsHandwriting ? 0 : 1);
      return tagRank(a) - tagRank(b)
        || classRank(a) - classRank(b)
        || CATALOGUE.indexOf(a) - CATALOGUE.indexOf(b);
    });
    return { family: ranked[0], requested, missing: requestedMissing };
  }

  // No single catalogue family covers the whole string - two scripts with no
  // shared font. `family` stays `requested` (nothing better exists to switch
  // to), so `missing` must name what *that* family cannot draw - i.e. what
  // will actually be absent from the download if the user proceeds. That is
  // exactly `requestedMissing`, already computed above.
  //
  // This is a deliberate narrowing from "characters no catalogue family can
  // draw" (a fact about the whole catalogue, useful for a coverage report,
  // not about this element). The wider phrasing went empty on mixed-script
  // text like Hebrew+Arabic: Arimo can draw the Hebrew and Scheherazade New
  // can draw the Arabic, so no single character is uncoverable *by some font*, even
  // though no font covers the whole string - exactly the case where the user
  // most needs telling. Naming what the kept family can't draw also keeps
  // this in lockstep with findUnrepresentableCharacters, which judges against
  // the same embedded family signPdf will actually use - see the header of
  // textCoverage.js for why the notice and the save-time refusal must never
  // name different characters.
  return { family: requested, requested, missing: requestedMissing };
}

/**
 * The family to render and embed for `text`. A thin wrapper over
 * `resolveFontSubstitution` so the rule has exactly one implementation - the
 * editor, the exporter and both coverage checks all land here.
 *
 * @param {string} [fontFamily] - the family the user chose
 * @param {string} text - the element's current content
 * @param {string} [weight] - 'normal' | 'bold'
 * @param {string} [style] - 'normal' | 'italic'
 * @returns {string} the family to render and embed
 */
export function resolveFontFamily(fontFamily, text, weight = 'normal', style = 'normal') {
  return resolveFontSubstitution(fontFamily, text, weight, style).family;
}

/**
 * SIGN-08: the one typography descriptor the editor and the exporter both
 * resolve against - face, available weight/style, size and per-font padding,
 * computed once instead of scattered across TextNode (preview),
 * ElementToolbar (the Bold/Italic controls) and text.ts (export).
 *
 * The weight/style it returns are never the raw requested ones - they are
 * clamped to whatever the *resolved* family actually has a real file for
 * (`hasRealFace`). Before this, TextNode rendered `element.fontWeight`
 * directly, so a stale draft (or a family switch) carrying `fontWeight:
 * 'bold'` with no real bold face painted a browser-*synthesized* bold on
 * screen while `text.ts` asked `loadCustomFont` for the same missing file,
 * 404'd, and silently embedded Regular - bold in the editor, upright in the
 * download, with nothing telling the user the two had diverged. Resolving
 * the clamp once, here, and having both sides render/embed *that* value
 * instead of the element's raw flags is what makes that divergence
 * structurally impossible rather than a per-caller discipline. The element's
 * own `fontWeight`/`fontStyle` are left on the model untouched (so switching
 * back to a family that does have the face still works), only the rendered/
 * embedded values are clamped.
 *
 * @param {string} [fontFamily] - the family the user chose
 * @param {string} text - the element's current content
 * @param {string} [fontWeight] - 'normal' | 'bold', as stored on the element
 * @param {string} [fontStyle] - 'normal' | 'italic', as stored on the element
 * @param {number} [fontSize] - the element's chosen size in points, if any
 * @returns {{
 *   family: string, requested: string, missing: string[],
 *   requestedWeight: string, requestedStyle: string,
 *   weight: string, style: string, canBold: boolean, canItalic: boolean,
 *   paddingEm: number, size: number,
 * }}
 */
export function resolveTypography(fontFamily, text, fontWeight, fontStyle, fontSize) {
  const requestedWeight = fontWeight === 'bold' ? 'bold' : 'normal';
  const requestedStyle = fontStyle === 'italic' ? 'italic' : 'normal';
  const substitution = resolveFontSubstitution(fontFamily, text, requestedWeight, requestedStyle);
  const family = substitution.family;
  // Checked against the *other* axis's requested value, not just 'normal' -
  // see ElementToolbar's original comment on this, preserved here now that
  // this is where the check lives: a family that ships Bold and Italic
  // separately but not BoldItalic (none do today, but this doesn't assume
  // that) is judged by the exact file a click would actually request.
  const canBold = hasRealFace(family, 'bold', requestedStyle);
  const canItalic = hasRealFace(family, requestedWeight, 'italic');
  return {
    family,
    requested: substitution.requested,
    missing: substitution.missing,
    requestedWeight,
    requestedStyle,
    weight: requestedWeight === 'bold' && canBold ? 'bold' : 'normal',
    style: requestedStyle === 'italic' && canItalic ? 'italic' : 'normal',
    canBold,
    canItalic,
    paddingEm: textBoxPaddingEm(family),
    size: fontSize || DEFAULT_FONT_SIZE_PT,
  };
}
