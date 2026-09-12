import { test, expect } from '@playwright/test';
import { ARABIC_CORPUS, PASHTO_CORPUS, DUAL_JOINING_LETTERS, NON_JOINING_LETTERS } from './fixtures/arabicCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Arabic/Pashto correctness guard for Vazirmatn, FONT-08's second Arabic-family
 * candidate (backlog/tasks/FONT-08.md, docs/font-candidate-research-brief.md's
 * "second choice, Arabic family" entry - Vazirmatn was that entry's top pick
 * for "a modern-feel second choice"). Scheherazade New (arabic-shaping-guard.spec.js)
 * is a traditional Naskh face; Vazirmatn is an upright geometric/humanist sans,
 * the sharpest stylistic contrast available, screened here as a second option
 * rather than a replacement - see RETIRED_FONTS in
 * src/editor/text/fontManifest.js for what "replacement" looks like when a
 * font is actually dropped, which this is not.
 *
 * **This is the documented risk class.** Vazirmatn carries `calt` and `ss01`
 * (plus liga/rlig/kern/mark/mkmk), the same feature class that sank Playpen
 * Sans Hebrew (88% systemic disagreement, .claude/rules/fonts-and-text.md).
 * A `calt` face is not an instant disqualifier - IBM Plex Sans Thai carries
 * `calt` and passed its own guard cleanly (e2e/sign/thai-font-parity.spec.js)
 * - so this guard is what decides, not the feature list. Amiri, the other
 * Arabic-family runner-up, was set aside as too calligraphic even though it
 * passed its guard (git show 8eead4f); Vazirmatn's whole pitch is the opposite
 * problem does not apply here, since it is not calligraphic at all.
 *
 * **Reused, not re-derived, from arabic-shaping-guard.spec.js**: the RTL
 * anchoring rationale, the "calibrate from the alphabet's own isolated forms,
 * not one glyph" discipline, and the 320px/2400x800 geometry that clears
 * Skia's ~256px bitmap-glyph limit (see shapingGuardHarness.js's "Two
 * artefacts" note) all apply identically here - this is the same corpus
 * (ARABIC_CORPUS, PASHTO_CORPUS) shaped through a different font, not a new
 * method. Only the font file, candidate name and bundle filename differ from
 * the Scheherazade New guard; `bundleFilename` is set explicitly on both
 * calls below because two guards would otherwise both derive
 * `__e2e-arabic-fontkit-bundle.js` / `__e2e-pashto-fontkit-bundle.js` from
 * `scriptName` and race on the same file (shapingGuardHarness.js's own
 * warning on this).
 *
 * **Measured 2026-09-12** (see the numbers `createShapingGuardTest` itself
 * logs and asserts): Arabic 155/155 passing, calibration (rasteriser) floor
 * 0.00%, advance-quantisation floor 0.00% (this machine's `measureText` does
 * not quantise), noise floor 0.00%, tolerance 3.00% (the declared minimum -
 * Vazirmatn's own zero-shaping ink disagrees with the browser less than the
 * floor multiplier's minimum, same as Scheherazade New's own re-geometried
 * result). Pashto 22/22 passing at the same tolerance. Sabotage control
 * (shaping every character in isolation via a one-off throwaway measurement,
 * i.e. no joining at all) fails 123/155 Arabic cases and 11/22 Pashto cases
 * against this same 3% tolerance - confirms the guard has real detection
 * power on this font's letterforms, not just on Scheherazade New's.
 */

const ALPHABET = [...DUAL_JOINING_LETTERS, ...NON_JOINING_LETTERS];

/**
 * Identical to arabic-shaping-guard.spec.js's GEOMETRY - see that file's
 * module doc for why 320px and this canvas size are load-bearing rather than
 * a size picked for legibility. Kept as its own copy (not imported) so a
 * future change to one guard's geometry does not silently retune the other.
 */
const GEOMETRY = {
  size: 320,
  canvasWidth: 2400,
  canvasHeight: 800,
  anchorX: 2280,
  baselineY: 520,
};

createShapingGuardTest({
  scriptName: 'Arabic',
  candidateName: 'Vazirmatn',
  fontFileName: 'Vazirmatn-Regular.ttf',
  direction: 'rtl',
  ...GEOMETRY,
  corpus: ARABIC_CORPUS,
  calibrationSet: ALPHABET,
  minTolerancePct: 3,
  bundleFilename: '__e2e-arabic-vazirmatn-fontkit-bundle.js',
  test,
  expect,
});

/**
 * Pashto's eleven letters (see PASHTO_CORPUS's doc comment in
 * ./fixtures/arabicCorpus.js), screened against Vazirmatn the same way the
 * Scheherazade New guard screens them - own bundleFilename for the same
 * race-avoidance reason as that guard's own comment explains.
 */
createShapingGuardTest({
  scriptName: 'Pashto',
  candidateName: 'Vazirmatn',
  fontFileName: 'Vazirmatn-Regular.ttf',
  direction: 'rtl',
  ...GEOMETRY,
  corpus: PASHTO_CORPUS,
  calibrationSet: ALPHABET,
  minTolerancePct: 3,
  bundleFilename: '__e2e-pashto-vazirmatn-fontkit-bundle.js',
  test,
  expect,
});
