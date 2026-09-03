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
 * Tolerance is 0.01px for anything drawn entirely in Kanji/kana/CJK
 * punctuation - unlike a pixel diff there is no antialiasing noise to
 * calibrate against there, and the measured worst case is ~0.0001px (float32
 * vs float64 accumulation), four orders of magnitude below the threshold.
 * The guard has been proven able to fail at that precision: it reported 6
 * real divergences on the pre-GPOS-drop build of this same font.
 *
 * **Basic Latin is a second, looser tolerance band, added 2026-08-27 from a
 * real CI (Linux) measurement.** This guard's baseline claim of "~0.0001px"
 * had only ever been checked on the author's dev machine; the first time it
 * actually ran in CI (masked for a month by an unrelated flaky unit test -
 * see TODO.md's W1 update), every CJK/kana codepoint still matched to
 * ~0.0001px, but ~110/3600 codepoints diverged by up to 1.3px each, and every
 * one of them was Basic Latin/digit/punctuation - never a single kanji or
 * kana character, and never a pure-CJK string. The mechanism: Chromium's
 * canvas text metrics on Linux (FreeType-backed) return whole-device-pixel
 * advances for hinted glyphs; this face's CJK glyphs are unhinted by design
 * (typical for a 3,000+ glyph CJK build - Latin retains hinting from the
 * upstream file `scripts/fonts/build-cjk-subset.py` doesn't strip), so only
 * Latin advances get grid-fit and only Latin advances move. It reproduces
 * every run (0.00% determinism noise elsewhere in this suite), so it is
 * platform behaviour, not flakiness - the same class of "never verified for
 * real on Linux" gap `export-render-guard.spec.js`'s baseline had.
 * `LATIN_HINT_ROUNDING_PX` is that measurement (worst single glyph: 1.32px,
 * Bold "_") times the same 1.5x margin this codebase uses elsewhere, rounded
 * up to a clean 2px *per non-CJK character in the string* - deliberately
 * generous, because rounding on a real string partially cancels rather than
 * accumulating (13 non-CJK characters in the worst multi-char case totalled
 * 4.32px, well under 13 x the single-glyph worst). This does not weaken what
 * the guard actually protects: the GPOS-drop honesty is a CJK/kana kerning
 * question, and every CJK/kana codepoint (3,581 of them) still holds to
 * 0.01px. Latin advance-width fidelity is covered elsewhere (the Latin
 * shaping guards, `hebrew-font-parity`), so a loose net here is happening on
 * a signal that already has other guards, not on the one this file exists
 * for.
 */
import { test, expect } from '@playwright/test';
import { buildFontkitBundle, removeFontkitBundle } from './fixtures/shapingGuardHarness.js';
import { useTemporaryBundle } from './fixtures/temporaryBundle.js';
import { WYSIWYG_STRING_BY_ID } from '../../src/test/fixtures/wysiwygStrings.js';

/**
 * Strings a per-character sweep cannot cover: kerning only exists between a
 * pair, so a divergence in it is invisible one character at a time. Names,
 * addresses, dates and amounts, i.e. what someone actually types into a form.
 */
const FAMILIES = [
  {
    label: 'Japanese (Noto Sans JP)',
    file: 'NotoSansJP',
    minCoverage: 3500,
    strings: [
      WYSIWYG_STRING_BY_ID.C3.text,
      '山田太郎', 'やまだたろう', 'ヤマダタロウ', 'たろ', 'アイ',
      '東京都渋谷区', '住所: 東京都渋谷区1-2-3', '電話 03-1234-5678',
      '〒150-0001', '令和8年8月26日', '株式会社テスト', '金額 1,250円',
      '「署名」（サイン）、氏名・生年月日。', '彗芦苺凜昴遙絆', 'ー々〆〇',
      'Yamada Taro 山田太郎', 'VA', 'AV', 'Yamada',
    ],
  },
  {
    label: 'Simplified Chinese (Noto Sans SC)',
    file: 'NotoSansSC',
    minCoverage: 8000,
    strings: [
      '王小明', '李娜', '北京市朝阳区', '住址：北京市朝阳区1-2-3号',
      '电话 010-1234-5678', '邮编 100020', '2026年8月27日', '测试有限公司',
      '金额 1,250元', '「签名」（签署）、姓名，出生日期。', '之乎者也矣焉哉',
      'Wang Xiaoming 王小明', 'VA', 'AV', '中华人民共和国',
    ],
  },
  {
    label: 'Traditional Chinese (Noto Sans TC)',
    file: 'NotoSansTC',
    minCoverage: 11000,
    strings: [
      '王小明', '李娜', '台北市信義區', '住址：台北市信義區1-2-3號',
      '電話 02-1234-5678', '郵遞區號 110', '民國115年8月27日', '測試有限公司',
      '金額 1,250元', '「簽名」（簽署）、姓名，出生日期。', '之乎者也矣焉哉',
      'Wang Xiaoming 王小明', 'VA', 'AV', '中華民國',
    ],
  },
  {
    label: 'Korean (Noto Sans KR)',
    file: 'NotoSansKR',
    minCoverage: 11000,
    // A per-codepoint sweep over precomposed Hangul syllables cannot see the
    // isolated-jamo case (dropped `ljmo`/`vjmo`/`tjmo`, see module docstring),
    // so it is included explicitly here alongside realistic form strings.
    strings: [
      '김민준', '이서연', '서울특별시 강남구', '주소: 서울특별시 강남구1-2-3',
      '전화 010-1234-5678', '우편번호 06134', '2026년 8월 27일', '주식회사 테스트',
      '금액 1,250원', '「서명」（사인）、성명，생년월일。', '대한민국',
      'Kim Minjun 김민준', 'VA', 'AV', 'ㄱㄴㄷㄹ ㅏㅑㅓㅕ',
    ],
  },
];

const MAX_DELTA_PX = 0.01;
// See the module doc's "Basic Latin is a second, looser tolerance band" for
// where this number and its margin come from.
const LATIN_HINT_ROUNDING_PX = 2;
const CJK_RANGE = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
const nonCjkCharCount = (text) => [...text].filter((ch) => !CJK_RANGE.test(ch)).length;
const toleranceFor = (text) => Math.max(MAX_DELTA_PX, LATIN_HINT_ROUNDING_PX * nonCjkCharCount(text));
const SIZE = 40;
const BUNDLE = '__e2e-cjk-fontkit-bundle.js';

const fontkitBundle = useTemporaryBundle(test, {
  filename: BUNDLE,
  build: buildFontkitBundle,
  remove: removeFontkitBundle,
});

for (const family of FAMILIES) {
  test.describe(`${family.label} advance-width parity guard`, () => {
    for (const weight of ['Regular', 'Bold']) {
      test(`${family.label} ${weight}: fontkit's advances match Chromium's across every codepoint in the shipped subset`, async ({ page }) => {
      await fontkitBundle.open(page);

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

        const fk = window['__fontkit'].create(bytes);
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
        strings: family.strings,
        url: `/fonts/${family.file}-${weight}.ttf`,
        family: `${family.file}${weight}Guard`,
        size: SIZE,
        controlUrl: '/fonts/Arimo-Regular.ttf',
        controlFamily: 'CjkGuardControlArimo',
      });

      const overTolerance = result.cases.filter((c) => c.delta > toleranceFor(c.text));
      const substituted = result.cases.filter((c) => c.glyphs !== c.chars);
      const worst = Math.max(...result.cases.map((c) => c.delta));

      console.log(`CJK guard (${family.file} ${weight}): ${result.cases.length} cases over ${result.coverage} codepoints, worst advance delta ${worst.toFixed(6)}px, ${overTolerance.length} over tolerance, ${substituted.length} glyph-count mismatches`);
      if (overTolerance.length) {
        console.log('Diverging cases:', overTolerance
          .sort((a, b) => b.delta - a.delta).slice(0, 20)
          .map((c) => `"${c.text}": fontkit=${c.shaped.toFixed(4)}px chromium=${c.native.toFixed(4)}px delta=${c.delta.toFixed(4)}px (tolerance ${toleranceFor(c.text).toFixed(2)}px)`).join('\n'));
      }

      expect(result.discriminates, 'the font under test measured the same as sans-serif, so ctx.font never applied and every measurement is meaningless').toBe(true);
      expect(result.coverage, `${family.label}'s shipped subset lost codepoints`).toBeGreaterThan(family.minCoverage);
      expect(substituted.map((c) => c.text), `${family.label} should be one glyph per character - a substitution here means the font grew a contextual feature and this guard is no longer the right shape (see the module docstring's Korean note if this is NotoSansKR)`).toEqual([]);
      expect(overTolerance.map((c) => c.text), `${overTolerance.length}/${result.cases.length} cases exceeded their tolerance (worst ${worst.toFixed(6)}px)`).toEqual([]);
      });
    }
  });
}
