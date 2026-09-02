import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { HEBREW_CAPABLE_FONTS, requestedFontFile } from '../../src/editor/text/fonts.js';
import { resolveBidiRuns } from '../../src/editor/text/bidiRuns.js';
import { WYSIWYG_STRING_BY_ID } from '../../src/test/fixtures/wysiwygStrings.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const SIZE = 32;

// Three samples, with spaces deliberately included where H9 needs them.
const SAMPLES = {
  // Pointed Hebrew: the case the layer-5 shaping fix addressed.
  pointed: { text: WYSIWYG_STRING_BY_ID.H2.text, direction: 'rtl' },
  // Hebrew abutting digits: exercises the layer-2 run splitting, which the
  // old version of this guard did not reach at all.
  mixed: { text: 'רחוב17', direction: 'rtl' },
  // Two words with a space: exercises H9's per-segment shaping. This is the
  // case that failed before H9, and it is the one that regresses first if
  // anyone reverts to shaping a whole line in one call.
  spaced: { text: WYSIWYG_STRING_BY_ID.H1.text, direction: 'rtl' },
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
 * **Tolerance depends on whether the platform hints, and that is detected from
 * the measurement rather than assumed.** Chromium quantizes every glyph advance
 * to a whole pixel when font hinting is on, which is the default on the Linux CI
 * runner and not on macOS. Measured on CI: every `measureText` result was an
 * exact integer and the error accumulated per glyph, up to 2.416px on a 9-glyph
 * string, which no fixed percentage can absorb without going blind. Measured on
 * macOS: all seven fonts agree to 0.000px on all three samples.
 *
 * So: exact agreement is demanded where the browser reports subpixel widths, and
 * on a hinting platform the bound is the quantization itself, half a pixel per
 * glyph. Be honest about what that costs - on a hinted runner this only catches
 * gross divergence, and **mark placement is not covered on any platform** (see
 * above). H8 is the guard that actually proves shaping correctness; this one
 * proves advances and run order.
 */
const UNHINTED_TOLERANCE_PX = 0.05;
const HINTED_TOLERANCE_PX_PER_GLYPH = 0.5;


// Mirrors what text.ts's serialize actually does: resolve bidi runs, shape
// each run with its own direction, sum. The previous version called
// layout(sample) with no direction and no run splitting, so it stopped
// exercising the production path the moment layer 2 landed.
function shapedRun(family, { text, direction }) {
  const file = join(FONT_DIR, requestedFontFile(family, 'normal', 'normal'));
  const font = fontkit.create(readFileSync(file));
  let glyphCount = 0;
  const total = resolveBidiRuns(text, direction)
    // Same split the export does (text.ts's toShapingSegments): the browser
    // shapes word by word, so measuring a whole run here would compare
    // against something the export no longer produces.
    .flatMap((run) => run.text.split(/( )/).filter((part) => part !== '').map((part) => ({ text: part, direction: run.direction })))
    .reduce((sum, segment) => {
      const { positions } = font.layout(segment.text, undefined, undefined, undefined, segment.direction);
      glyphCount += positions.length;
      return sum + positions.reduce((segSum, p) => segSum + p.xAdvance, 0);
    }, 0);
  return { widthPx: (total / font.unitsPerEm) * SIZE, glyphCount };
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
          // Ask for unhinted metrics where the browser supports it. A PDF has
          // no hinting, so unhinted advances are the thing actually worth
          // comparing; where this is a no-op the tolerance below absorbs it.
          ctx.textRendering = 'geometricPrecision';
          ctx.font = `${size}px "${familyName}"`;
          return ctx.measureText(text).width;
        }, { family, text: sample.text, size: SIZE });

        const { widthPx: fontkitWidth, glyphCount } = shapedRun(family, sample);
        // An integral width across a multi-glyph string means the platform
        // quantized each advance; a subpixel one means it did not.
        const hinted = Number.isInteger(browserWidth) && glyphCount > 1;
        // No per-font exemptions. The one font that needed one was dropped
        // from the catalogue instead (Playpen Sans Hebrew, 2026-08-23) - see
        // RETIRED_FONTS in src/lib/fonts.js. If a font ever needs an exemption
        // here again, that is the signal to ask whether we should ship it.
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
