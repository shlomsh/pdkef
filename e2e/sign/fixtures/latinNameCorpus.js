/**
 * Latin correctness corpus for e2e/sign/latin-shaping-guard.spec.js.
 *
 * Every other shaping guard in this directory (Hebrew's Tier 1/2/3, Arabic,
 * Devanagari) exists because a script has a shaping *mechanism* - joining,
 * reordering, mark composition - that a per-codepoint cmap lookup cannot get
 * right. Latin has none of that in general, which is exactly why this guard
 * was never written and why docs/wysiwyg-text-architecture.md's guard map
 * (§1.3) lists Latin as "all 16 [families] / none [proof]" - it looked like
 * the one script that didn't need one.
 *
 * It does need one, for a narrower reason: four bundled handwriting faces
 * (Pacifico, Caveat, Great Vibes, Dancing Script) carry a `calt` (contextual
 * alternates) OpenType feature, and `calt` resolved differently by fontkit
 * (export) and HarfBuzz (Chrome, editor) is the exact, sole reason Playpen
 * Sans Hebrew was dropped from the catalogue - 22 of 25 realistic strings
 * disagreed. Whether these four diverge the same way was, until this guard
 * ran, completely unknown: nobody had ever compared fontkit's shaped output
 * for them against the browser's own rendering. Measured 2026-08-27 by
 * comparing `font.layout()`'s glyph ids against a plain per-codepoint cmap
 * lookup (see TODO.md's W8 entry and the design doc's §1.3 table), `calt`
 * fires on:
 *
 *   Pacifico        - every sample tested, including all five names below
 *   Caveat          - William Nnamdi, Anna-Maria, Shlomi Shahar
 *   Great Vibes     - David Cohen
 *   Dancing Script  - William Nnamdi
 *
 * This is a signing tool. The string these four faces exist to draw is a
 * person's own typed name, so the corpus is built around that rather than
 * around an exhaustive alphabet sweep the way Devanagari's and Arabic's are -
 * "a few simple tests", not a generated combinatorial corpus. Two groups:
 *
 * 1. `nameCases` - the five strings measured above to actually trigger
 *    `calt` in at least one of the four candidate faces, plus a handful more
 *    realistic names (mixed case, hyphenated, apostrophe, a longer given
 *    name) so a real divergence isn't reported only via the five that are
 *    already known to be contextual.
 * 2. `formFieldCases` - this app signs and fills forms, not just names, and
 *    a form field's alphabet (digits, `/`, `-`, `.`, `@`, `+`, parentheses,
 *    comma) is a different, and differently punctuation-heavy, input than a
 *    name. Kept short, the way a real form field is: a date, a street
 *    address line, a phone number, an email-shaped string, a city/state, an
 *    apartment number, a couple of short abbreviations. None of these were
 *    part of the `calt` measurement above, so they also cover the "does
 *    something *outside* the known-contextual sample still agree" question.
 *
 * Every case is verified against the *same browser's own shaping* (see the
 * spec file's use of shapingGuardHarness.js), never against a hand-derived
 * notion of "correct" Latin - this file only supplies the inputs.
 */

export const nameCases = [
  { id: 'name-sarah-levi', text: 'Sarah Levi' },
  { id: 'name-william-nnamdi', text: 'William Nnamdi' },
  { id: 'name-anna-maria', text: 'Anna-Maria' },
  { id: 'name-david-cohen', text: 'David Cohen' },
  { id: 'name-shlomi-shahar', text: 'Shlomi Shahar' },
  { id: 'name-maria-garcia', text: 'Maria Garcia' },
  { id: 'name-john-smith', text: 'John Smith' },
  { id: 'name-obrien', text: "Fiona O'Brien" },
  { id: 'name-jean-luc', text: 'Jean-Luc Picard' },
  { id: 'name-priya-patel', text: 'Priya Patel' },
  { id: 'name-wei-chen', text: 'Wei Chen' },
  { id: 'name-alexandra', text: 'Alexandra Whitfield' },
  { id: 'name-initials', text: 'J. D. Salinger' },
];

export const formFieldCases = [
  { id: 'field-date-slash', text: '08/27/2026' },
  { id: 'field-date-dash', text: '27-08-2026' },
  { id: 'field-street-address', text: '221B Baker Street' },
  { id: 'field-apartment', text: 'Apt 4B' },
  { id: 'field-city-state', text: 'New York, NY' },
  { id: 'field-zip', text: '10001-4567' },
  { id: 'field-phone', text: '+1 (555) 123-4567' },
  { id: 'field-email', text: 'jane.doe@example.com' },
  { id: 'field-place', text: 'Tel Aviv' },
  { id: 'field-na', text: 'N/A' },
  { id: 'field-tbd', text: 'TBD' },
  { id: 'field-signed', text: 'Signed: S. Shahar' },
];

export const LATIN_CORPUS = [...nameCases, ...formFieldCases];
