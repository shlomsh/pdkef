import { test, expect } from '@playwright/test';
import { MALAYALAM_CORPUS } from './fixtures/malayalamCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Malayalam correctness guard for Gayathri (FONT-08 - the catalogue's second
 * upright/text-style Malayalam face, added alongside the existing Anek
 * Malayalam). Reuses the exact corpus, autoCalibrate reasoning and geometry
 * as malayalam-shaping-guard.spec.js (the Anek Malayalam guard) - see that
 * file's module doc for the full derivation of Malayalam's shaping axes
 * (sourced from the Unicode 17.0 chart and r12a's script notes) and for why
 * this is a self-calibrating PIXEL guard, never the CJK advance-parity-only
 * model. This file only supplies a different candidate font; the method,
 * corpus and tolerance discipline are identical, per
 * shapingGuardHarness.js's shared machinery.
 *
 * A separate spec file (not a second call to createShapingGuardTest for the
 * same scriptName in one file) because these run against two different font
 * files - matches the precedent in devanagari-mukta-shaping-guard.spec.js,
 * which does the same thing for Devanagari's second face.
 *
 * **Screening record** (docs/font-candidate-research-brief.md's "Malayalam
 * (second choice next to Anek Malayalam)" section): Gayathri (Swathanthra
 * Malayalam Computing, OFL 1.1). Static Regular/Bold, 159-160KB each.
 * Coverage full Malayalam block (minus the two scholarly-use-only reserved
 * consonants, same exclusion Anek Malayalam and malayalamCorpus.js itself
 * make) plus Latin ASCII and digits. Features `kern` only - no `calt`, so no
 * elevated shaping-disagreement risk flagged going in. Check 1 (fontkit
 * crash): **0/478** on this file's own generated corpus, verified on both
 * the Regular and Bold instances. `glyf`: aligned as shipped, no repad
 * needed (verified by `npm run test:fonts`).
 *
 * **Self-calibrating, not a fixed calibration set** - same reasoning, and
 * the same corpus, as the Anek Malayalam guard: this project has no in-house
 * Malayalam shaping reference to hand-classify "which cases have no shaping
 * ambiguity", so `autoCalibrate` partitions the corpus by fontkit's own
 * judgment (strings it shapes identically to a plain per-codepoint cmap
 * lookup become the calibration set; strings it applies any contextual
 * substitution to become the cases under test).
 *
 * **Geometry: 400px**, matching Anek Malayalam's guard and the current
 * Bengali/Devanagari standard - above Skia's ~256px bitmap-glyph cache
 * limit, so both sides rasterise through paths instead of disagreeing along
 * antialiased bitmap edges. See shapingGuardHarness.js's "Two artefacts"
 * note.
 *
 * **Advance-parity spot check** (SIGN-19/SIGN-20-style, run once while
 * screening this candidate, not wired as a standing assertion here): for
 * every one of the 478 corpus strings, fontkit's summed shaped glyph
 * advances (this guard's `reconWidth`) were compared against this same
 * browser's `measureText` on the identical string (`nativeWidth`) at the
 * guard's own 400px geometry. **0/478 divergent against the SIGN-19 bound
 * (`glyphCount x 0.5px`), max widthDiff 0.000px** - this platform does not
 * quantise advances (`quantizesAdvances: false`, matching the Anek Malayalam
 * guard's own measurement), so the bound has no rounding slack to spend and
 * still clears with zero margin used.
 *
 * **Result at last run: 277/277 passed.** Of the corpus's 478 strings, 201
 * shape with no contextual substitution (calibration set: rasteriser floor
 * 0.00%, displacement floor 0.00%) and 277 substitute and are the cases
 * under test, all passing at the 4% tolerance floor with zero
 * KNOWN_FONTKIT_DIVERGENCES entries needed - a cleaner split than Anek
 * Malayalam's own 233/245 on the identical corpus (Gayathri's shaper applies
 * a contextual substitution to more strings, not fewer glyphs matching), and
 * like Anek Malayalam, no narrow isolated divergence to name.
 */

const GEOMETRY = {
  direction: 'ltr',
  size: 400,
  canvasWidth: 2000,
  canvasHeight: 800,
  anchorX: 80,
  baselineY: 480,
};

createShapingGuardTest({
  scriptName: 'Malayalam',
  candidateName: 'Gayathri',
  fontFileName: 'Gayathri-Regular.ttf',
  corpus: MALAYALAM_CORPUS,
  autoCalibrate: true,
  minTolerancePct: 4,
  ...GEOMETRY,
  // Two guards under scriptName "Malayalam" (this one and Anek Malayalam's)
  // would otherwise collide on the same bundle file - see
  // shapingGuardHarness.js's bundleFilename doc.
  bundleFilename: '__e2e-malayalam-gayathri-fontkit-bundle.js',
  test,
  expect,
});
