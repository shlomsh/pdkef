import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { LANGUAGE_COVERAGE } from '../../src/lib/fontCoverageReport.js';
import { resolveBidiRuns } from '../../src/editor/text/bidiRuns.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const SIZE = 32;

const THAI_CAPABLE_FONTS = LANGUAGE_COVERAGE.thai.full.map((f) => f.family);

const SAMPLES = {
  greeting: { text: 'สวัสดี', direction: 'ltr' },
  mixed: { text: 'บ้านเลขที่๑๗', direction: 'ltr' },
  spaced: { text: 'สวัสดี ครับ', direction: 'ltr' },
  // Tall-ascender consonants (ป ฝ ฟ) followed by a tone mark - the classic
  // Thai font case where a `calt` rule repositions/substitutes the tone-mark
  // glyph to avoid colliding with the consonant's ascender. IBM Plex Sans
  // Thai carries `calt` (flagged during screening - the exact feature that
  // sank Playpen Sans Hebrew), so this specifically stress-tests whether that
  // feature agrees between fontkit and the browser rather than trusting a
  // plain-word sample to have exercised it.
  tallConsonantTone: { text: 'ปั๊กฝ้ายให้ฟังกิ๊บ', direction: 'ltr' },
};

const UNHINTED_TOLERANCE_PX = 0.05;
const HINTED_TOLERANCE_PX_PER_GLYPH = 0.5;

function shapedRun(family, { text, direction }) {
  const file = join(FONT_DIR, `${family.replace(/\s+/g, '')}-Regular.ttf`);
  const font = fontkit.create(readFileSync(file));
  let glyphCount = 0;
  const total = resolveBidiRuns(text, direction)
    .flatMap((run) => run.text.split(/( )/).filter((part) => part !== '').map((part) => ({ text: part, direction: run.direction })))
    .reduce((sum, segment) => {
      const { positions } = font.layout(segment.text, undefined, undefined, undefined, segment.direction);
      glyphCount += positions.length;
      return sum + positions.reduce((segSum, p) => segSum + p.xAdvance, 0);
    }, 0);
  return { widthPx: (total / font.unitsPerEm) * SIZE, glyphCount };
}

test.describe('Thai font shaping parity (Guard A)', () => {
  for (const family of THAI_CAPABLE_FONTS) {
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
