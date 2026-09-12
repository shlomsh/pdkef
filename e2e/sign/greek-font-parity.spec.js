import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { resolveBidiRuns } from '../../src/editor/text/bidiRuns.js';
import { requestedFontFile } from '../../src/editor/text/fonts.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const SIZE = 32;

/**
 * Greek font shaping parity (Guard A), added for FONT-08's screening of
 * Mynerve as a Greek handwriting candidate - mirrors thai-font-parity.spec.js
 * and hebrew-font-parity.spec.js, both written for the same reason: the pixel
 * guard (greek-shaping-guard.spec.js) is nearly blind to trailing-space
 * under/over-advancing (SIGN-20's finding on Bengali - a cluster can pass a
 * pixel diff while measurably under-advancing), so this checks the other
 * axis - does fontkit's shaped advance match this same browser's own
 * `measureText` on realistic Greek text.
 *
 * **Mynerve, Arimo and Tinos.** This guard was first scoped to Mynerve
 * alone: while it was being built, `'Νικόλαος Δημητρίου'` disagreed by 113
 * font units (~1.77px) between the browser and fontkit on both Arimo and
 * Tinos, with Mynerve at 0.000px, and that was flagged rather than folded
 * in. The cause turned out to be the export, not the fonts: a GPOS `kern`
 * pair on `space + Δ` (-113, the same value as `space + A/Α/Λ`) that the DOM
 * applies because it shapes a run whole, and that the export's per-space
 * split (H9) never reached. The split was reverted on 2026-09-12 (`6879e01`,
 * docs/wysiwyg-text-architecture.md §1.2 item 5), `shapedRun` below shapes
 * each run whole to mirror it, and with that the two upright faces agree
 * with the browser on this string, so they join `FAMILIES`. Cousine has no
 * kern table and was never affected; it stays out only because nothing here
 * has measured it, not because it failed.
 *
 * Ten Greek names/words, mostly two-word. Spaces are the point: the
 * space-spanning kern pairs above only fire when the run is shaped whole,
 * so a regression back to per-word shaping fails on Arimo and Tinos here,
 * and a `calt` handwriting face whose context crosses a space (Mynerve)
 * is measured the way the DOM lays it out.
 *
 * **Result: 10/10 passed for Mynerve, 0.000px disagreement on every case**
 * (measured 2026-09-12, per-segment at the time). Re-measured per run with
 * Arimo and Tinos added, 2026-09-12: **30/30 passed** on macOS at the
 * 0.05px subpixel tolerance. A separate one-off spot-check (not wired as a
 * standing assertion here, matching the Mukta/Devanagari screening
 * precedent) measured Mynerve against a Latin name, `'Sarah Levi'` -
 * fontkit 146.464px vs. browser 142.816px, a 3.648px / 2.5%-of-string-width
 * disagreement on 10 glyphs. This is the same *class* of divergence already
 * documented and accepted for Caveat (`.claude/rules/fonts-and-text.md`,
 * "Handwriting faces add kerning": Caveat disagrees by 5.1px on this same
 * string) - a `calt`/kerning handwriting face's Latin advances, not this
 * ticket's Greek screening target, and not blocking: Mynerve joins the
 * catalogue for Greek, where seven-plus other bundled faces already cover
 * Latin cleanly.
 *
 * Tolerance logic (unchanged from hebrew-font-parity.spec.js / SIGN-19):
 * exact agreement where the platform reports subpixel widths, and on a
 * hinting platform (integral `measureText`, seen on Linux CI) the bound is
 * half a pixel per glyph, the quantisation itself.
 */
const FAMILIES = ['Mynerve', 'Arimo', 'Tinos'];

const SAMPLES = {
  'name-alexandros-papadopoulos': { text: 'Αλέξανδρος Παπαδόπουλος' },
  'name-eleni-nikolaou': { text: 'Ελένη Νικολάου' },
  'name-maria-konstantinou': { text: 'Μαρία Κωνσταντίνου' },
  'name-nikolaos-dimitriou': { text: 'Νικόλαος Δημητρίου' },
  'name-panagiotis-ioannou': { text: 'Παναγιώτης Ιωάννου' },
  'phrase-kalimera': { text: 'Καλημέρα σας' },
  'phrase-efharisto': { text: 'Ευχαριστώ πολύ' },
  'field-address': { text: 'Οδός Πανεπιστημίου 17' },
  'field-city': { text: 'Αθήνα, Ελλάδα' },
  'name-single-word': { text: 'Κωνσταντίνος' },
};

const UNHINTED_TOLERANCE_PX = 0.05;
const HINTED_TOLERANCE_PX_PER_GLYPH = 0.5;

function shapedRun(family, { text }) {
  const file = join(FONT_DIR, requestedFontFile(family, 'normal', 'normal'));
  const font = fontkit.create(readFileSync(file));
  let glyphCount = 0;
  const total = resolveBidiRuns(text, 'ltr')
    // Each run shaped whole, spaces included - the export's segmentation since
    // the per-space split was reverted (2026-09-12, textPdf.ts). Measuring
    // per-word here would compare against something the export no longer
    // produces, and would hide the space-spanning kern pairs the DOM applies.
    .reduce((sum, run) => {
      const { positions } = font.layout(run.text, undefined, undefined, undefined, run.direction);
      glyphCount += positions.length;
      return sum + positions.reduce((runSum, p) => runSum + p.xAdvance, 0);
    }, 0);
  return { widthPx: (total / font.unitsPerEm) * SIZE, glyphCount };
}

test.describe('Greek font shaping parity (Guard A)', () => {
  for (const family of FAMILIES) {
    for (const [label, sample] of Object.entries(SAMPLES)) {
      test(`${family} (${label}): fontkit's shaped advance matches the browser's measureText`, async ({ page }) => {
        await page.goto('/sign');
        const browserWidth = await page.evaluate(async ({ family: familyName, text, size }) => {
          await document.fonts.load(`${size}px "${familyName}"`, text);
          await document.fonts.ready;
          if (!document.fonts.check(`${size}px "${familyName}"`)) {
            throw new Error(`${familyName} did not load; measurement would be against a fallback font`);
          }
          const ctx = document.createElement('canvas').getContext('2d');
          ctx.textRendering = 'geometricPrecision';
          ctx.font = `${size}px "${familyName}"`;
          return ctx.measureText(text).width;
        }, { family, text: sample.text, size: SIZE });

        const { widthPx: fontkitWidth, glyphCount } = shapedRun(family, sample);
        const hinted = Number.isInteger(browserWidth) && glyphCount > 1;
        const tolerancePx = hinted ? HINTED_TOLERANCE_PX_PER_GLYPH * glyphCount : UNHINTED_TOLERANCE_PX;
        expect(
          Math.abs(browserWidth - fontkitWidth),
          `${family} (${label}): browser measureText ${browserWidth.toFixed(3)}px vs fontkit shaped advance ${fontkitWidth.toFixed(3)}px `
            + `(${glyphCount} glyphs, ${hinted ? 'hinted platform' : 'subpixel platform'})`,
        ).toBeLessThanOrEqual(tolerancePx);
      });
    }
  }
});
