/**
 * @file shapingGuardHarness.js
 * @description Shared machinery behind every per-script shaping correctness
 * guard (devanagari-shaping-guard.spec.js, arabic-shaping-guard.spec.js, and
 * whichever script follows them - see TODO.md, "Making font additions
 * cheaper").
 *
 * Extracted after the Devanagari and Arabic guards were found to duplicate
 * ~90% of their ~265 lines each: the esbuild fontkit bundling, the
 * pixel-diff-against-native-Chromium-rendering method, and the "calibrate a
 * noise floor from measured self-consistency, don't pick a tolerance in
 * advance" discipline are identical between them. The only things that
 * actually differ per script are the font file, LTR vs RTL anchoring, the
 * corpus, and which strings make a sensible calibration set - all of which
 * are just config to `createShapingGuardTest` below. Refactoring the two
 * existing guards onto this was the proof it doesn't regress either: both
 * must keep passing at their original counts (185/185 Devanagari, 131/131
 * Arabic) before this is trusted for a new script.
 *
 * **The method, once for both scripts rather than twice:** shape each corpus
 * string with fontkit (glyph ids + positions + SVG outlines via
 * `glyph.path.toSVG()`), reconstruct it on a `<canvas>` with `Path2D` at
 * fontkit's reported positions, and pixel-diff that against the *same
 * browser's* native `fillText()` of the identical string in the identical
 * font - one rasterizer, no cross-engine noise, the same discipline
 * `docs/hebrew-text-shaping-export.md` uses to reject cross-rasterizer
 * comparisons. fontkit runs entirely in the page (matching how
 * `src/lib/liveFontCoverage.js` already runs it client-side), bundled fresh
 * via esbuild in a Playwright `beforeAll` rather than checked in as a
 * generated artifact - no network dependency, no stale-bundle risk. The
 * bundle includes `regenerator-runtime/runtime.js`, which Devanagari's
 * shaping needs (see `src/editor/registry/text.ts`) and Arabic's does not,
 * but importing it unconditionally is cheap and keeps one bundle recipe
 * instead of a per-script branch.
 *
 * **Why a `<script src>` fetch, not `page.addScriptTag({ content })`.** The
 * app's CSP (`script-src 'self'` plus per-script hashes, no
 * `unsafe-inline` - see CLAUDE.md's Content-Security-Policy section) blocks
 * an inline script tag outright. `'self'` is in that list, so a same-origin
 * `<script src>` is allowed - the bundle is written straight into the
 * already-built `dist/` the preview server serves, under a name nothing
 * else in the build produces, and fetched by URL instead.
 *
 * **The noise floor is a measured maximum over a calibration set, never a
 * fixed number.** Both existing guards learned the hard way that a single
 * calibration glyph is the wrong unit: Devanagari's first version
 * calibrated from one bare consonant and broke in CI because a lone glyph's
 * antialiasing noise is itself platform-dependent; Arabic's first version
 * calibrated from one letter ('م') and produced false failures across half
 * the alphabet because Arabic letterforms vary far more in fine detail
 * (dots, thin curves) than a single glyph represents. The fix both times was
 * the same: calibrate against the *maximum* diff across a representative set
 * of zero-shaping-ambiguity strings (every base letter/consonant, or every
 * base plus a plain non-reordering mark), not one glyph's luck. That is why
 * `calibrationSet` here is just a flat array of strings - each per-script
 * spec decides what belongs in it (see the module doc in each spec file for
 * why its particular set is the right shape of noise to calibrate against),
 * and this harness only has to take the max diff across whatever it's given.
 */
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

/**
 * Bundles fontkit (+ regenerator-runtime) for the browser and writes it into
 * the built `dist/` so a same-origin `<script src>` can fetch it under CSP.
 * Call from `test.beforeAll`; pair with `removeFontkitBundle` in
 * `test.afterAll`.
 *
 * @param {string} bundleFilename - unique per guard, so two guards run in the
 *   same job never race on the same file.
 * @returns {Promise<string>} the absolute path the bundle was written to.
 */
export async function buildFontkitBundle(bundleFilename) {
  const distDir = join(process.cwd(), 'dist');
  // `npm run preview` (what playwright.config.js's webServer runs) serves
  // dist/ but does not build it, so on a clean checkout this would otherwise
  // fail with a bare ENOENT that says nothing about the cause.
  if (!existsSync(distDir)) {
    throw new Error(`${distDir} does not exist. Shaping guards bundle fontkit into the built site, so run \`npm run build\` before \`npx playwright test\` (\`npm run test:e2e\` does both).`);
  }
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
  const bundlePath = join(distDir, bundleFilename);
  writeFileSync(bundlePath, result.outputFiles[0].text);
  return bundlePath;
}

/**
 * Deletes a bundle written by `buildFontkitBundle`. `dist/` is a build
 * output, not a scratch directory - a leftover bundle would be served by any
 * later `npm run preview` and swept into the precache manifest if
 * `generate-precache-manifest.mjs` ran after an e2e pass rather than a build.
 */
export function removeFontkitBundle(bundlePath) {
  rmSync(bundlePath, { force: true });
}

/**
 * Runs entirely inside the page via `page.evaluate` - must stay self
 * contained (only its own argument and page globals, no closure over this
 * module's scope) since Playwright serializes it by source. Loads the font,
 * shapes and reconstructs every corpus + calibration string, and returns raw
 * measurements; tolerance/pass-fail judgment stays in the Node side
 * (`createShapingGuardTest` below) so it can be logged before `expect` runs.
 *
 * `anchorX` means "left pen start" for `direction: 'ltr'` and "right anchor
 * edge, growing leftward" for `direction: 'rtl'` - the one axis that
 * genuinely differs between how a browser and fontkit lay out the two
 * directions, so it's the one thing this function branches on.
 *
 * @param {object} config
 * @param {{id: string, text: string}[]} config.corpus
 * @param {string[]} config.calibrationSet
 * @param {string} config.fontUrl - same-origin path, e.g. '/fonts/Kalam-Regular.ttf'
 * @param {string} config.family - a test-only FontFace family name
 * @param {number} config.size
 * @param {number} config.canvasWidth
 * @param {number} config.canvasHeight
 * @param {number} config.anchorX
 * @param {number} config.baselineY
 * @param {'ltr'|'rtl'} config.direction
 */
export async function runShapingGuardInPage({
  corpus, calibrationSet, fontUrl, family, size, canvasWidth, canvasHeight, anchorX, baselineY, direction,
}) {
  // FontFace, not a CSS @font-face rule: canvas text only needs the FontFace
  // registered, not a stylesheet, and the app's style-src CSP has no reason
  // to grow a hash for a test-only <style> block.
  const fontRes = await fetch(fontUrl);
  const fontBytes = new Uint8Array(await fontRes.arrayBuffer());
  const fontFace = new FontFace(family, fontBytes.buffer);
  await fontFace.load();
  document.fonts.add(fontFace);
  if (!document.fonts.check(`${size}px "${family}"`)) {
    throw new Error(`${family} did not load; measurement would be against a fallback font`);
  }

  const fk = window.__fontkit.create(fontBytes);
  const rtl = direction === 'rtl';

  function shape(text) {
    // Explicit direction on the RTL side, matching how the export path calls
    // layout() on a run resolveBidiRuns has already classified (see
    // src/editor/registry/text.ts) rather than leaving fontkit to guess.
    // Left undefined on the LTR side - Devanagari is Bidi_Class L and never
    // needed this.
    const { glyphs, positions } = rtl
      ? fk.layout(text, undefined, undefined, undefined, 'rtl')
      : fk.layout(text);
    return glyphs.map((g, i) => ({ path: g.path.toSVG(), pos: positions[i] }));
  }

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = canvasWidth; c.height = canvasHeight;
    return c.getContext('2d');
  }

  function ink(ctx) {
    return ctx.getImageData(0, 0, canvasWidth, canvasHeight).data;
  }

  function drawNative(text) {
    const ctx = makeCanvas();
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.font = `${size}px "${family}"`;
    if (rtl) { ctx.direction = 'rtl'; ctx.textAlign = 'right'; }
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'black';
    ctx.fillText(text, anchorX, baselineY);
    return { ctx, width: ctx.measureText(text).width };
  }

  function drawReconstruction(glyphList, totalWidth) {
    const ctx = makeCanvas();
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    const scale = size / fk.unitsPerEm;
    const start = rtl ? anchorX - totalWidth : anchorX;
    let pen = start;
    for (const g of glyphList) {
      ctx.save();
      ctx.translate(pen + g.pos.xOffset * scale, baselineY - g.pos.yOffset * scale);
      ctx.scale(scale, -scale);
      ctx.fillStyle = 'black';
      ctx.fill(new Path2D(g.path));
      ctx.restore();
      pen += g.pos.xAdvance * scale;
    }
    return { ctx, width: pen - start };
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

  function evalOne(text) {
    const glyphs = shape(text);
    const native = drawNative(text);
    const recon = drawReconstruction(glyphs, native.width);
    const diffPct = pixelDiffPct(ink(native.ctx), ink(recon.ctx));
    return {
      text,
      diffPct,
      widthDiff: Math.abs(native.width - recon.width),
      glyphCount: glyphs.length,
      nativeWidth: native.width,
      reconWidth: recon.width,
    };
  }

  const noiseFloorPct = Math.max(...calibrationSet.map((text) => evalOne(text).diffPct));
  const cases = corpus.map(({ id, text }) => ({ id, ...evalOne(text) }));

  return { noiseFloorPct, cases };
}

/**
 * Wires the above into one Playwright `test.describe` block: builds the
 * bundle, runs the harness in the page, judges every case against a
 * tolerance derived from the measured noise floor, and reports failures with
 * enough detail (diff%, width delta, glyph count) to debug without rerunning.
 * Each per-script spec file reduces to a call to this with its own corpus,
 * calibration set, and geometry.
 *
 * @param {object} config
 * @param {string} config.scriptName - e.g. 'Devanagari', used in test/describe names and console logs
 * @param {string} config.candidateName - e.g. 'Kalam', for the describe title
 * @param {string} config.fontFileName - e.g. 'Kalam-Regular.ttf', served from /fonts/
 * @param {'ltr'|'rtl'} [config.direction]
 * @param {number} config.size
 * @param {number} config.canvasWidth
 * @param {number} config.canvasHeight
 * @param {number} config.anchorX
 * @param {number} config.baselineY
 * @param {{id: string, text: string}[]} config.corpus
 * @param {string[]} config.calibrationSet
 * @param {number} [config.noiseFloorMultiplier] - default 1.5, matching both existing guards
 * @param {number} config.minTolerancePct - absolute floor under the multiplier; see each spec's own reasoning for its value
 * @param {import('@playwright/test').test} test
 * @param {import('@playwright/test').expect} expect
 */
export function createShapingGuardTest({
  scriptName,
  candidateName,
  fontFileName,
  direction = 'ltr',
  size,
  canvasWidth,
  canvasHeight,
  anchorX,
  baselineY,
  corpus,
  calibrationSet,
  noiseFloorMultiplier = 1.5,
  minTolerancePct,
  test,
  expect,
}) {
  const bundleFilename = `__e2e-${scriptName.toLowerCase()}-fontkit-bundle.js`;
  let bundlePath;

  test.beforeAll(async () => {
    bundlePath = await buildFontkitBundle(bundleFilename);
  });

  test.afterAll(() => {
    removeFontkitBundle(bundlePath);
  });

  test.describe(`${scriptName} shaping correctness guard (${candidateName} candidate)`, () => {
    test(`fontkit's shaped ${candidateName} output pixel-matches the browser's own rendering across ${corpus.length} generated cases`, async ({ page }) => {
      await page.goto('/sign');
      await page.addScriptTag({ url: `/${bundleFilename}` });

      const result = await page.evaluate(runShapingGuardInPage, {
        corpus,
        calibrationSet,
        fontUrl: `/fonts/${fontFileName}`,
        family: `${candidateName}GuardTest`,
        size,
        canvasWidth,
        canvasHeight,
        anchorX,
        baselineY,
        direction,
      });

      const tolerancePct = Math.max(minTolerancePct, result.noiseFloorPct * noiseFloorMultiplier);
      const failures = result.cases.filter((c) => c.diffPct > tolerancePct);

      console.log(`${scriptName} guard: ${result.cases.length} cases, noise floor ${result.noiseFloorPct.toFixed(2)}%, tolerance ${tolerancePct.toFixed(2)}%, ${failures.length} failing`);
      if (failures.length) {
        console.log('Failing cases:', failures.map((f) => `${f.id} "${f.text}": diff=${f.diffPct.toFixed(2)}% widthDiff=${f.widthDiff.toFixed(2)}px glyphs=${f.glyphCount} nativeWidth=${f.nativeWidth.toFixed(2)} reconWidth=${f.reconWidth.toFixed(2)}`).join('\n'));
      }

      expect(failures, `${failures.length}/${result.cases.length} cases exceeded tolerance (noise floor ${result.noiseFloorPct.toFixed(2)}%, tolerance ${tolerancePct.toFixed(2)}%): ${failures.map((f) => f.id).join(', ')}`).toEqual([]);
    });
  });
}
