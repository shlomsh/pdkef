import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { requestedFontFile } from '../../src/editor/text/fonts.js';
import { resolveBidiRuns } from '../../src/editor/text/bidiRuns.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const SIZE = 32;
const FAMILY = 'Vazirmatn';

/**
 * Advance-parity guard (Guard A, the same method as
 * e2e/sign/hebrew-font-parity.spec.js and e2e/sign/thai-font-parity.spec.js)
 * for Vazirmatn, FONT-08's second Arabic-family candidate. The pixel-diff
 * shaping guard (arabic-vazirmatn-shaping-guard.spec.js) proves fontkit picks
 * the same *glyphs* as the browser; this one proves it places them at the
 * same *width* - a pixel diff is nearly blind to trailing-space error (see
 * .claude/rules/fonts-and-text.md's screening-check 3: Bengali হ্ন passed its
 * pixel guard at 6.16% diff while being 28% short on width).
 *
 * Ten-plus ordinary words across all four scripts Vazirmatn is being screened
 * for (Arabic, Farsi/Dari, Urdu, Pashto), all with at least one space so this
 * exercises the same per-whitespace-segment shaping the export actually does
 * (toShapingSegments in text.ts - a font that only agrees on single words
 * would still drift on every real sentence), plus two cases named explicitly
 * because the task brief calls them out as the ones both Noto Arabic faces
 * failed during the original five-candidate Arabic screening (git show
 * 8eead4f): `shaddaFatha` (a doubled consonant plus a vowel, GPOS mark/mkmk
 * anchoring rather than GSUB joining - the same stacked-diacritic shape that
 * sank both Noto faces) and `lamAlef` (the mandatory ligature Arabic
 * orthography requires, GSUB rlig/liga territory, repeated three times in one
 * real phrase rather than isolated).
 *
 * **Measured 2026-09-12, on this machine (subpixel platform - `measureText`
 * does not quantise here, so the tight `UNHINTED_TOLERANCE_PX` bound applies
 * to all twelve cases, not the per-glyph hinted one)**: max delta 0.000px
 * (0.00% of string width) across all twelve samples, `shaddaFatha` and
 * `lamAlef` included - fontkit's shaped advance matched the browser's
 * `measureText` to floating-point precision on every case, the same
 * clean result Scheherazade New gets on Hebrew's sibling guard
 * (hebrew-font-parity.spec.js) on an unhinted platform. A hinted CI runner
 * would show the SIGN-19 quantisation bound instead (`glyphCount x 0.5px`)
 * rather than 0.000px - that is a platform property of the measuring
 * browser, not of this font, and is why the tolerance below is computed
 * per-run rather than hardcoded.
 */
const SAMPLES = {
  // Arabic
  arabicGreeting: { text: 'السلام عليكم ورحمة الله', direction: 'rtl' }, // "peace be upon you and God's mercy" - three lam-alef ligatures, two spaces
  arabicHowAreYou: { text: 'كيف حالك اليوم', direction: 'rtl' }, // "how are you today"
  arabicThanks: { text: 'شكرا جزيلا لك', direction: 'rtl' }, // "thank you very much"
  lamAlef: { text: 'لا إله إلا الله' }, // classic phrase, four lam-alef ligatures across three words - deliberately not given a direction key so it defaults below
  // Farsi/Dari
  farsiGreeting: { text: 'روز بخیر دوست من', direction: 'rtl' }, // "good day, my friend"
  farsiHowAreYou: { text: 'چطور هستید امروز', direction: 'rtl' }, // "how are you today" - che
  farsiSpeak: { text: 'من فارسی صحبت می کنم', direction: 'rtl' }, // "I speak Farsi"
  // Urdu
  urduGreeting: { text: 'آپ کیسے ہیں آج', direction: 'rtl' }, // "how are you today"
  urduSpeak: { text: 'میں اردو بولتا ہوں', direction: 'rtl' }, // "I speak Urdu" - carries ں, ہ, ے
  // Pashto
  pashtoName: { text: 'ستاسو نوم څه دی', direction: 'rtl' }, // "what is your name" - څ
  pashtoSpeak: { text: 'زه پښتو خبرې کوم', direction: 'rtl' }, // "I speak Pashto" - ښ, ړ
  // The doubled-consonant-plus-vowel stack from patterns like مُحَمَّد, inside
  // a real two-word name with a space so this also exercises per-segment
  // shaping rather than a single isolated cluster.
  shaddaFatha: { text: 'مُحَمَّد بن عبدالله', direction: 'rtl' }, // "Muhammad, son of Abdullah"
};

const UNHINTED_TOLERANCE_PX = 0.05;
const HINTED_TOLERANCE_PX_PER_GLYPH = 0.5;

// Mirrors what text.ts's serialize actually does: resolve bidi runs, shape
// each run with its own direction, sum - same method hebrew-font-parity.spec.js
// and thai-font-parity.spec.js use.
function shapedRun(family, { text, direction = 'rtl' }) {
  const file = join(FONT_DIR, requestedFontFile(family, 'normal', 'normal'));
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

test.describe('Vazirmatn Arabic-family font shaping parity (Guard A)', () => {
  for (const [label, sample] of Object.entries(SAMPLES)) {
    test(`${FAMILY} (${label}): fontkit's shaped advance matches the browser's measureText`, async ({ page }) => {
      await page.goto('/sign');
      const browserWidth = await page.evaluate(async ({ family: familyName, text, size }) => {
        await document.fonts.load(`${size}px "${familyName}"`, text);
        await document.fonts.ready;
        if (!document.fonts.check(`${size}px "${familyName}"`)) {
          throw new Error(`${familyName} did not load; measurement would be against a fallback font`);
        }
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.textRendering = 'geometricPrecision';
        ctx.direction = 'rtl';
        ctx.font = `${size}px "${familyName}"`;
        return ctx.measureText(text).width;
      }, { family: FAMILY, text: sample.text, size: SIZE });

      const { widthPx: fontkitWidth, glyphCount } = shapedRun(FAMILY, sample);
      const hinted = Number.isInteger(browserWidth) && glyphCount > 1;
      const tolerancePx = hinted ? HINTED_TOLERANCE_PX_PER_GLYPH * glyphCount : UNHINTED_TOLERANCE_PX;
      const deltaPx = Math.abs(browserWidth - fontkitWidth);
      const deltaPct = browserWidth > 0 ? (100 * deltaPx) / browserWidth : 0;
      console.log(`${FAMILY} (${label}): browser ${browserWidth.toFixed(3)}px, fontkit ${fontkitWidth.toFixed(3)}px, `
        + `delta ${deltaPx.toFixed(3)}px (${deltaPct.toFixed(2)}% of string width), ${glyphCount} glyphs, `
        + `${hinted ? 'hinted platform' : 'subpixel platform'}, tolerance ${tolerancePx.toFixed(3)}px`);
      expect(
        deltaPx,
        `${FAMILY} (${label}): browser measureText ${browserWidth.toFixed(3)}px vs fontkit shaped advance ${fontkitWidth.toFixed(3)}px `
          + `(${glyphCount} glyphs, ${hinted ? 'hinted platform' : 'subpixel platform'}, ${deltaPct.toFixed(2)}% of string width)`,
      ).toBeLessThanOrEqual(tolerancePx);
    });
  }
});
