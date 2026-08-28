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
 * @param {string[]} [config.calibrationSet] - fixed calibration strings. Mutually
 *   exclusive with `autoCalibrate`; exactly one of the two must be given.
 * @param {boolean} [config.autoCalibrate] - self-calibrating mode (see
 *   `partitionBySubstitution` below): partitions `corpus` itself into
 *   non-substituting strings (used as the calibration set) and substituting
 *   strings (used as the cases under test), instead of taking a hand-picked
 *   `calibrationSet`. Use this when the corpus is long, realistic strings
 *   rather than single glyphs, so the calibration set has the same kind of
 *   ink as what it's calibrating - see latin-shaping-guard.spec.js for why
 *   single-character calibration understates noise on thin handwriting faces.
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
  corpus, calibrationSet, autoCalibrate, fontUrl, family, size, canvasWidth, canvasHeight, anchorX, baselineY, direction,
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

  // Read-only metadata (unitsPerEm never changes and is never touched by the
  // corruption below), so one shared instance is fine for this alone. Every
  // *shaping* call below gets its own fresh instance instead - see the note
  // on `shape()`.
  const fk = window.__fontkit.create(fontBytes);
  const rtl = direction === 'rtl';

  // Does fontkit's shaper apply any contextual substitution (calt, liga, ...)
  // to this string, or does it choose exactly the glyph a plain per-codepoint
  // cmap lookup would? Same method the module doc and the Latin guard's
  // module comment describe: shape once with layout(), look up each codepoint
  // once with glyphForCodePoint(), and compare glyph id sequences. Equal
  // sequences mean no contextual decision was made for this string in this
  // font, so any pixel diff on it is pure rendering noise, not a letterform
  // disagreement - exactly the property a calibration string needs.
  //
  // Fresh `fontkit.create()` per call, same reason `shape()` below takes one
  // fresh per call - see that comment.
  function substituted(text) {
    const localFk = window.__fontkit.create(fontBytes);
    const shapedIds = localFk.layout(text).glyphs.map((g) => g.id);
    const plainIds = Array.from(text).map((ch) => localFk.glyphForCodePoint(ch.codePointAt(0)).id);
    if (shapedIds.length !== plainIds.length) return true;
    return shapedIds.some((id, i) => id !== plainIds[i]);
  }

  // A fresh `fontkit.create()` per call, not one shared instance reused
  // across the whole run. Found empirically while adding the Bengali guard:
  // accessing `glyph.path` (needed below to reconstruct the glyph outline on
  // canvas) on certain glyphs left the shared Font object's internal state
  // such that a *later*, unrelated `layout()` call on a completely different
  // string returned a wrong glyph sequence - e.g. shaping "ঢা" alone and in
  // isolation always produced the correct two glyphs, but the same call
  // after this function had already drawn roughly a dozen other Bengali
  // strings from the same Font object inserted a spurious dotted-circle
  // glyph (fontkit's "this mark has no valid base" glyph), as if the AA
  // vowel sign had stopped being recognized as attached to its consonant.
  // Bisected to reproduce from `.path` access alone (not from `layout()`
  // calls by themselves, however many - a loop of bare `layout()` calls with
  // no `.path` access never corrupts anything) and to require no specific
  // *pair* of strings, only "some earlier `.path` access happened on this
  // instance" - consistent with an internal cache keyed too coarsely inside
  // fontkit's own glyph/outline handling, not a Noto Sans Bengali defect and
  // not a real disagreement between fontkit's shaper and Chromium's. It also
  // does not reach production: `signPdf`'s actual embedding path never calls
  // `.path` (pdf-lib copies `glyf` bytes directly), so this is a hazard of
  // this test harness's canvas-reconstruction method, not of the exported
  // PDF. A fresh instance per call costs a cheap re-parse (hundreds of calls
  // per guard run, well under a second total) and fully isolates each
  // measurement from every other one, which is what "does fontkit's shaped
  // output for *this* string match" should mean.
  function shape(text) {
    const localFk = window.__fontkit.create(fontBytes);
    // Explicit direction on the RTL side, matching how the export path calls
    // layout() on a run resolveBidiRuns has already classified (see
    // src/editor/registry/text.ts) rather than leaving fontkit to guess.
    // Left undefined on the LTR side - Devanagari is Bidi_Class L and never
    // needed this.
    const { glyphs, positions } = rtl
      ? localFk.layout(text, undefined, undefined, undefined, 'rtl')
      : localFk.layout(text);
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

  if (autoCalibrate) {
    // Partition the corpus itself rather than take a hand-picked calibration
    // set: strings fontkit shapes identically to a plain cmap lookup are the
    // calibration set (realistic ink, zero shaping ambiguity by
    // construction); strings it substitutes on are the actual cases under
    // test, because those are the only ones where fontkit and the browser
    // could disagree on a letterform. Returned as counts/ids rather than
    // judged here, so the Node side can fail loudly on the degenerate cases
    // (too few or zero non-substituting strings) before spending an
    // `expect()` on a meaningless comparison.
    const nonSubstituting = [];
    const substituting = [];
    for (const entry of corpus) {
      (substituted(entry.text) ? substituting : nonSubstituting).push(entry);
    }
    return {
      autoCalibrate: true,
      nonSubstitutingCount: nonSubstituting.length,
      substitutingCount: substituting.length,
      noiseFloorPct: nonSubstituting.length
        ? Math.max(...nonSubstituting.map((entry) => evalOne(entry.text).diffPct))
        : 0,
      cases: substituting.map(({ id, text }) => ({ id, ...evalOne(text) })),
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
 * @param {string[]} [config.calibrationSet] - see `runShapingGuardInPage`'s doc.
 *   Exactly one of `calibrationSet`/`autoCalibrate` must be given.
 * @param {boolean} [config.autoCalibrate] - see `runShapingGuardInPage`'s doc.
 * @param {number} [config.minNonSubstitutingCount] - only used with
 *   `autoCalibrate`; default 5. Below this, the corpus doesn't have enough
 *   zero-ambiguity strings to calibrate a noise floor from, and the test
 *   fails explaining that rather than calibrating from too few samples.
 * @param {number} [config.noiseFloorMultiplier] - default 1.5, matching both existing guards
 * @param {number} config.minTolerancePct - absolute floor under the multiplier; see each spec's own reasoning for its value
 * @param {string} [config.bundleFilename] - overrides the default
 *   `__e2e-<scriptName>-fontkit-bundle.js` derived filename. Needed when more
 *   than one guard shares a `scriptName` - four Latin `calt`-face guards
 *   (Pacifico, Caveat, Great Vibes, Dancing Script; see
 *   latin-shaping-guard.spec.js) all say "Latin" and would otherwise collide
 *   on the same file, and `beforeAll`/`afterAll` are registered per call at
 *   file scope, not nested under a shared describe, so two guards racing on
 *   one path can delete the bundle out from under the other's still-running
 *   test. Defaults to exactly the prior expression, so every existing
 *   single-guard-per-script caller (Devanagari, Arabic) is unaffected.
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
  autoCalibrate = false,
  minNonSubstitutingCount = 5,
  noiseFloorMultiplier = 1.5,
  minTolerancePct,
  bundleFilename = `__e2e-${scriptName.toLowerCase()}-fontkit-bundle.js`,
  test,
  expect,
}) {
  if (!calibrationSet === !autoCalibrate) {
    throw new Error(`${scriptName}/${candidateName}: pass exactly one of calibrationSet or autoCalibrate`);
  }

  let bundlePath;

  test.beforeAll(async () => {
    bundlePath = await buildFontkitBundle(bundleFilename);
  });

  test.afterAll(() => {
    removeFontkitBundle(bundlePath);
  });

  test.describe(`${scriptName} shaping correctness guard (${candidateName} candidate)`, () => {
    const title = autoCalibrate
      ? `fontkit's shaped ${candidateName} output pixel-matches the browser's own rendering on every corpus string where fontkit applied a contextual substitution`
      : `fontkit's shaped ${candidateName} output pixel-matches the browser's own rendering across ${corpus.length} generated cases`;

    test(title, async ({ page }) => {
      await page.goto('/sign');
      await page.addScriptTag({ url: `/${bundleFilename}` });

      const result = await page.evaluate(runShapingGuardInPage, {
        corpus,
        calibrationSet,
        autoCalibrate,
        fontUrl: `/fonts/${fontFileName}`,
        family: `${candidateName}GuardTest`,
        size,
        canvasWidth,
        canvasHeight,
        anchorX,
        baselineY,
        direction,
      });

      if (autoCalibrate) {
        console.log(`${scriptName}/${candidateName} guard (self-calibrating): ${result.nonSubstitutingCount} non-substituting (calibration), ${result.substitutingCount} substituting (under test), of ${corpus.length} corpus strings`);
        // A face with too few zero-ambiguity strings to calibrate from would
        // silently calibrate off a handful of samples, or - at zero - divide
        // by nothing meaningful. Fail explicitly instead of computing a
        // tolerance that looks real but isn't backed by enough evidence.
        if (result.nonSubstitutingCount < minNonSubstitutingCount) {
          expect(result.nonSubstitutingCount, `${scriptName}/${candidateName}: only ${result.nonSubstitutingCount} of ${corpus.length} corpus strings shape with no substitution (need >= ${minNonSubstitutingCount} to calibrate a noise floor). Extend the corpus with strings that provably don't substitute in this font, or supply a hand-picked calibrationSet instead.`).toBeGreaterThanOrEqual(minNonSubstitutingCount);
        }
        // Zero substituting strings means this run tested nothing - every
        // corpus string shaped identically to a plain cmap lookup, so there
        // was no case where fontkit and the browser could have disagreed on
        // a letterform. That is a fact worth knowing, not a pass.
        if (result.substitutingCount === 0) {
          expect(result.substitutingCount, `${scriptName}/${candidateName}: 0 of ${corpus.length} corpus strings trigger any contextual substitution in fontkit, so this guard has nothing to test for this face - it is not proof of agreement. Extend the corpus with strings known to trigger this face's calt/liga features, or drop this face from the guard with that reasoning recorded.`).toBeGreaterThan(0);
        }
      }

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
