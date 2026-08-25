import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEVANAGARI_CORPUS } from './fixtures/devanagariCorpus.js';

/**
 * Devanagari correctness guard for the Kalam catalogue candidate
 * (TODO.md, "Internationalization: fonts for scripts beyond Hebrew/Latin",
 * the Devanagari entry). Not a port of Hebrew's Tier 1/2/3 guards - Devanagari's
 * correctness question is glyph *selection* and *visual order* (reordering,
 * ligation), not mark position given shaping order was already right, so this
 * guard checks a different thing: does fontkit's shaped output for each
 * corpus string pixel-match this browser's own native rendering of the
 * identical string in the identical font?
 *
 * Method mirrors the earlier 6-string scratch spike, scaled to the enumerated
 * corpus in ./fixtures/devanagariCorpus.js: shape each string with fontkit
 * (glyph ids + positions + SVG outlines via `glyph.path.toSVG()`),
 * reconstruct it on a <canvas> with Path2D at fontkit's reported positions,
 * and pixel-diff that against the *same browser's* native `fillText()` of the
 * identical string - one rasterizer, no cross-engine noise, same discipline
 * `docs/hebrew-text-shaping-export.md` uses to reject cross-rasterizer
 * comparisons.
 *
 * fontkit runs entirely in the page (matching how `src/lib/liveFontCoverage.js`
 * already runs it client-side), bundled fresh for the browser via esbuild in
 * `test.beforeAll` rather than checked in as a generated artifact - no network
 * dependency, no stale-bundle risk. The bundle includes the same
 * `regenerator-runtime/runtime.js` import the app itself needs before calling
 * `layout()` on Devanagari text (see src/editor/registry/text.ts) - without
 * it every case in this file would throw `ReferenceError: regeneratorRuntime
 * is not defined` instead of shaping, which is exactly the crash this guard
 * must run *after* fixing, not around.
 */

const SIZE = 100;
const CANVAS_W = 500;
const CANVAS_H = 200;
// A pixel-diff test must prove it can discriminate before it's trusted (the
// repo has hit meaningless-green-probe bugs from 0x0 jsdom rects and
// unloaded fonts before - see H8 in TODO.md). The self-consistency noise
// floor - the same single already-correct glyph rendered once via fillText
// and once via the identical Path2D reconstruction path, zero shaping
// involved - sets the bound every real case is judged against, rather than a
// number picked in advance.
const NOISE_FLOOR_MULTIPLIER = 1.5;
// Absolute floor under the multiplier: a noise floor near 0% (possible on a
// crisp headless render) would make the multiplier demand near-pixel-perfect
// agreement, which is not what this guard is measuring.
const MIN_TOLERANCE_PCT = 3;

// The app's CSP (script-src 'self' plus per-script hashes, no unsafe-inline -
// see CLAUDE.md's Content-Security-Policy section) blocks an inline
// page.addScriptTag({ content }) outright. 'self' is in that list, so a
// same-origin <script src> is allowed - this writes the bundle straight into
// the already-built `dist/` the preview server is serving, under a name
// nothing else in the build produces, and fetches it by URL instead.
const BUNDLE_FILENAME = '__e2e-devanagari-fontkit-bundle.js';
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

// The bundle is ~1.5MB and dist/ is a build output, not a scratch directory. A
// leftover copy is served by any later `npm run preview`, and would be swept
// into the precache manifest if scripts/generate-precache-manifest.mjs ran
// after an e2e pass rather than after a build.
test.afterAll(() => {
  rmSync(bundlePath, { force: true });
});

test.describe('Devanagari shaping correctness guard (Kalam candidate)', () => {
  test(`fontkit's shaped Kalam output pixel-matches the browser's own rendering across ${DEVANAGARI_CORPUS.length} generated cases`, async ({ page }) => {
    await page.goto('/sign');
    await page.addScriptTag({ url: `/${BUNDLE_FILENAME}` });

    const result = await page.evaluate(async ({ corpus, size, w, h, family }) => {
      // FontFace, not a CSS @font-face rule: the app's style-src CSP has no
      // 'unsafe-inline' and this guard has no reason to add a hash for a
      // test-only style block. The FontFace API governs canvas text exactly
      // the same way and needs no stylesheet at all.
      const fontRes = await fetch('/fonts/Kalam-Regular.ttf');
      const fontBytes = new Uint8Array(await fontRes.arrayBuffer());
      const fontFace = new FontFace(family, fontBytes.buffer);
      await fontFace.load();
      document.fonts.add(fontFace);
      if (!document.fonts.check(`${size}px "${family}"`)) {
        throw new Error(`${family} did not load; measurement would be against a fallback font`);
      }

      const fk = window.__fontkit.create(fontBytes);

      function shape(text) {
        const { glyphs, positions } = fk.layout(text);
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
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'black';
        ctx.fillText(text, 20, 120);
        return { ctx, width: ctx.measureText(text).width };
      }

      function drawReconstruction(glyphList) {
        const ctx = makeCanvas();
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h);
        const scale = size / fk.unitsPerEm;
        let pen = 20;
        for (const g of glyphList) {
          ctx.save();
          ctx.translate(pen + g.pos.xOffset * scale, 120 - g.pos.yOffset * scale);
          ctx.scale(scale, -scale);
          ctx.fillStyle = 'black';
          ctx.fill(new Path2D(g.path));
          ctx.restore();
          pen += g.pos.xAdvance * scale;
        }
        return { ctx, width: (pen - 20) };
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

      // Noise floor: one already-correct glyph (bare KA, no shaping
      // decisions involved), rendered via fillText and via the identical
      // Path2D reconstruction path. Any nonzero result here is pure
      // antialiasing/hinting difference between the two rendering methods,
      // not a shaping defect - it calibrates the tolerance every real case
      // is judged against instead of asserting a number chosen in advance.
      const baseGlyphs = shape('क');
      const baseNative = drawNative('क');
      const baseRecon = drawReconstruction(baseGlyphs);
      const noiseFloorPct = pixelDiffPct(ink(baseNative.ctx), ink(baseRecon.ctx));

      const cases = corpus.map(({ id, text }) => {
        const glyphs = shape(text);
        const native = drawNative(text);
        const recon = drawReconstruction(glyphs);
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
    }, { corpus: DEVANAGARI_CORPUS, size: SIZE, w: CANVAS_W, h: CANVAS_H, family: 'KalamGuardTest' });

    const tolerancePct = Math.max(MIN_TOLERANCE_PCT, result.noiseFloorPct * NOISE_FLOOR_MULTIPLIER);
    const failures = result.cases.filter((c) => c.diffPct > tolerancePct);

    console.log(`Devanagari guard: ${result.cases.length} cases, noise floor ${result.noiseFloorPct.toFixed(2)}%, tolerance ${tolerancePct.toFixed(2)}%, ${failures.length} failing`);
    if (failures.length) {
      console.log('Failing cases:', failures.map((f) => `${f.id} "${f.text}": diff=${f.diffPct.toFixed(2)}% widthDiff=${f.widthDiff.toFixed(2)}px glyphs=${f.glyphCount} nativeWidth=${f.nativeWidth.toFixed(2)} reconWidth=${f.reconWidth.toFixed(2)}`).join('\n'));
    }

    expect(failures, `${failures.length}/${result.cases.length} cases exceeded tolerance (noise floor ${result.noiseFloorPct.toFixed(2)}%, tolerance ${tolerancePct.toFixed(2)}%): ${failures.map((f) => f.id).join(', ')}`).toEqual([]);
  });
});
