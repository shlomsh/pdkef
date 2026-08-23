import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { HEBREW_CAPABLE_FONTS } from '../../src/lib/fonts.js';
import { resolveBidiRuns } from '../../src/lib/bidiRuns.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const SIZE = 32;

// Two samples, both deliberately free of spaces - see the H9 note below.
const SAMPLES = {
  // Pointed Hebrew: the case the layer-5 shaping fix addressed.
  pointed: { text: 'שָׁלוֹם', direction: 'rtl' },
  // Hebrew abutting digits: exercises the layer-2 run splitting, which the
  // old version of this guard did not reach at all.
  mixed: { text: 'רחוב17', direction: 'rtl' },
  // Two words with a space: exercises H9's per-segment shaping. This is the
  // case that failed before H9, and it is the one that regresses first if
  // anyone reverts to shaping a whole line in one call.
  spaced: { text: 'שלום עולם', direction: 'rtl' },
};

/**
 * Guard A (docs/hebrew-text-shaping-export.md): the export shapes with fontkit,
 * the editor preview shapes with the browser's own engine, and the two must
 * agree or a font can look right on screen and export wrong.
 *
 * **What this guard cannot see, so nobody reads more into a green run than is
 * there:** every Hebrew combining mark has `xAdvance` 0 in all seven fonts, so
 * a misplaced mark contributes exactly nothing to either side of this
 * comparison. This check can pass at 0.0% with every mark in the string in the
 * wrong place, which is the state the catalogue was actually in while this
 * guard was green. Mark placement is H8's job (order-insensitivity plus
 * containment); this one guards advances and run order only.
 *
 * **Samples include spaces, and that is the point since H9 landed.** Blink
 * shapes and caches text word by word, so a font feature whose context crosses
 * a space never fires in the browser while a whole-line fontkit call fires it
 * - measured, `Tel Aviv` in Arimo differed by 113 font units for exactly that
 * reason. `shapedAdvancePx` below mirrors the export's per-segment shaping, so
 * a regression that goes back to shaping whole lines fails here.
 *
 * Tolerance is per font. Playpen Sans Hebrew is the known outlier and is
 * pending the H10 drop-or-demote decision; it agrees on these single-word
 * samples and disagrees on 22 of 25 realistic strings.
 */
const TOLERANCE_PCT = {
  'Playpen Sans Hebrew': 0.8,
};
const DEFAULT_TOLERANCE_PCT = 0.05;

// Mirrors what text.ts's serialize actually does: resolve bidi runs, shape
// each run with its own direction, sum. The previous version called
// layout(sample) with no direction and no run splitting, so it stopped
// exercising the production path the moment layer 2 landed.
function shapedAdvancePx(family, { text, direction }) {
  const file = join(FONT_DIR, `${family.replace(/\s+/g, '')}-Regular.ttf`);
  const font = fontkit.create(readFileSync(file));
  const total = resolveBidiRuns(text, direction)
    // Same split the export does (text.ts's toShapingSegments): the browser
    // shapes word by word, so measuring a whole run here would compare
    // against something the export no longer produces.
    .flatMap((run) => run.text.split(/( )/).filter((part) => part !== '').map((part) => ({ text: part, direction: run.direction })))
    .reduce((sum, segment) => {
      const { positions } = font.layout(segment.text, undefined, undefined, undefined, segment.direction);
      return sum + positions.reduce((segSum, p) => segSum + p.xAdvance, 0);
    }, 0);
  return (total / font.unitsPerEm) * SIZE;
}

test.describe('Hebrew font shaping parity (Guard A)', () => {
  for (const family of HEBREW_CAPABLE_FONTS) {
    for (const [label, sample] of Object.entries(SAMPLES)) {
      test(`${family} (${label}): fontkit's shaped advance matches the browser's measureText`, async ({ page }) => {
        // Any page carries the @font-face declarations (they live in the global
        // stylesheet, not a per-tool one) - /sign just also exercises the tool
        // that actually renders these families.
        await page.goto('/sign');
        const browserWidth = await page.evaluate(async ({ family: familyName, text, size }) => {
          await document.fonts.load(`${size}px "${familyName}"`, text);
          await document.fonts.ready;
          // Assert the face actually loaded. Without this the canvas silently
          // falls back to a system font and every family measures the same,
          // which is a clean-looking, meaningless pass.
          if (!document.fonts.check(`${size}px "${familyName}"`)) {
            throw new Error(`${familyName} did not load; measurement would be against a fallback font`);
          }
          const ctx = document.createElement('canvas').getContext('2d');
          ctx.font = `${size}px "${familyName}"`;
          return ctx.measureText(text).width;
        }, { family, text: sample.text, size: SIZE });

        const fontkitWidth = shapedAdvancePx(family, sample);
        const tolerancePct = TOLERANCE_PCT[family] ?? DEFAULT_TOLERANCE_PCT;
        const deviationPct = Math.abs(browserWidth - fontkitWidth) / fontkitWidth * 100;
        expect(
          deviationPct,
          `${family} (${label}): browser measureText ${browserWidth.toFixed(3)}px vs fontkit shaped advance ${fontkitWidth.toFixed(3)}px`,
        ).toBeLessThanOrEqual(tolerancePct);
      });
    }
  }
});
