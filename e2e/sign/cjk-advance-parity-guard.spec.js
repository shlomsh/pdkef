/**
 * @file cjk-advance-parity-guard.spec.js
 * @description The correctness guard for the bundled Japanese face
 * (Noto Sans JP), and deliberately a *different* guard from the Devanagari and
 * Arabic ones next to it.
 *
 * Those two use `shapingGuardHarness.js` to pixel-diff fontkit's reconstructed
 * output against Chromium's own rendering, because Devanagari reorders vowel
 * signs and forms conjuncts, and Arabic joins letters into positional forms -
 * in both scripts the shaper can pick the *wrong glyph*, and only pixels catch
 * that. Japanese has no equivalent question: each character is an independent
 * glyph, there is no reordering, no joining, and no `calt` in this font. That
 * is asserted here rather than assumed - every case checks `glyphs.length ===
 * [...text].length`, so the day a substitution starts firing, this fails.
 *
 * What can actually go wrong for Japanese is **advance widths**, and it is the
 * same failure this whole module exists to prevent: the editor paints through
 * `@font-face` (the browser's own shaper) while the PDF is emitted at fontkit's
 * advances, so any pair the two renderers advance differently makes the
 * download disagree with the screen. This is not hypothetical - the upstream
 * font carries kana pair kerning that fontkit applies and Chromium does not
 * (`たろ` shaped 1940 units against the browser's 2000), which is why
 * `scripts/fonts/build-cjk-subset.py` drops GPOS outright. This guard is what
 * keeps that decision honest across a font refresh.
 *
 * The corpus is **derived from the shipped font's own cmap**, not a checked-in
 * list: every codepoint the file claims to draw is measured, so a subset built
 * with a wider or narrower character set is still covered completely and there
 * is no second list to drift. Realistic multi-character strings are appended
 * on top, since a per-character check alone cannot see a kerning pair.
 *
 * Tolerance is 0.01px rather than a calibrated noise floor: unlike a pixel
 * diff there is no antialiasing noise to calibrate against, and the measured
 * worst case is ~0.0001px (float32 vs float64 accumulation), four orders of
 * magnitude below the threshold. The guard has been proven able to fail: it
 * reported 6 real divergences on the pre-GPOS-drop build of this same font.
 */
import { test, expect } from '@playwright/test';
import { buildFontkitBundle, removeFontkitBundle } from './fixtures/shapingGuardHarness.js';

/**
 * Strings a per-character sweep cannot cover: kerning only exists between a
 * pair, so a divergence in it is invisible one character at a time. Names,
 * addresses, dates and amounts, i.e. what someone actually types into a form.
 */
const STRINGS = [
  '山田太郎', 'やまだたろう', 'ヤマダタロウ', 'たろ', 'アイ',
  '東京都渋谷区', '住所: 東京都渋谷区1-2-3', '電話 03-1234-5678',
  '〒150-0001', '令和8年8月26日', '株式会社テスト', '金額 1,250円',
  '「署名」（サイン）、氏名・生年月日。', '彗芦苺凜昴遙絆', 'ー々〆〇',
  'Yamada Taro 山田太郎', 'VA', 'AV', 'Yamada',
];

const MAX_DELTA_PX = 0.01;
const SIZE = 40;
const BUNDLE = '__e2e-cjk-fontkit-bundle.js';

let bundlePath;
test.beforeAll(async () => { bundlePath = await buildFontkitBundle(BUNDLE); });
test.afterAll(() => removeFontkitBundle(bundlePath));

test.describe('Japanese advance-width parity guard (Noto Sans JP)', () => {
  for (const weight of ['Regular', 'Bold']) {
    test(`Noto Sans JP ${weight}: fontkit's advances match Chromium's across every codepoint in the shipped subset`, async ({ page }) => {
      await page.goto('/sign');
      await page.addScriptTag({ url: `/${BUNDLE}` });

      // Runs entirely in the page (serialized by source), so it must stay self
      // contained - no closure over this module's scope.
      const result = await page.evaluate(async ({ strings, url, family, size, controlUrl, controlFamily }) => {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const fontFace = new FontFace(family, bytes.buffer);
        await fontFace.load();
        document.fonts.add(fontFace);
        // The stale/unloaded FontFace hazard: without this, "native" silently
        // measures a system fallback and the whole comparison is meaningless.
        if (!document.fonts.check(`${size}px "${family}"`)) {
          throw new Error(`${family} did not load; measurement would be against a fallback font`);
        }

        const fk = window.__fontkit.create(bytes);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${size}px "${family}"`;
        const scale = size / fk.unitsPerEm;

        // Assert the probe discriminates before trusting a green result: a
        // different font must measure differently, or `ctx.font` never took.
        // The control used to be the generic `sans-serif` keyword measuring
        // Japanese text, but that compares two things that can legitimately
        // agree for reasons that have nothing to do with whether `ctx.font`
        // applied: on a Linux CI box with a Noto CJK package installed (a
        // common side effect of `playwright install --with-deps`), a Latin
        // control font's *own* CJK fallback is that same system Noto font,
        // and it can measure within 0.01px of our bundled Noto Sans JP
        // regardless of which font `ctx` actually used - the check was
        // comparing two glyph-fallback paths that happened to converge, not
        // proving our FontFace was the one drawing. A Latin string sidesteps
        // fallback entirely: both fonts carry real, non-substituted Latin
        // glyphs, so if their design metrics didn't differ measurably here,
        // canvas font selection - not just Japanese fallback - would be
        // broken, which is the actual thing this probe needs to catch.
        const controlBytes = new Uint8Array(await (await fetch(controlUrl)).arrayBuffer());
        const controlFace = new FontFace(controlFamily, controlBytes.buffer);
        await controlFace.load();
        document.fonts.add(controlFace);
        const control = document.createElement('canvas').getContext('2d');
        control.font = `${size}px "${controlFamily}"`;
        const discriminates = Math.abs(control.measureText('Yamada Taro').width - ctx.measureText('Yamada Taro').width) > 0.01;

        const measure = (text) => {
          const { glyphs, positions } = fk.layout(text);
          const shaped = positions.reduce((sum, p) => sum + p.xAdvance, 0) * scale;
          const native = ctx.measureText(text).width;
          return { text, shaped, native, delta: Math.abs(shaped - native), glyphs: glyphs.length, chars: [...text].length };
        };
        // fontkit's `characterSet` is the font's own cmap, so the corpus is
        // whatever the shipped file actually claims - no second list to drift.
        const chars = [...new Set(fk.characterSet)]
          .filter((cp) => fk.hasGlyphForCodePoint(cp))
          .map((cp) => String.fromCodePoint(cp));
        return { discriminates, coverage: chars.length, cases: chars.concat(strings).map(measure) };
      }, {
        strings: STRINGS,
        url: `/fonts/NotoSansJP-${weight}.ttf`,
        family: `NotoSansJP${weight}Guard`,
        size: SIZE,
        controlUrl: '/fonts/Arimo-Regular.ttf',
        controlFamily: 'CjkGuardControlArimo',
      });

      const overTolerance = result.cases.filter((c) => c.delta > MAX_DELTA_PX);
      const substituted = result.cases.filter((c) => c.glyphs !== c.chars);
      const worst = Math.max(...result.cases.map((c) => c.delta));

      console.log(`CJK guard (${weight}): ${result.cases.length} cases over ${result.coverage} codepoints, worst advance delta ${worst.toFixed(6)}px, ${overTolerance.length} over ${MAX_DELTA_PX}px, ${substituted.length} glyph-count mismatches`);
      if (overTolerance.length) {
        console.log('Diverging cases:', overTolerance
          .sort((a, b) => b.delta - a.delta).slice(0, 20)
          .map((c) => `"${c.text}": fontkit=${c.shaped.toFixed(4)}px chromium=${c.native.toFixed(4)}px delta=${c.delta.toFixed(4)}px`).join('\n'));
      }

      expect(result.discriminates, 'the font under test measured the same as sans-serif, so ctx.font never applied and every measurement is meaningless').toBe(true);
      expect(result.coverage, 'the shipped subset should carry the full jōyō + jinmeiyō + kana set').toBeGreaterThan(3500);
      expect(substituted.map((c) => c.text), 'Japanese should be one glyph per character - a substitution here means the font grew a contextual feature and this guard is no longer the right shape').toEqual([]);
      expect(overTolerance.map((c) => c.text), `${overTolerance.length}/${result.cases.length} cases exceeded ${MAX_DELTA_PX}px (worst ${worst.toFixed(6)}px)`).toEqual([]);
    });
  }
});
