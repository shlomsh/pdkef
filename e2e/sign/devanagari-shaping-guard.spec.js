import { test, expect } from '@playwright/test';
import { CONSONANTS, DEVANAGARI_CORPUS } from './fixtures/devanagariCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Devanagari correctness guard for the Kalam catalogue candidate
 * (TODO.md, "Internationalization: fonts for scripts beyond Hebrew/Latin",
 * the Devanagari entry). Not a port of Hebrew's Tier 1/2/3 guards - Devanagari's
 * correctness question is glyph *selection* and *visual order* (reordering,
 * ligation), not mark position given shaping order was already right, so this
 * guard checks a different thing: does fontkit's shaped output for each
 * corpus string pixel-match this browser's own native rendering of the
 * identical string in the identical font? The shared mechanics (bundling,
 * canvas reconstruction, pixel-diff, pass/fail reporting) live in
 * `./fixtures/shapingGuardHarness.js`; this file supplies only what's
 * Devanagari-specific: the corpus, the calibration set, and the geometry.
 *
 * Devanagari is Bidi_Class L (left-to-right internally, unlike Hebrew/Arabic),
 * so this guard anchors at a fixed left pen position with no RTL handling.
 *
 * **Why the calibration set is consonants alone AND consonant+vowel-sign
 * pairs, not just the bare alphabet.** A single calibration glyph is the
 * wrong unit for a noise floor (see the harness's module doc) - this guard's
 * own history proves it twice over. The first version calibrated from one
 * bare consonant (KA); that broke in CI because a single glyph's antialiasing
 * noise is itself highly platform-dependent. The second calibrated from the
 * max over EVERY bare consonant, which fixed the platform-dependence and
 * still failed in CI, because bare consonants are structurally the wrong
 * shape of noise: they are always exactly one glyph, so they can never
 * capture the noise a *second*, smaller glyph introduces. Measured directly:
 * the six real failures at that point were all two-glyph renders whose
 * second glyph is a comparatively small mark (the split ो/ौ matras), sitting
 * at a stable ~3-3.7% on both macOS and CI Linux Chromium - unlike
 * single-glyph noise, this one does not move much with platform, but no
 * single-glyph probe can ever land inside it, because the pixel-diff
 * denominator is the ink two glyphs share, and a thin second glyph makes any
 * absolute positioning noise a much larger fraction of that denominator than
 * the same absolute noise on one bulky glyph is. The fix calibrates against
 * that same *shape* of composition: every consonant plus the plain post-base
 * AA vowel sign ('ा', U+093E) - two glyphs, a comparatively small second
 * one, exactly like the real failures - but with no shaping ambiguity at all
 * (AA never reorders, never triggers a conjunct), so using it to calibrate is
 * not circular with anything this guard actually judges.
 *
 * **A sharp edge worth knowing before trusting a green run.** Calibration and
 * the corpus cases both go through the harness's shared `shape`/
 * `drawReconstruction`, so a sabotage of those shared functions themselves
 * (as opposed to a defect in fontkit's own shaping) inflates the floor and
 * the cases together and can mask itself - reversing the reconstruction's
 * glyph draw order this way still passed at 0 failing, floor 61.91%. To
 * prove this guard can fail, corrupt only the corpus-side shaping (not a
 * function calibration also calls) - that reproduces 131/185 failing with
 * the floor unchanged. **Result at last run: 185/185 passed, 0 failing**,
 * noise floor 6.79%, tolerance 10.18%, worst real case 8.28%
 * (`RA+virama+थ`) - comfortably inside tolerance with real margin, not
 * sitting on the edge.
 */

const CALIBRATION_VOWEL_SIGN = 'ा'; // plain post-base AA - not pre-base, not tested by the corpus itself
const CALIBRATION_SET = [
  ...CONSONANTS,
  ...CONSONANTS.map((consonant) => consonant + CALIBRATION_VOWEL_SIGN),
];

createShapingGuardTest({
  scriptName: 'Devanagari',
  candidateName: 'Kalam',
  fontFileName: 'Kalam-Regular.ttf',
  direction: 'ltr',
  size: 100,
  canvasWidth: 500,
  canvasHeight: 200,
  anchorX: 20,
  baselineY: 120,
  corpus: DEVANAGARI_CORPUS,
  calibrationSet: CALIBRATION_SET,
  // Ceiling actually observed across two real CI runs of the six failing
  // cases pre-fix (3.04-3.69%), kept as a second, independent margin below
  // the calibration fix above even though the fix should already clear it -
  // the calibration targets the mechanism reasoned from local measurements,
  // but CI's own two-glyph noise was only predicted from it, not directly
  // observed at the time this floor was set.
  minTolerancePct: 4,
  test,
  expect,
});
