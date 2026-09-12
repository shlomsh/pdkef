/**
 * Greek correctness corpus for e2e/sign/greek-shaping-guard.spec.js.
 *
 * Greek had no shaping guard before this - the catalogue's three Greek-capable
 * faces so far (Arimo, Tinos, Cousine) carry no `calt`/`liga` table, so there
 * was never a mechanism by which fontkit (export) and the browser's own
 * shaper (editor) could disagree on a letterform, and no guard was needed.
 * Both handwriting candidates screened for FONT-08 (Mynerve, Mansalva) do
 * carry `calt` - the same OpenType feature category that got Playpen Sans
 * Hebrew dropped from the catalogue for an 88% shaping disagreement - so this
 * corpus exists to give the guard something real to measure before either
 * candidate is trusted.
 *
 * Shape, mirroring latinNameCorpus.js (the other `calt`-handwriting corpus in
 * this directory) rather than the generated-combinatorial shape Devanagari's
 * and Arabic's corpora use: this is a signing tool, so the cases that matter
 * most are the ones a person actually types - their own name, a filled-in
 * form field - not an exhaustive sweep of the Unicode block. The guard runs
 * `autoCalibrate: true` (shapingGuardHarness.js), which partitions this
 * corpus itself into non-substituting strings (the calibration set) and
 * substituting strings (the cases under test) per candidate font, so every
 * group below just has to be realistic Greek text, not pre-sorted by whether
 * a particular candidate happens to trigger `calt` on it.
 *
 * Four groups:
 *
 * 1. `baseLetterCases` - every one of the 24 base letters (upper and lower),
 *    isolated. The plainest possible ink; on a font whose `calt` never fires
 *    on an isolated letter these are pure calibration noise, and if a
 *    candidate DOES substitute a bare letter (unlikely, but not something to
 *    assume) that becomes visible as a case under test instead of silently
 *    being asked to double as calibration ink for something it isn't.
 * 2. `diacriticCases` - every tonos (oxia) and dialytika letter the modern
 *    monotonic alphabet uses (see scripts/font-languages.mjs's `GREEK`
 *    definition, the same set the coverage report is judged against):
 *    ά έ ή ί ό ύ ώ / ΆΈΉΊΌΎΏ (tonos) and ϊ ϋ / ΐ ΰ (dialytika, including the
 *    two precomposed tonos+dialytika vowels). A handwriting face that
 *    connects strokes is exactly where a diacritic could plausibly land in a
 *    contextually different spot between fontkit and the browser.
 * 3. `nameCases` - ten realistic Greek given/family names, the string this
 *    tool exists to let someone type as their signature, plus common
 *    words/phrases with spaces (Blink shapes word by word, per H9's Hebrew
 *    finding, so a `calt` rule spanning a space boundary never fires in the
 *    browser while a whole-string fontkit call could still fire it if the
 *    export ever regressed back to shaping a whole line at once - these
 *    cases would catch that even though today's export already shapes
 *    per-segment).
 * 4. `mixedAndRepeatedCases` - Greek text next to digits (a street address,
 *    a year), and repeated letters (αα, σσσ, ΑΑΑ...) - `calt` handwriting
 *    faces are documented (this file's module doc references) to vary how
 *    they draw a repeated letter to avoid an identical-looking run, which is
 *    exactly the kind of contextual decision this guard has to catch if the
 *    two shapers disagree on it.
 *
 * Every case is judged against the *same browser's own shaping*
 * (shapingGuardHarness.js), never against a hand-derived notion of "correct"
 * Greek - this file only supplies the inputs.
 */

const BASE_UPPER = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
const BASE_LOWER = 'αβγδεζηθικλμνξοπρστυφχψω';

export const baseLetterCases = [
  ...Array.from(BASE_UPPER).map((ch, i) => ({ id: `base-upper-${i}`, text: ch })),
  ...Array.from(BASE_LOWER).map((ch, i) => ({ id: `base-lower-${i}`, text: ch })),
];

export const diacriticCases = [
  // Tonos (oxia), lower then upper.
  { id: 'tonos-alpha-lower', text: 'ά' },
  { id: 'tonos-epsilon-lower', text: 'έ' },
  { id: 'tonos-eta-lower', text: 'ή' },
  { id: 'tonos-iota-lower', text: 'ί' },
  { id: 'tonos-omicron-lower', text: 'ό' },
  { id: 'tonos-upsilon-lower', text: 'ύ' },
  { id: 'tonos-omega-lower', text: 'ώ' },
  { id: 'tonos-alpha-upper', text: 'Ά' },
  { id: 'tonos-epsilon-upper', text: 'Έ' },
  { id: 'tonos-eta-upper', text: 'Ή' },
  { id: 'tonos-iota-upper', text: 'Ί' },
  { id: 'tonos-omicron-upper', text: 'Ό' },
  { id: 'tonos-upsilon-upper', text: 'Ύ' },
  { id: 'tonos-omega-upper', text: 'Ώ' },
  // Dialytika, and the two precomposed dialytika+tonos vowels.
  { id: 'dialytika-iota-lower', text: 'ϊ' },
  { id: 'dialytika-upsilon-lower', text: 'ϋ' },
  { id: 'dialytika-tonos-iota-lower', text: 'ΐ' },
  { id: 'dialytika-tonos-upsilon-lower', text: 'ΰ' },
];

export const nameCases = [
  { id: 'name-alexandros', text: 'Αλέξανδρος' },
  { id: 'name-eleni', text: 'Ελένη' },
  { id: 'name-giorgos', text: 'Γιώργος' },
  { id: 'name-maria', text: 'Μαρία' },
  { id: 'name-nikolaos', text: 'Νικόλαος' },
  { id: 'name-dimitrios', text: 'Δημήτριος' },
  { id: 'name-konstantinos', text: 'Κωνσταντίνος' },
  { id: 'name-aikaterini', text: 'Αικατερίνη' },
  { id: 'name-panagiotis', text: 'Παναγιώτης' },
  { id: 'name-evangelia', text: 'Ευαγγελία' },
  { id: 'name-full', text: 'Αλέξανδρος Παπαδόπουλος' },
  { id: 'phrase-kalimera', text: 'Καλημέρα σας' },
  { id: 'phrase-efharisto', text: 'Ευχαριστώ πολύ' },
  { id: 'phrase-parakalo', text: 'Παρακαλώ, περιμένετε' },
  { id: 'field-address', text: 'Οδός Πανεπιστημίου 17' },
  { id: 'field-city', text: 'Αθήνα, Ελλάδα' },
];

export const mixedAndRepeatedCases = [
  { id: 'mixed-year', text: 'Αθήνα 2026' },
  { id: 'mixed-address-letter', text: 'Οδός 17Β' },
  { id: 'mixed-date', text: '27/08/2026' },
  { id: 'repeated-alpha-lower', text: 'ααα' },
  { id: 'repeated-sigma-lower', text: 'σσσ' },
  { id: 'repeated-lambda-lower', text: 'λλλ' },
  { id: 'repeated-epsilon-lower', text: 'εεε' },
  { id: 'repeated-alpha-upper', text: 'ΑΑΑ' },
  { id: 'repeated-epsilon-upper', text: 'ΕΕΕ' },
];

export const GREEK_CORPUS = [
  ...baseLetterCases,
  ...diacriticCases,
  ...nameCases,
  ...mixedAndRepeatedCases,
];
