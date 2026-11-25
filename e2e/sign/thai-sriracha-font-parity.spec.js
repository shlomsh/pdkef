import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';
import { resolveBidiRuns } from '../../src/editor/text/bidiRuns.js';
import { requestedFontFile } from '../../src/editor/text/fonts.js';

/**
 * Guard A (fontkit-vs-browser advance parity) for Sriracha, Thai's second
 * handwriting face next to Mali (FONT-08b; screening record in
 * backlog/tasks/FONT-08.md, "2026-09-12: Sriracha"). Every sample shapes as a
 * whole run, the way the export does, so kerning across a space counts:
 * "Sarah Levi" was 1.024px off until FONT-10. Mark placement, which no
 * advance can see, is thai-shaping-guard.spec.js.
 */

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const SIZE = 32;
const FAMILY = 'Sriracha';

const SAMPLES = {
  latinName: { text: 'Sarah Levi', direction: 'ltr' },
  // Same four samples thai-font-parity.spec.js runs for Mali and IBM Plex
  // Sans Thai (and, automatically, now Sriracha itself) - kept here too so
  // this file's own report stays self-contained and readable on its own.
  greeting: { text: 'สวัสดี', direction: 'ltr' },
  mixed: { text: 'บ้านเลขที่๑๗', direction: 'ltr' },
  spaced: { text: 'สวัสดี ครับ', direction: 'ltr' },
  // Tall-ascender consonants (ป ฝ ฟ) followed by a tone mark - the classic
  // Thai font case where a `calt` rule repositions/substitutes the tone-mark
  // glyph to avoid colliding with the consonant's ascender.
  tallConsonantTone: { text: 'ปั๊กฝ้ายให้ฟังกิ๊บ', direction: 'ltr' },

  // Ten-plus ordinary Thai words and names, several multi-word.
  thankYouVeryMuch: { text: 'ขอบคุณ มาก ครับ', direction: 'ltr' },
  goodMorning: { text: 'สวัสดี ตอนเช้า ครับ', direction: 'ltr' },
  niceToMeetYou: { text: 'ยินดี ที่ได้รู้จัก', direction: 'ltr' },
  wishingHappiness: { text: 'ขอให้ มีความสุข', direction: 'ltr' },
  personName1: { text: 'นายสมชาย ใจดี', direction: 'ltr' },
  personName2: { text: 'นางสาววันดี รักไทย', direction: 'ltr' },
  companyName: { text: 'บริษัท ไทยฟ้า จำกัด', direction: 'ltr' },
  schoolName: { text: 'โรงเรียน วัดสวนแก้ว', direction: 'ltr' },
  provinceName: { text: 'จังหวัด เชียงใหม่', direction: 'ltr' },
  streetName: { text: 'ถนน สุขุมวิท', direction: 'ltr' },
  birthday: { text: 'วันเกิด ปีนี้', direction: 'ltr' },
  bestFriend: { text: 'เพื่อนสนิท ตลอดไป', direction: 'ltr' },
};

const UNHINTED_TOLERANCE_PX = 0.05;
const HINTED_TOLERANCE_PX_PER_GLYPH = 0.5;

function shapedRun(family, { text, direction }) {
  const file = join(FONT_DIR, requestedFontFile(family, 'normal', 'normal'));
  const font = fontkit.create(readFileSync(file));
  let glyphCount = 0;
  const total = resolveBidiRuns(text, direction)
    .reduce((sum, run) => {
      const { positions } = font.layout(run.text, undefined, undefined, undefined, run.direction);
      glyphCount += positions.length;
      return sum + positions.reduce((segSum, p) => segSum + p.xAdvance, 0);
    }, 0);
  return { widthPx: (total / font.unitsPerEm) * SIZE, glyphCount };
}

test.describe('Sriracha font shaping parity (Guard A, FONT-08b)', () => {
  for (const [label, sample] of Object.entries(SAMPLES)) {
    test(`${FAMILY} (${label}): fontkit's shaped advance matches the browser's measureText`, async ({ page }) => {
      await page.goto('/sign/?next=0');
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
      }, { family: FAMILY, text: sample.text, size: SIZE });

      const { widthPx: fontkitWidth, glyphCount } = shapedRun(FAMILY, sample);
      const hinted = Number.isInteger(browserWidth) && glyphCount > 1;
      const tolerancePx = hinted ? HINTED_TOLERANCE_PX_PER_GLYPH * glyphCount : UNHINTED_TOLERANCE_PX;
      const deltaPx = Math.abs(browserWidth - fontkitWidth);
      const deltaPct = fontkitWidth > 0 ? (deltaPx / fontkitWidth) * 100 : 0;
      expect(
        deltaPx,
        `${FAMILY} (${label}): browser measureText ${browserWidth.toFixed(3)}px vs fontkit shaped advance ${fontkitWidth.toFixed(3)}px `
          + `(delta ${deltaPx.toFixed(3)}px, ${deltaPct.toFixed(2)}% of string width, ${glyphCount} glyphs, ${hinted ? 'hinted platform' : 'subpixel platform'})`,
      ).toBeLessThanOrEqual(tolerancePx);
    });
  }
});
