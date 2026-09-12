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
 * **Scoped to the new candidate only, not every Greek-capable family.**
 * Unlike thai-font-parity.spec.js (which swept every THAI_CAPABLE_FONTS
 * entry because IBM Plex Sans Thai was screened alongside an existing
 * upright/handwriting pair that had already been through this method), this
 * file's job is screening FONT-08's new candidate - Arimo/Tinos/Cousine's
 * Greek advance behaviour had never been measured this way before this
 * ticket, and while building this guard, `'Νικόλαος Δημητρίου'` surfaced a
 * genuine ~1.77px (113 font-unit) disagreement between the browser and
 * fontkit's per-word-segmented shaping on **both** Arimo and Tinos - a
 * pre-existing gap in the three already-bundled upright faces, unrelated to
 * Mynerve (which shapes the identical string with 0.000px of disagreement -
 * see below). That is a real, first-time-observed finding worth its own
 * investigation, not something this ticket's guard should either silently
 * paper over by picking different sample text or block this candidate's
 * landing on. It is flagged separately (see FONT-08.md's 2026-09-12 entry)
 * rather than folded into `FAMILIES` below.
 *
 * Ten Greek names/words, mostly two-word - spaces matter here specifically,
 * per H9/hebrew-font-parity.spec.js's finding that Blink shapes text word by
 * word, so a `calt` rule whose context crosses a space boundary never fires
 * in the browser while a whole-line fontkit call could still fire it if the
 * export ever regressed to shaping a whole line at once.
 *
 * **Result: 10/10 passed for Mynerve, 0.000px disagreement on every case**
 * (measured 2026-09-12). A separate one-off spot-check (not wired as a
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
const FAMILIES = ['Mynerve'];

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
    .flatMap((run) => run.text.split(/( )/).filter((part) => part !== '').map((part) => ({ text: part, direction: run.direction })))
    .reduce((sum, segment) => {
      const { positions } = font.layout(segment.text, undefined, undefined, undefined, segment.direction);
      glyphCount += positions.length;
      return sum + positions.reduce((segSum, p) => segSum + p.xAdvance, 0);
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
