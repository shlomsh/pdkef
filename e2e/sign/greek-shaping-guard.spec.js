import { test, expect } from '@playwright/test';
import { GREEK_CORPUS } from './fixtures/greekCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Greek correctness guard, screening FONT-08's Greek-handwriting candidate(s)
 * (docs/font-candidate-research-brief.md, "Greek handwriting gap"). Greek had
 * no shaping guard before this: its three bundled faces (Arimo, Tinos,
 * Cousine) carry no `calt`/`liga` table, so fontkit (export) and the
 * browser's own shaper (editor) had no mechanism by which to disagree on a
 * letterform, and no guard was needed to prove it. Both candidates found for
 * the handwriting gap - Mynerve and Mansalva - carry `calt`
 * (.claude/rules/fonts-and-text.md's "Screening a candidate" checklist, item
 * 2), the same OpenType feature category that got Playpen Sans Hebrew
 * dropped from the catalogue for an 88% systemic shaping disagreement, so
 * this guard exists to test rather than pre-judge either one.
 *
 * Method, geometry and self-calibration are unchanged from
 * latin-shaping-guard.spec.js, the other `calt`-handwriting guard in this
 * directory: shape each corpus string with fontkit's `layout()` and compare
 * the glyph id sequence against a plain per-codepoint cmap lookup
 * (`autoCalibrate: true` in shapingGuardHarness.js). Strings that shape
 * identically to a plain lookup become the calibration set (zero shaping
 * ambiguity by construction); strings where fontkit made an actual glyph
 * choice become the cases under test, since those are the only ones where
 * the browser could possibly have chosen differently. See greekCorpus.js's
 * module doc for why the corpus is realistic names/words/repeated-letters
 * rather than an exhaustive alphabet sweep.
 *
 * 400px / 4x geometry, matching every other guard's corrected size (clears
 * Skia's ~256px bitmap-glyph limit - see shapingGuardHarness.js's "Two
 * artefacts" note). Results are recorded per candidate below as each is
 * measured; a face not listed in `FACES` was not screened via this guard.
 */

const GEOMETRY = {
  direction: 'ltr',
  size: 400,
  // Wide enough for the longest case ('Αλέξανδρος Παπαδόπουλος', the full-name
  // case) at 400px - several of the corpus's multi-word phrases overflowed
  // narrower canvases tried while building this guard (2200px, then 4400px).
  canvasWidth: 6600,
  canvasHeight: 800,
  anchorX: 80,
  baselineY: 480,
};

// Absolute floor under the 1.5x noise-floor multiplier - matches the other
// autoCalibrate handwriting guard (latin-shaping-guard.spec.js) rather than
// inventing a new number.
const MIN_TOLERANCE_PCT = 3;

/**
 * Candidates screened here. Only fonts actually present in public/fonts/ may
 * be listed - see the module doc above and FONT-08.md's "2026-09-12: Greek
 * handwriting" section for which candidate(s) were tried and the result.
 */
const FACES = [
  { candidateName: 'Mynerve', fontFileName: 'Mynerve-Regular.ttf' },
];

for (const { candidateName, fontFileName } of FACES) {
  createShapingGuardTest({
    scriptName: 'Greek',
    candidateName,
    fontFileName,
    corpus: GREEK_CORPUS,
    autoCalibrate: true,
    minTolerancePct: MIN_TOLERANCE_PCT,
    bundleFilename: `__e2e-greek-${candidateName.toLowerCase()}-fontkit-bundle.js`,
    ...GEOMETRY,
    test,
    expect,
  });
}
