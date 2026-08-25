import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARABIC_CORPUS, DUAL_JOINING_LETTERS, NON_JOINING_LETTERS } from './fixtures/arabicCorpus.js';

/**
 * Arabic correctness guard for the Almarai catalogue candidate (TODO.md,
 * "Internationalization: fonts for scripts beyond Hebrew/Latin", the Arabic
 * entry). Modeled on devanagari-shaping-guard.spec.js's method - shape each
 * corpus string with fontkit (glyph ids + positions + SVG outlines via
 * `glyph.path.toSVG()`), reconstruct it on a <canvas> with Path2D at
 * fontkit's reported positions, and pixel-diff that against the *same
 * browser's* native `fillText()` of the identical string - one rasterizer,
 * no cross-engine noise - but Arabic's correctness question is different
 * from Devanagari's: it is *joining* (does fontkit's ArabicShaper pick the
 * right init/medi/fina/isol glyph and connect it correctly), not reordering
 * or conjunct formation. See arabicCorpus.js's own doc comment for exactly
 * which joining rules the four generated groups each target.
 *
 * **RTL anchoring, unlike the Devanagari guard.** Devanagari is Bidi_Class L
 * (left-to-right internally), so that guard could anchor everything at a
 * fixed left pen position with no direction handling at all. Arabic is
 * Bidi_Class AL and the app renders and exports it right-anchored (see
 * `usesRtlAnchoring` in src/editor/registry/text.ts and the RTL text box
 * growth behavior it exists for) - so both the native render and the
 * reconstruction here fix a RIGHT edge and grow leftward, with
 * `ctx.direction = 'rtl'` on the native side and an explicit `'rtl'`
 * direction passed to `fk.layout()` on the reconstruction side. This was
 * calibrated interactively before being written into this file: the first
 * attempt anchored native `fillText` with `ctx.textAlign = 'left'` at a
 * fixed x while computing the reconstruction's start pen as `x - totalWidth`
 * (i.e. simulating right anchoring from a left-anchored primitive) and
 * appeared to disagree by 70-85% - which turned out to be a test-harness bug
 * (the `AlmaraiCalib` FontFace had been registered on a page that was then
 * navigated away from, so "native" was silently measuring a fallback system
 * font, not Almarai - the exact hazard CLAUDE.md's Layer-1-harness section
 * warns about: "assert the measurement discriminates before trusting what it
 * says"). With the font correctly loaded and `ctx.direction = 'rtl'` +
 * `ctx.textAlign = 'right'` used natively (verified to agree pixel-for-pixel,
 * 0% diff, with a left-anchored render placed at the measured width), the
 * true shaping agreement is in the same single-digit-percent band the
 * Devanagari guard found.
 *
 * fontkit runs entirely in the page (matching how src/lib/liveFontCoverage.js
 * already runs it client-side), bundled fresh for the browser via esbuild in
 * `test.beforeAll` rather than checked in as a generated artifact - no
 * network dependency, no stale-bundle risk. `regenerator-runtime` is
 * imported for parity with production (src/editor/registry/text.ts imports
 * it before any `layout()` call for Devanagari's sake), even though the
 * Arabic joining state machine (`ArabicShaper`, ported from HarfBuzz's
 * hb-ot-shape-complex-arabic.cc) does not itself use generators and does not
 * need the polyfill - confirmed by running it without the import first.
 *
 * **The noise floor is calibrated across the whole alphabet, not one glyph -
 * unlike the Devanagari guard, and measured before being assumed.** The
 * first version of this file used a single calibration glyph ('م', mirroring
 * the Devanagari guard's one bare consonant) and every real case failed
 * against it, including single-letter cases with zero shaping decisions
 * involved (`isolated:ب`, glyph count 1). That is the "guard fails on
 * literally nothing to get wrong" signature of a harness problem, not a
 * shaper problem - confirmed by measuring the same zero-shaping isolated-form
 * diff for all 28 base letters: it ranges from 0.63% (ا, a single straight
 * stroke) to 11.44% (ز, a thin curve plus a small dot, the kind of fine
 * detail whose antialiased edge is a large fraction of the glyph's own ink).
 * Arabic letterforms in this font are far more heterogeneous in stroke
 * weight and fine detail (dots, thin curves) than Devanagari's or Latin's,
 * so a single calibration glyph can land anywhere in that range by chance -
 * 'م' happened to land low (5.45%), which is what produced the false
 * failures. The fix is the same principle the codebase already applies
 * elsewhere (assert a probe discriminates before trusting it): calibrate
 * against the *maximum* zero-shaping diff across every base letter in the
 * corpus's own alphabet, so the tolerance reflects this font's real
 * per-glyph rendering noise ceiling rather than one glyph's luck.
 *
 * **Two honest limits of that calibration, so nobody reads more into a green
 * run than it earns.** First, the floor is a max over the isolated forms, and
 * the corpus contains those same isolated forms, so the `isolated:*` cases
 * cannot fail by construction - the joining, ligature and word cases are what
 * actually carry this guard, and they are measured against a floor derived
 * from renders they do not share. Second, a max-based tolerance is deliberately
 * permissive: it buys freedom from false failures at the cost of not detecting
 * a divergence smaller than the noisiest glyph's own antialiasing. What it
 * does still catch was verified rather than assumed - disabling joining
 * entirely (shaping each character alone and concatenating, i.e. exactly the
 * "no Arabic support" defect this font was added to fix) fails 79 of the 131
 * cases. The 52 that survive that sabotage are the ones where joining is a
 * no-op: isolated forms and the non-joining letters.
 */

const SIZE = 80;
const CANVAS_W = 600;
const CANVAS_H = 200;
// Right-anchor x for both the native and reconstructed renders - see the
// module doc above for why this guard, unlike the Devanagari one, anchors on
// the right and grows leftward.
const ANCHOR_X = CANVAS_W - 30;
const BASELINE_Y = 130;

// Same discipline as the Devanagari guard: judge every real case against a
// tolerance derived from a measured self-consistency noise floor, not a
// number picked in advance.
const NOISE_FLOOR_MULTIPLIER = 1.5;
const MIN_TOLERANCE_PCT = 3;

const BUNDLE_FILENAME = '__e2e-arabic-fontkit-bundle.js';
const distDir = join(process.cwd(), 'dist');
const bundlePath = join(distDir, BUNDLE_FILENAME);

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import 'regenerator-runtime/runtime.js';
        import fontkit from '@pdf-lib/fontkit';
        window.__fontkit = fontkit;
      `,
      resolveDir: process.cwd(),
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
  });
  // `npm run preview` (what playwright.config.js's webServer runs) serves dist/
  // but does not build it, so on a clean checkout this would otherwise fail
  // with a bare ENOENT that says nothing about the cause.
  if (!existsSync(distDir)) {
    throw new Error(`${distDir} does not exist. This guard bundles fontkit into the built site, so run \`npm run build\` before \`npx playwright test\` (\`npm run test:e2e\` does both).`);
  }
  writeFileSync(bundlePath, result.outputFiles[0].text);
});

// dist/ is a build output, not a scratch directory: a leftover bundle is served
// by any later `npm run preview`, and would be swept into the precache manifest
// if generate-precache-manifest.mjs ran after an e2e pass rather than a build.
test.afterAll(() => {
  rmSync(bundlePath, { force: true });
});

test.describe('Arabic shaping correctness guard (Almarai candidate)', () => {
  test(`fontkit's shaped Almarai output pixel-matches the browser's own rendering across ${ARABIC_CORPUS.length} generated cases`, async ({ page }) => {
    await page.goto('/sign');
    await page.addScriptTag({ url: `/${BUNDLE_FILENAME}` });

    const result = await page.evaluate(async ({ corpus, alphabet, size, w, h, anchorX, baselineY, family }) => {
      // FontFace, not a CSS @font-face rule - same reasoning as the
      // Devanagari guard: canvas text only needs the FontFace registered,
      // not a stylesheet, and the app's style-src CSP has no reason to grow
      // a hash for a test-only <style> block.
      const fontRes = await fetch('/fonts/Almarai-Regular.ttf');
      const fontBytes = new Uint8Array(await fontRes.arrayBuffer());
      const fontFace = new FontFace(family, fontBytes.buffer);
      await fontFace.load();
      document.fonts.add(fontFace);
      if (!document.fonts.check(`${size}px "${family}"`)) {
        throw new Error(`${family} did not load; measurement would be against a fallback font`);
      }

      const fk = window.__fontkit.create(fontBytes);

      function shape(text) {
        // Explicit 'rtl' direction, matching how the export path calls
        // layout() on a run resolveBidiRuns has already classified (see
        // src/editor/registry/text.ts) rather than leaving fontkit to guess.
        const { glyphs, positions } = fk.layout(text, undefined, undefined, undefined, 'rtl');
        return glyphs.map((g, i) => ({ path: g.path.toSVG(), pos: positions[i] }));
      }

      function makeCanvas() {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c.getContext('2d');
      }

      function ink(ctx) {
        return ctx.getImageData(0, 0, w, h).data;
      }

      function drawNative(text) {
        const ctx = makeCanvas();
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h);
        ctx.font = `${size}px "${family}"`;
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'black';
        ctx.fillText(text, anchorX, baselineY);
        return { ctx, width: ctx.measureText(text).width };
      }

      function drawReconstruction(glyphList, totalWidth) {
        const ctx = makeCanvas();
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h);
        const scale = size / fk.unitsPerEm;
        let pen = anchorX - totalWidth;
        for (const g of glyphList) {
          ctx.save();
          ctx.translate(pen + g.pos.xOffset * scale, baselineY - g.pos.yOffset * scale);
          ctx.scale(scale, -scale);
          ctx.fillStyle = 'black';
          ctx.fill(new Path2D(g.path));
          ctx.restore();
          pen += g.pos.xAdvance * scale;
        }
        return { ctx, width: (pen - (anchorX - totalWidth)) };
      }

      function pixelDiffPct(dataA, dataB) {
        let diffCount = 0, unionInked = 0;
        for (let i = 0; i < dataA.length; i += 4) {
          const inkedA = dataA[i + 3] > 10 && dataA[i] < 200;
          const inkedB = dataB[i + 3] > 10 && dataB[i] < 200;
          if (inkedA || inkedB) unionInked++;
          if (inkedA !== inkedB) diffCount++;
        }
        return unionInked ? (100 * diffCount / unionInked) : 0;
      }

      // Noise floor: the MAXIMUM zero-shaping diff across every base letter
      // in the alphabet (each rendered isolated, one glyph, no joining/
      // ligature/mark decision involved), via fillText and via the identical
      // Path2D reconstruction path. See the module doc above for why this is
      // a max over the whole alphabet rather than one calibration glyph -
      // Arabic letterforms vary too much in fine detail (dots, thin curves)
      // for a single glyph to represent the font's real per-glyph noise
      // ceiling. Any nonzero result here is pure antialiasing/hinting
      // difference between the two rendering methods, not a shaping defect.
      const alphabetDiffs = alphabet.map((letter) => {
        const glyphs = shape(letter);
        const native = drawNative(letter);
        const recon = drawReconstruction(glyphs, native.width);
        return pixelDiffPct(ink(native.ctx), ink(recon.ctx));
      });
      const noiseFloorPct = Math.max(...alphabetDiffs);

      const cases = corpus.map(({ id, text }) => {
        const glyphs = shape(text);
        const native = drawNative(text);
        const recon = drawReconstruction(glyphs, native.width);
        const diffPct = pixelDiffPct(ink(native.ctx), ink(recon.ctx));
        const widthDiff = Math.abs(native.width - recon.width);
        return {
          id, text, diffPct, widthDiff,
          glyphCount: glyphs.length,
          nativeWidth: native.width,
          reconWidth: recon.width,
        };
      });

      return { noiseFloorPct, cases };
    }, { corpus: ARABIC_CORPUS, alphabet: [...DUAL_JOINING_LETTERS, ...NON_JOINING_LETTERS], size: SIZE, w: CANVAS_W, h: CANVAS_H, anchorX: ANCHOR_X, baselineY: BASELINE_Y, family: 'AlmaraiGuardTest' });

    const tolerancePct = Math.max(MIN_TOLERANCE_PCT, result.noiseFloorPct * NOISE_FLOOR_MULTIPLIER);
    const failures = result.cases.filter((c) => c.diffPct > tolerancePct);

    console.log(`Arabic guard: ${result.cases.length} cases, noise floor ${result.noiseFloorPct.toFixed(2)}%, tolerance ${tolerancePct.toFixed(2)}%, ${failures.length} failing`);
    if (failures.length) {
      console.log('Failing cases:', failures.map((f) => `${f.id} "${f.text}": diff=${f.diffPct.toFixed(2)}% widthDiff=${f.widthDiff.toFixed(2)}px glyphs=${f.glyphCount} nativeWidth=${f.nativeWidth.toFixed(2)} reconWidth=${f.reconWidth.toFixed(2)}`).join('\n'));
    }

    expect(failures, `${failures.length}/${result.cases.length} cases exceeded tolerance (noise floor ${result.noiseFloorPct.toFixed(2)}%, tolerance ${tolerancePct.toFixed(2)}%): ${failures.map((f) => f.id).join(', ')}`).toEqual([]);
  });
});
