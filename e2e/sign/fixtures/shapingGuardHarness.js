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
 * **Why the fetch is also routed through `page.route`, not left to hit the
 * preview server directly (SIGN-21).** `npm run preview` (what
 * `playwright.config.js`'s `webServer` runs) is Vite's preview server, which
 * serves `dist/` via `sirv` in its non-dev mode: `sirv` snapshots the
 * directory's file list exactly once, at server startup (its `totalist`
 * scan), and answers every request from that snapshot rather than checking
 * the filesystem live. `buildFontkitBundle` writes the bundle in a
 * Playwright `beforeAll`, which necessarily runs after the server this test
 * run's `webServer` block already started - so the file is genuinely on
 * disk but invisible to the snapshot, and `page.addScriptTag` 404s. Each
 * caller therefore also registers `page.route('**\/' + bundleFilename, ...)`
 * fulfilling straight from `bundlePath` before navigating, which answers the
 * request from that same file without ever depending on the server's stale
 * listing. The write-to-`dist`/cleanup half of the mechanism is unchanged -
 * this only changes how the browser's request for that file is answered.
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
 *
 * ## Two artefacts, measured separately (SIGN-19)
 *
 * These guards read differently on macOS and on the Linux CI runner, and the
 * reason is two distinct artefacts of the measuring instrument, not one. Both
 * were measured on both platforms on `b4ffd96`; the full record, including the
 * configurations that were tried and rejected, is in
 * `docs/shaping-guard-platform-calibration.md`. Neither is a property of the
 * exported PDF, and **there are no Linux users** - Linux is the build machine -
 * so where the runner's rasteriser disagrees with a user's, the runner is the
 * instrument to correct, never the fidelity target to calibrate towards.
 *
 * 1. **Glyph rasteriser mismatch.** `fillText` normally draws from Skia's
 *    cached glyph bitmaps while the reconstruction fills outlines through
 *    `Path2D`, so the two disagree along every antialiased edge. This is the
 *    dominant term on macOS (Arabic floor 14.89%) and small on Linux (2.76%).
 *    It is **removed by rendering large**: above Skia's bitmap-glyph size
 *    limit (~256px) `fillText` itself rasterises via paths, so both sides go
 *    through one rasteriser and the floor collapses to **0.00% on both
 *    platforms**. Confirmed independently by two fonts - Scheherazade New is
 *    clean at 320px but not at 240px, Noto Sans Bengali is already clean at
 *    300px - which is why the guards below render at 320px and 400px rather
 *    than at a size chosen for legibility. Do not lower these sizes back
 *    toward a "normal" one; the size is doing load-bearing work.
 *
 * 2. **Advance quantisation.** Linux Chromium reports whole-pixel
 *    `measureText` advances (FreeType hinting), so it places each glyph up to
 *    a pixel away from the shaped position; macOS reports advances that match
 *    fontkit's to floating-point precision (measured: widthDiff 0.00 on
 *    151/151 Arabic cases). The error accumulates with glyph count, which is
 *    exactly what a single-glyph calibration set cannot see - on Linux at the
 *    old size the measured diff on zero-ambiguity ink ran 1.35% at one glyph
 *    to 17.13% at seventeen, against a calibrated floor of 2.76%. This one is
 *    **not removable**: it survives every render size and every flag tried
 *    (`--enable-font-subpixel-positioning`, deviceScaleFactor 2,
 *    `--force-device-scale-factor=2`; 40/40 sampled strings integral in all of
 *    them). So it is measured instead, by `measureDisplacementFloorPct`, and
 *    admitted into the floor - and it measures to zero on a platform that does
 *    not quantise, so it costs macOS nothing. The placement it measures the
 *    cost of is the browser's own: each glyph's hinted advance is read back
 *    through `measureText` (`hintedAdvancePx`), because the runner does not
 *    round the way `Math.round` does - its advances are within 0.50px of
 *    fontkit's everywhere, but a half-pixel tie goes down, and on Amatic SC's
 *    "12.09.2026" that is 845px against the 846px round-to-nearest predicted
 *    (fontkit: 847.8px), enough to fail the case at 28.21% against 27.06%.
 *    Only the rasteriser's advance for one glyph is measured; every shaping
 *    decision stays fontkit's, so this cannot absorb a shaper disagreement,
 *    and glyphs with no cmap entry keep the round-to-nearest model. The run's
 *    log says how many were which, and how many native widths the model
 *    reproduces exactly (run 34717406027: all of them on every guard but the
 *    ones with a known advance divergence or a fallback-modelled glyph).
 *
 * The rule that follows, and the one to keep: **an artefact gets removed from
 * the instrument if it can be, and measured if it cannot. It never gets
 * absorbed into a hand-picked tolerance.** `minTolerancePct` is a floor under
 * the measurement, not a substitute for it.
 */
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { useTemporaryBundle } from './temporaryBundle.js';

/**
 * Bundles fontkit (+ regenerator-runtime) for the browser and writes it into
 * the built `dist/` so a same-origin `<script src>` can fetch it under CSP.
 * Pass this as `build` to `useTemporaryBundle`, alongside
 * `removeFontkitBundle`. The fixture owns creation, same-origin routing, and
 * cleanup so callers cannot omit the routing step the preview server needs.
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
  const fk = window['__fontkit'].create(fontBytes);
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
    const localFk = window['__fontkit'].create(fontBytes);
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
    const localFk = window['__fontkit'].create(fontBytes);
    // Explicit direction on the RTL side, matching how the export path calls
    // layout() on a run resolveBidiRuns has already classified (see
    // src/editor/registry/text.ts) rather than leaving fontkit to guess.
    // Left undefined on the LTR side - Devanagari is Bidi_Class L and never
    // needed this.
    const { glyphs, positions } = rtl
      ? localFk.layout(text, undefined, undefined, undefined, 'rtl')
      : localFk.layout(text);
    return glyphs.map((g, i) => ({
      id: g.id,
      advanceWidth: g.advanceWidth,
      path: g.path.toSVG(),
      pos: positions[i],
    }));
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

  // One context kept only for `measureText`, so measuring a glyph's advance
  // does not allocate and clear a full-size canvas per glyph.
  const measureCtx = makeCanvas();
  measureCtx.font = `${size}px "${family}"`;

  // The browser's own advance for one glyph, measured rather than modelled.
  //
  // A hinting rasteriser does not round an advance the way `Math.round`
  // does. Measured on the CI runner (run 34717406027) the browser's advance
  // sits within 0.50px of fontkit's for every glyph in every guard, so it is
  // rounding and nothing more - but FreeType's fixed-point scaling resolves
  // an exact half-pixel tie downward where `Math.round` goes up (Amatic SC's
  // "1" at 300px is 82.5px: the runner says 82, the first version of this
  // model said 83), and one such glyph is the pixel between the runner's
  // 845px for "12.09.2026" and the 846px the model predicted; that pixel
  // failed the case at 28.21% against a 27.06% tolerance whose floor had
  // assumed round-to-nearest. Guessing at the tie rule would be modelling
  // again, so the hinted advance is read from the browser per glyph instead,
  // through `measureText` of the one character whose plain cmap glyph it
  // is, and the model uses that.
  //
  // What keeps this non-circular: the measurement is of the *rasteriser's*
  // treatment of one glyph's advance width, taken on that glyph alone. Every
  // shaping decision - which glyph, the kerning, the mark offsets - still
  // comes from fontkit, so a shaper disagreement on any of those is not
  // absorbed. Two things are refused so that stays true: a glyph fontkit
  // would substitute even in isolation (the browser might be measuring a
  // different glyph), and a measured advance more than
  // `HINTED_ADVANCE_SANITY_PX` from fontkit's hmtx value (hinting moves an
  // advance by well under a pixel beyond rounding; anything larger is a
  // dotted circle the browser inserted for a lone mark, a fallback font, or
  // a genuine metrics disagreement, none of which belongs in a noise floor).
  // Glyphs with no cmap entry of their own - contextual forms, conjuncts,
  // ligatures - cannot be measured this way and keep the round-to-nearest
  // model. The counts of each are reported, so a run says how much of its
  // floor was measured and how much was modelled.
  const HINTED_ADVANCE_SANITY_PX = 1.5;
  const cmapGlyphToCodePoint = new Map();
  {
    const localFk = window['__fontkit'].create(fontBytes);
    for (const cp of localFk.characterSet) {
      const id = localFk.glyphForCodePoint(cp).id;
      if (!cmapGlyphToCodePoint.has(id)) cmapGlyphToCodePoint.set(id, cp);
    }
  }
  const hintedAdvanceCache = new Map(); // glyph id -> { px, reason }
  const hintedAdvanceStats = { measured: 0, unmeasurable: 0, substituted: 0, rejected: 0, maxDeltaPx: 0 };
  function hintedAdvancePx(glyph) {
    if (hintedAdvanceCache.has(glyph.id)) return hintedAdvanceCache.get(glyph.id);
    const scale = size / fk.unitsPerEm;
    const exactPx = glyph.advanceWidth * scale;
    let entry;
    const cp = cmapGlyphToCodePoint.get(glyph.id);
    if (cp === undefined) {
      entry = { px: null, reason: 'unmeasurable' };
    } else {
      const ch = String.fromCodePoint(cp);
      if (substituted(ch)) {
        entry = { px: null, reason: 'substituted' };
      } else {
        const measuredPx = measureCtx.measureText(ch).width;
        const deltaPx = Math.abs(measuredPx - exactPx);
        if (deltaPx > HINTED_ADVANCE_SANITY_PX) {
          entry = { px: null, reason: 'rejected' };
        } else {
          entry = { px: measuredPx, reason: 'measured' };
          hintedAdvanceStats.maxDeltaPx = Math.max(hintedAdvanceStats.maxDeltaPx, deltaPx);
        }
      }
    }
    hintedAdvanceStats[entry.reason]++;
    hintedAdvanceCache.set(glyph.id, entry);
    return entry;
  }

  // What a browser that quantises advances places this glyph's pen advance
  // at: the browser's own hinted advance for the glyph where it could be
  // measured, plus fontkit's kerning for this position rounded the way the
  // browser rounds a run's advances (a quantising browser reports integral
  // widths on kerned strings too, so the kern is not left fractional);
  // otherwise fontkit's advance rounded to the nearest pixel.
  function quantisedAdvancePx(g) {
    const scale = size / fk.unitsPerEm;
    const hinted = hintedAdvancePx(g);
    if (hinted.px === null) return Math.round(g.pos.xAdvance * scale);
    const kernPx = (g.pos.xAdvance - g.advanceWidth) * scale;
    return hinted.px + Math.round(kernPx);
  }

  // `quantizeAdvances` reproduces what a browser that hints advances to whole
  // pixels does to glyph positions (see `measureDisplacementFloorPct` below
  // and this file's "Two artefacts" note): every glyph's advance is replaced
  // by `quantisedAdvancePx` (the browser's own hinted advance where it can
  // be measured, whole-pixel rounding where it cannot), and - since RTL
  // anchors from the right - the run starts from the quantised total rather
  // than the exact one, so the whole-string offset is reproduced as well as
  // the per-glyph jitter. Modelling only the jitter under-measures the
  // artefact, which is how the first version of this floor left five
  // Arabic/Pashto cases failing on ~1px of width disagreement.
  //
  // Only ever used to measure that artefact's cost against the
  // reconstruction's own unrounded self - never to judge fontkit.
  function drawReconstruction(glyphList, totalWidth, quantizeAdvances = false) {
    const ctx = makeCanvas();
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    const scale = size / fk.unitsPerEm;
    const advanceOf = (g) => (quantizeAdvances
      ? quantisedAdvancePx(g)
      : g.pos.xAdvance * scale);
    const runWidth = quantizeAdvances
      ? glyphList.reduce((sum, g) => sum + advanceOf(g), 0)
      : totalWidth;
    const start = rtl ? anchorX - runWidth : anchorX;
    let pen = start;
    for (const g of glyphList) {
      ctx.save();
      ctx.translate(pen + g.pos.xOffset * scale, baselineY - g.pos.yOffset * scale);
      ctx.scale(scale, -scale);
      ctx.fillStyle = 'black';
      ctx.fill(new Path2D(g.path));
      ctx.restore();
      pen += advanceOf(g);
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
    // Clipping check. Every string has to fit the canvas, or the comparison
    // silently runs on partial ink and both sides agree about the part that
    // was cut off - a guard measuring less than it claims to. This is cheap
    // and catches a corpus or a geometry change that outgrew its canvas.
    const overflowsCanvas = rtl
      ? anchorX - native.width < 0 || anchorX > canvasWidth
      : anchorX + native.width > canvasWidth;
    // The quantised model's own total, next to the native one: on a
    // quantising browser this is the check that the model reproduces the
    // browser's placement (a residual of 0.00px on a string whose glyphs
    // were all measured means the artefact is fully accounted for; a
    // residual on one where some were modelled says how much the
    // round-to-nearest fallback misses). Never enters the judgment.
    const quantisedWidth = glyphs.reduce((sum, g) => sum + quantisedAdvancePx(g), 0);
    return {
      text,
      diffPct,
      widthDiff: Math.abs(native.width - recon.width),
      quantisedWidthResidual: Math.abs(native.width - quantisedWidth),
      glyphCount: glyphs.length,
      nativeWidth: native.width,
      reconWidth: recon.width,
      overflowsCanvas,
    };
  }

  /**
   * The cost, in this guard's own metric, of the browser rounding each glyph's
   * pen position to a whole pixel.
   *
   * Measured by rendering each string's reconstruction twice from the SAME
   * fontkit output - once at fontkit's exact positions, once with every glyph
   * advance replaced by the quantised one a hinting rasteriser reports (the
   * browser's own hinted advance for that glyph where `hintedAdvancePx` could
   * measure it, whole-pixel rounding where it could not) - and diffing those
   * two against each other. The native rendering of the string is not
   * involved, so this can be measured over the corpus itself without
   * circularity: it asks "what does the browser's whole-pixel placement cost
   * on this ink", not "is fontkit right".
   *
   * Zero on a platform whose `measureText` is fractional, because there the
   * browser is not rounding and there is no artefact to admit. Detected rather
   * than assumed - see `browserQuantizesAdvances` below.
   */
  function measureDisplacementFloorPct(strings) {
    let worst = 0;
    const scale = size / fk.unitsPerEm;
    for (const text of strings) {
      const glyphs = shape(text);
      if (glyphs.length < 2) continue; // a single glyph has no pen to accumulate
      // Each placement model anchors from its OWN total, so the comparison is
      // "same glyphs, two placement models" and never touches the native
      // rendering. That is what keeps it non-circular, and it is why this may
      // be measured over the corpus rather than only over calibration ink.
      const exactWidth = glyphs.reduce((sum, g) => sum + g.pos.xAdvance * scale, 0);
      const exact = drawReconstruction(glyphs, exactWidth);
      const rounded = drawReconstruction(glyphs, exactWidth, true);
      worst = Math.max(worst, pixelDiffPct(ink(exact.ctx), ink(rounded.ctx)));
    }
    return worst;
  }

  // Does this browser report whole-pixel advances? Sampled rather than
  // declared, because it is a platform property that no command-line flag
  // was found to change (see the SIGN-19 record in
  // docs/shaping-guard-platform-calibration.md).
  function browserQuantizesAdvances(strings) {
    const sample = strings.slice(0, 40);
    if (!sample.length) return false;
    return sample.every((text) => {
      const w = drawNative(text).width;
      return Math.abs(w - Math.round(w)) < 1e-9;
    });
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
    const quantizes = browserQuantizesAdvances(corpus.map((entry) => entry.text));
    return {
      autoCalibrate: true,
      nonSubstitutingCount: nonSubstituting.length,
      substitutingCount: substituting.length,
      rasterFloorPct: nonSubstituting.length
        ? Math.max(...nonSubstituting.map((entry) => evalOne(entry.text).diffPct))
        : 0,
      quantizesAdvances: quantizes,
      displacementFloorPct: quantizes ? measureDisplacementFloorPct(corpus.map((entry) => entry.text)) : 0,
      cases: substituting.map(({ id, text }) => ({ id, ...evalOne(text) })),
      calibrationCases: nonSubstituting.map(({ id, text }) => ({ id, ...evalOne(text) })),
      hintedAdvanceStats,
    };
  }

  const calibrationCases = calibrationSet.map((text) => ({
    id: `calibration:${text}`,
    ...evalOne(text),
    substituted: substituted(text),
  }));
  const cases = corpus.map(({ id, text }) => ({ id, ...evalOne(text) }));
  const quantizes = browserQuantizesAdvances(corpus.map((entry) => entry.text));

  return {
    rasterFloorPct: Math.max(...calibrationCases.map((c) => c.diffPct)),
    quantizesAdvances: quantizes,
    // Measured over the corpus, not the calibration set, on purpose: for a
    // joining script every multi-glyph string substitutes, so there is no
    // multi-glyph calibration ink to measure a pen-accumulation artefact on.
    // This measurement never touches the native rendering, so using the
    // corpus for it is not circular. See `measureDisplacementFloorPct`.
    displacementFloorPct: quantizes ? measureDisplacementFloorPct(corpus.map((entry) => entry.text)) : 0,
    cases,
    calibrationCases,
    hintedAdvanceStats,
  };
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

  const fontkitBundle = useTemporaryBundle(test, {
    filename: bundleFilename,
    build: buildFontkitBundle,
    remove: removeFontkitBundle,
  });

  test.describe(`${scriptName} shaping correctness guard (${candidateName} candidate)`, () => {
    const title = autoCalibrate
      ? `fontkit's shaped ${candidateName} output pixel-matches the browser's own rendering on every corpus string where fontkit applied a contextual substitution`
      : `fontkit's shaped ${candidateName} output pixel-matches the browser's own rendering across ${corpus.length} generated cases`;

    test(title, async ({ page }) => {
      await fontkitBundle.open(page);

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

      // Nothing may be judged on ink the canvas cut off.
      const clipped = [...result.cases, ...(result.calibrationCases || [])].filter((c) => c.overflowsCanvas);
      expect(
        clipped.map((c) => c.id),
        `${scriptName}/${candidateName}: these strings do not fit the ${canvasWidth}x${canvasHeight} canvas at size ${size}, so both renderings agree about ink that was never drawn and the comparison understates any disagreement. Widen the canvas (and move anchorX with it) rather than leaving them clipped.`,
      ).toEqual([]);

      // A hand-picked calibration string that shapes through a contextual
      // substitution is not zero-ambiguity ink, so a floor measured from it
      // could be absorbing a real letterform disagreement instead of noise.
      if (!autoCalibrate) {
        const ambiguous = result.calibrationCases.filter((c) => c.substituted);
        expect(
          ambiguous.map((c) => c.text),
          `${scriptName}/${candidateName}: these calibration strings shape through a contextual substitution, so they are not the zero-shaping-ambiguity ink a noise floor has to be measured from - a real disagreement on one of them would silently raise the tolerance that is supposed to catch it. Replace them, or move this guard to autoCalibrate.`,
        ).toEqual([]);
      }

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

      // The floor is the worse of the two measured artefacts, each of which is
      // measured rather than declared and each of which is zero on a platform
      // that does not have it. See the "Two artefacts" note at the top.
      const noiseFloorPct = Math.max(result.rasterFloorPct, result.displacementFloorPct);
      const tolerancePct = Math.max(minTolerancePct, noiseFloorPct * noiseFloorMultiplier);
      const failures = result.cases.filter((c) => c.diffPct > tolerancePct);

      console.log(`${scriptName} guard: ${result.cases.length} cases, `
        + `rasteriser floor ${result.rasterFloorPct.toFixed(2)}%, `
        + `advance-quantisation floor ${result.displacementFloorPct.toFixed(2)}% `
        + `(browser quantises advances: ${result.quantizesAdvances}), `
        + `noise floor ${noiseFloorPct.toFixed(2)}%, tolerance ${tolerancePct.toFixed(2)}%, ${failures.length} failing`);
      // How much of the quantisation floor was measured against the browser's
      // own hinted advances and how much fell back to round-to-nearest, plus
      // the evidence that the model reproduces the browser's placement: the
      // widest gap between a corpus string's native width and the quantised
      // model's total. See `hintedAdvancePx` in `runShapingGuardInPage`.
      if (result.quantizesAdvances) {
        const stats = result.hintedAdvanceStats;
        const residuals = result.cases.map((c) => c.quantisedWidthResidual);
        const worst = result.cases.reduce((a, c) => (c.quantisedWidthResidual > a.quantisedWidthResidual ? c : a), result.cases[0]);
        console.log(`${scriptName} advance model: ${stats.measured} glyphs measured (max ${stats.maxDeltaPx.toFixed(2)}px from fontkit's advance), `
          + `${stats.unmeasurable} without a cmap entry and ${stats.substituted} substituted in isolation (round-to-nearest), ${stats.rejected} rejected; `
          + `native width reproduced on ${residuals.filter((r) => r < 0.01).length}/${residuals.length} cases, `
          + `worst residual ${worst ? `${worst.quantisedWidthResidual.toFixed(2)}px on ${worst.id}` : 'n/a'}`);
      }
      if (failures.length) {
        console.log('Failing cases:', failures.map((f) => `${f.id} "${f.text}": diff=${f.diffPct.toFixed(2)}% widthDiff=${f.widthDiff.toFixed(2)}px glyphs=${f.glyphCount} nativeWidth=${f.nativeWidth.toFixed(2)} reconWidth=${f.reconWidth.toFixed(2)}`).join('\n'));
      }

      expect(failures, `${failures.length}/${result.cases.length} cases exceeded tolerance (rasteriser floor ${result.rasterFloorPct.toFixed(2)}%, advance-quantisation floor ${result.displacementFloorPct.toFixed(2)}%, tolerance ${tolerancePct.toFixed(2)}%): ${failures.map((f) => f.id).join(', ')}`).toEqual([]);
    });
  });
}
