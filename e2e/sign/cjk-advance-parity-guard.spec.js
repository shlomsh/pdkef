/**
 * @file cjk-advance-parity-guard.spec.js
 * @description The correctness guard for the bundled CJK faces (Noto Sans
 * JP, SC, TC, KR), and deliberately a *different* guard from the Devanagari
 * and Arabic ones next to it.
 *
 * Those two use `shapingGuardHarness.js` to pixel-diff fontkit's reconstructed
 * output against Chromium's own rendering, because Devanagari reorders vowel
 * signs and forms conjuncts, and Arabic joins letters into positional forms -
 * in both scripts the shaper can pick the *wrong glyph*, and only pixels catch
 * that. Japanese, Simplified Chinese and Traditional Chinese have no
 * equivalent question: each character is an independent glyph, there is no
 * reordering, no joining, and `scripts/fonts/build-cjk-subset.py`'s
 * `LAYOUT_FEATURES` allowlist (`ccmp,locl,liga`) keeps `calt` out of every
 * subset regardless of what the upstream font carries. That is asserted here
 * rather than assumed - every case checks `glyphs.length === [...text].length`,
 * so the day a substitution starts firing, this fails.
 *
 * **Korean does not automatically inherit that assumption, and this guard is
 * where that got checked rather than assumed.** Unlike JP/SC/TC, Noto Sans
 * KR's *upstream* GSUB carries `calt` plus a `ljmo`/`vjmo`/`tjmo` jamo-
 * composition triad - see the module docstring in build-cjk-subset.py, point
 * 5. Those features do not survive the subset (same allowlist, same proof:
 * the build script asserts the output GSUB is a subset of
 * `{ccmp, locl, liga}`), and this guard's own glyph-count assertion is the
 * second, independent proof of the same thing, this time against the actual
 * shipped file rather than the build's own output. Precomposed Hangul
 * syllables (U+AC00-D7A3) each already have one dedicated glyph - they don't
 * need `ljmo`/`vjmo`/`tjmo` to render correctly, that feature only matters if
 * *isolated* jamo are typed and expected to visually compose - so removing it
 * costs nothing for the character set this app ships (see `kr_chars()` in the
 * build script for why isolated-jamo composition was not something the
 * subset needed to support). If a future refresh ever needs to keep it, this
 * guard is what will catch the day glyph count stops matching character
 * count for Hangul, rather than that being a silent behavior change.
 *
 * What can actually go wrong for these four is **advance widths**, and it is
 * the same failure this whole module exists to prevent: the editor paints
 * through `@font-face` (the browser's own shaper) while the PDF is emitted at
 * fontkit's advances, so any pair the two renderers advance differently makes
 * the download disagree with the screen. This is not hypothetical for
 * Japanese - the upstream font carries kana pair kerning that fontkit applies
 * and Chromium does not (`たろ` shaped 1940 units against the browser's
 * 2000) - and SC/TC/KR's upstream GPOS carries the same shape of feature set
 * (`kern`/`palt`/`mark`), which is why `build-cjk-subset.py` drops GPOS
 * outright for every family, not just Japanese. This guard is what keeps
 * that decision honest across a font refresh, for all four.
 *
 * The corpus for each family is **derived from that family's own shipped
 * font's own cmap**, not a checked-in list: every codepoint the file claims
 * to draw is measured, so a subset built with a wider or narrower character
 * set is still covered completely and there is no second list to drift.
 * Realistic multi-character strings (names, addresses, dates, amounts - what
 * someone actually types into a form) are appended on top per family, since a
 * per-character check alone cannot see a kerning pair.
 *
 * Tolerance is 0.01px rather than a calibrated noise floor: unlike a pixel
 * diff there is no antialiasing noise to calibrate against, and the measured
 * worst case for Japanese is ~0.0001px (float32 vs float64 accumulation),
 * four orders of magnitude below the threshold. The guard has been proven
 * able to fail: it reported 6 real divergences on the pre-GPOS-drop build of
 * Noto Sans JP.
 */
import { test, expect } from '@playwright/test';
import { buildFontkitBundle, removeFontkitBundle } from './fixtures/shapingGuardHarness.js';

/**
 * Per-family config: `label` for the test title, `file` prefix matching
 * public/fonts/<file>-<weight>.ttf, and `strings` - realistic multi-character
 * cases a per-codepoint sweep cannot cover, since kerning only exists between
 * a pair. Each set is names, addresses, dates and amounts in that family's
 * script, mirroring what the Japanese corpus already covered.
 */
const FAMILIES = [
  {
    label: 'Japanese (Noto Sans JP)',
    file: 'NotoSansJP',
    minCoverage: 3500,
    strings: [
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
const SIZE = 40;
const BUNDLE = '__e2e-cjk-fontkit-bundle.js';

let bundlePath;
test.beforeAll(async () => { bundlePath = await buildFontkitBundle(BUNDLE); });
test.afterAll(() => removeFontkitBundle(bundlePath));

for (const family of FAMILIES) {
  test.describe(`${family.label} advance-width parity guard`, () => {
    for (const weight of ['Regular', 'Bold']) {
      test(`${family.file} ${weight}: fontkit's advances match Chromium's across every codepoint in the shipped subset`, async ({ page }) => {
        await page.goto('/sign');
        await page.addScriptTag({ url: `/${BUNDLE}` });

        // Runs entirely in the page (serialized by source), so it must stay self
        // contained - no closure over this module's scope.
        const result = await page.evaluate(async ({ strings, url, family: fontFamily, size }) => {
          const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
          const fontFace = new FontFace(fontFamily, bytes.buffer);
          await fontFace.load();
          document.fonts.add(fontFace);
          // The stale/unloaded FontFace hazard: without this, "native" silently
          // measures a system fallback and the whole comparison is meaningless.
          if (!document.fonts.check(`${size}px "${fontFamily}"`)) {
            throw new Error(`${fontFamily} did not load; measurement would be against a fallback font`);
          }

          const fk = window.__fontkit.create(bytes);
          const ctx = document.createElement('canvas').getContext('2d');
          ctx.font = `${size}px "${fontFamily}"`;
          const scale = size / fk.unitsPerEm;

          // Assert the probe discriminates before trusting a green result: a
          // different font must measure differently, or `ctx.font` never took.
          // Uses the first corpus string (always non-Latin per family) rather
          // than a hardcoded Japanese one, so this generalizes across scripts.
          const probe = strings[0];
          const control = document.createElement('canvas').getContext('2d');
          control.font = `${size}px sans-serif`;
          const discriminates = Math.abs(control.measureText(probe).width - ctx.measureText(probe).width) > 0.01;

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
        }, { strings: family.strings, url: `/fonts/${family.file}-${weight}.ttf`, family: `${family.file}${weight}Guard`, size: SIZE });

        const overTolerance = result.cases.filter((c) => c.delta > MAX_DELTA_PX);
        const substituted = result.cases.filter((c) => c.glyphs !== c.chars);
        const worst = Math.max(...result.cases.map((c) => c.delta));

        console.log(`CJK guard (${family.file} ${weight}): ${result.cases.length} cases over ${result.coverage} codepoints, worst advance delta ${worst.toFixed(6)}px, ${overTolerance.length} over ${MAX_DELTA_PX}px, ${substituted.length} glyph-count mismatches`);
        if (overTolerance.length) {
          console.log('Diverging cases:', overTolerance
            .sort((a, b) => b.delta - a.delta).slice(0, 20)
            .map((c) => `"${c.text}": fontkit=${c.shaped.toFixed(4)}px chromium=${c.native.toFixed(4)}px delta=${c.delta.toFixed(4)}px`).join('\n'));
        }
        if (substituted.length) {
          console.log('Glyph-count mismatches:', substituted
            .slice(0, 20)
            .map((c) => `"${c.text}": glyphs=${c.glyphs} chars=${c.chars}`).join('\n'));
        }

        expect(result.discriminates, 'the font under test measured the same as sans-serif, so ctx.font never applied and every measurement is meaningless').toBe(true);
        expect(result.coverage, `the shipped subset should carry the full requested character set for ${family.label}`).toBeGreaterThan(family.minCoverage);
        expect(substituted.map((c) => c.text), `${family.label} should be one glyph per character - a substitution here means the font grew a contextual feature and this guard is no longer the right shape (see the module docstring's Korean note if this is NotoSansKR)`).toEqual([]);
        expect(overTolerance.map((c) => c.text), `${overTolerance.length}/${result.cases.length} cases exceeded ${MAX_DELTA_PX}px (worst ${worst.toFixed(6)}px)`).toEqual([]);
      });
    }
  });
}
