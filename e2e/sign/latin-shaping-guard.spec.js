import { test, expect } from '@playwright/test';
import { LATIN_CORPUS } from './fixtures/latinNameCorpus.js';
import { createShapingGuardTest } from './fixtures/shapingGuardHarness.js';

/**
 * Latin guard for the bundled handwriting faces that choose glyphs by context
 * (`calt`, `liga`, kerning that crosses a space): Pacifico, Great Vibes,
 * Dancing Script, Caveat and Sriracha. These are the faces a person signs
 * their name in, and the only Latin ones where the two shapers decide
 * anything; the rest of the catalogue draws plain cmap glyphs.
 *
 * Bar, per the 2026-08-27 decision on W9: no wrong letterforms, no missing
 * text. Self-calibrating (`autoCalibrate` in shapingGuardHarness.js): corpus
 * strings fontkit draws without a substitution measure the noise floor, the
 * rest are judged. Calibrating on single letters was tried first and passed
 * everything, because one thin letter is nearly all edge.
 *
 * Rendered at 300px, above Skia's bitmap-glyph limit, so the floor is under
 * 0.02% on macOS and the 3% minimum is the tolerance. At the old 60px the
 * floors were 10% to 41% and Caveat could not be judged at all.
 */

const GEOMETRY = {
  direction: 'ltr',
  size: 300,
  canvasWidth: 4200,
  canvasHeight: 800,
  anchorX: 100,
  baselineY: 500,
};

// Each face's own noise floor (see the module doc) sets its tolerance; this
// is only the absolute floor under the 1.5x multiplier, same role it plays
// in every other guard in this directory.
const MIN_TOLERANCE_PCT = 3;

const FACES = [
  { candidateName: 'Pacifico', fontFileName: 'Pacifico-Regular.ttf' },
  { candidateName: 'GreatVibes', fontFileName: 'GreatVibes-Regular.ttf' },
  { candidateName: 'Caveat', fontFileName: 'Caveat-Regular.ttf' },
  { candidateName: 'Sriracha', fontFileName: 'Sriracha-Regular.ttf' },
  { candidateName: 'DancingScript', fontFileName: 'DancingScript-Regular.ttf' },
];

for (const { candidateName, fontFileName } of FACES) {
  createShapingGuardTest({
    scriptName: 'Latin',
    candidateName,
    fontFileName,
    corpus: LATIN_CORPUS,
    autoCalibrate: true,
    minTolerancePct: MIN_TOLERANCE_PCT,
    // Five guards under one scriptName ("Latin") would otherwise collide on
    // the same bundle file - see shapingGuardHarness.js's bundleFilename doc.
    bundleFilename: `__e2e-latin-${candidateName.toLowerCase()}-fontkit-bundle.js`,
    ...GEOMETRY,
    test,
    expect,
  });
}
