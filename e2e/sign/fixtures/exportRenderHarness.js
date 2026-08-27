/**
 * @file exportRenderHarness.js
 * @description Machinery for W1: render the PDF `signPdf` actually produces
 * and compare the ink against a stored per-case baseline.
 *
 * Nothing in this repo did that before. `sign.test.js` parses the exported
 * bytes with pdf.js and reads text *items*, which is a real check and is not
 * this one - it reads what the file *says*, never what it *draws*. Every one
 * of the four defects that got through here (a substituted font, a corrupted
 * `glyf`, a subset missing composite components, a subset missing a glyph)
 * left the text items intact and the ink wrong, and every one of them passed
 * `pdffonts`, `pdftotext` and a zero exit code. See TODO.md, W1, and
 * docs/wysiwyg-text-architecture.md §8 stage 1.
 *
 * ---
 *
 * ## Three constraints, each of which has already cost this project a wrong
 * ## answer
 *
 * **1. Never "is there ink?" as a pass condition.** `.notdef` is commonly a
 * filled box, and a filled box draws *more* ink than the glyph it replaced -
 * so a regression can raise the number an ink-presence check looks at. The
 * pass condition here is a *shaped* comparison against a per-case baseline:
 * where the ink is, cell by cell, not how much of it there is. The only place
 * total ink appears at all is inside the normalisation denominator of the
 * distance metric, and a case whose ink went to zero fails on distance and on
 * non-vacuity both.
 *
 * **2. One rasteriser.** The produced PDF is rasterised with pdf.js *inside
 * the Playwright browser*, and the baseline it is compared against was
 * captured the same way. Cross-rasteriser diffing - poppler's output against
 * Chromium's - was measured and rejected in
 * docs/hebrew-text-shaping-export.md at a noise floor of 80-88%, per font. Do
 * not reintroduce it here in the belief that a second renderer is a second
 * opinion; at that noise floor it is not an opinion at all.
 *
 * **3. A non-vacuity assertion.** Distinct cases must produce distinct
 * signatures. The failure this guards against is the one that already
 * happened once, to the font-loading probe that compared one system font
 * against itself seven times and reported perfect agreement: a harness that
 * silently measures the same thing every time passes forever and proves
 * nothing. `judgeCases` below fails when any two cases land closer together
 * than `NON_VACUITY_MARGIN` x the tolerance, and reports which pair.
 *
 * `NON_VACUITY_MARGIN` is derived, not chosen. The property this guard
 * actually needs is that under the maximum drift it tolerates, every case
 * stays strictly closer to its own baseline than to any other case's
 * baseline - otherwise a drifted case could land nearer a neighbour's
 * baseline than its own, and a regression would silently read as "this is
 * actually that other case." By the triangle inequality, that holds exactly
 * when every pair of distinct cases sits more than `2 x tolerancePct` apart:
 * if a case can drift by up to `tolerancePct` and the two baselines are more
 * than `2 x tolerancePct` apart, the drifted signature cannot have crossed
 * the midpoint. So `NON_VACUITY_MARGIN = 2`, and the margin now scales
 * correctly with tolerance instead of fighting it - raising the tolerance
 * (for a real cross-platform reason) no longer tightens what the corpus has
 * to clear, because the same multiplier is the one the derivation requires
 * regardless of what the tolerance is set to.
 *
 * ---
 *
 * ## The signature, and why it has the shape it has
 *
 * A page is rasterised at `RENDER_SCALE`, reduced to per-pixel ink (`255 -
 * luminance` over a white ground, so colour reaches the measure), then
 * averaged into a fixed `GRID_COLS` x `GRID_ROWS` grid over the **whole
 * page** - never over the ink's bounding box, which would normalise away
 * exactly the positioning regressions this is for. Each cell is quantised to
 * one byte and the grid is stored base64, which is what keeps a 20-case
 * baseline a 30KB file rather than a 500KB one.
 *
 * Averaging into cells is also what makes the baseline portable. Grayscale
 * antialiasing and hinting differ between a developer's macOS and CI's Linux,
 * at sub-pixel to one-pixel scale; a cell is ~26x33 device pixels, so those
 * differences average out to a fraction of a byte. Rendering at 3x rather
 * than 1x is part of the same decision - hinting has less influence the
 * further you get from the pixel grid.
 *
 * The distance between two signatures is a symmetric difference normalised by
 * the ink present in either:
 *
 *     100 * sum|a_i - b_i| / sum(max(a_i, b_i))
 *
 * the same shape as `shapingGuardHarness.js`'s `pixelDiffPct`, one level
 * coarser. It is relative on purpose: a defect is judged against how much ink
 * the case has, so a four-glyph string losing one glyph reads as ~25% rather
 * than as a number that depends on how long the string was.
 *
 * ## Tolerance
 *
 * `MIN_TOLERANCE_PCT` has to absorb the noise between *machines* - the
 * baseline is captured on macOS, CI runs on Linux, and glyph antialiasing and
 * hinting differ between the two at sub-pixel to one-pixel scale - and that
 * noise cannot be measured from inside one machine. There is no Docker on
 * this project's dev machine, so the real number was not available; instead
 * the floor is calibrated from a measured PROXY for it, which is the honest
 * middle ground between "declared from a hunch" and "measured for real."
 *
 * The proxy is two perturbations, run once over every corpus case, each one
 * standing in for a way a different rasteriser's sub-pixel handling could
 * move the same ink:
 *
 *   - **P1**, render scale: the same PDF rendered at `RENDER_SCALE` and at
 *     `RENDER_SCALE * 1.01`, signature-ed at the same grid. This perturbs
 *     where every glyph edge falls relative to the pixel grid, which is the
 *     dominant cross-platform effect. Measured maximum across the corpus:
 *     **5.43%** (`hebrew-heebo`).
 *   - **P2**, sub-pixel translation: the `RENDER_SCALE` render redrawn onto
 *     an offset canvas at 0.5 and 1 device pixel of translation, compared
 *     against the unshifted signature. Measured maximum: **4.17%** at 0.5px
 *     (`comb-ltr`), **8.18%** at 1px (`comb-ltr`).
 *
 * The worst measured value across both perturbations and the whole corpus
 * was **8.18%** (P2 at a full device pixel, `comb-ltr`). `MIN_TOLERANCE_PCT`
 * is that number times a **1.5x** multiplier - the same multiplier this file
 * already uses to turn the measured determinism noise floor into a
 * tolerance, so the two safety margins in this harness agree with each
 * other - rounded up to a clean **12.5**. The old declared floor of 8 did
 * NOT comfortably clear the measured proxy (8.18 > 8), so it was raised
 * rather than left in place with the measurement noted; an unmeasured floor
 * that happens to sit just under the real noise is worse than no floor,
 * because it reads as validated when it was not. The effective tolerance is
 * `max(MIN_TOLERANCE_PCT, noiseFloor * 1.5)`, so a real machine's
 * determinism noise can still raise it further if it is ever nonzero.
 *
 * If CI ever fails at a distance just above 12.5%, check the closest-pair
 * number the spec logs first: if it is still comfortably above `2 x
 * tolerancePct` (the non-vacuity property - see constraint 3 above), this
 * floor may simply be too low for a real difference seen on the CI machine
 * and needs re-measuring, ideally for real on Linux rather than by proxy. If
 * the closest pair is close to that bound instead, the corpus lost a case's
 * distinctness and the floor is not the problem.
 *
 * Do not raise this further "to be safe." A tolerance inflated past what
 * a measurement supports is a guard that quietly stops catching regressions
 * inside its own slack, which is the failure mode this whole file exists to
 * prevent.
 *
 * ## What this guard cannot see, stated so a green run is not over-read
 *
 * The metric is relative and the tolerance is 12.5%, so a defect smaller than
 * roughly an eighth of a case's total ink sits inside the slack and passes.
 * That covers one combining mark landing a point off its base, a baseline
 * shifted by a fraction of a point, a kern pair that moved slightly - real
 * defects this project has actually shipped, and none of which this guard
 * will report. Keeping every corpus string short is the one lever that buys
 * sensitivity back, which is why `exportRenderCorpus.js` says so at the top
 * and why a case that grows into a sentence is a case that stopped being able
 * to fail.
 *
 * That is a division of labour rather than a hole. The per-script shaping
 * guards (`hebrew-font-parity`, `arabic-shaping-guard`,
 * `devanagari-shaping-guard`) resolve differences far finer than this,
 * because they calibrate their noise floor in-session against the same
 * browser and never have to survive a second machine - but they compare
 * fontkit against Chrome before a PDF exists, and they never look at the
 * file. This one looks at the file, and what it resolves is the gross class:
 * a wrong or substituted font, a glyph missing or replaced by `.notdef`, text
 * drawn in the wrong place or not drawn at all, a corrupted outline, an
 * element silently dropped. Those are exactly the four defects that got
 * through here before, and every one of them is worth tens of percent.
 *
 * So do not cite a green run here as evidence of shaping fidelity, and do not
 * retire a per-script guard because this one covers the same font. They
 * answer different questions.
 *
 * ## Regenerating the baseline
 *
 *     UPDATE_EXPORT_RENDER_BASELINE=1 npx playwright test e2e/sign/export-render-guard
 *
 * Review the diff. A baseline change is a change to what users receive, so
 * "the guard went red so I regenerated it" is the one workflow this file
 * exists to prevent - the whole point of a stored baseline is that somebody
 * has to look.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

/** Page size in points for every case's blank source PDF. */
export const PAGE_WIDTH_PT = 420;
export const PAGE_HEIGHT_PT = 260;

/** pdf.js render scale. High enough that hinting stops dominating a pixel. */
export const RENDER_SCALE = 3;

/** Signature grid over the whole page. ~26x33 device pixels per cell. */
export const GRID_COLS = 48;
export const GRID_ROWS = 24;

/**
 * The floor under the measured-determinism tolerance, in the units of
 * `signatureDistancePct`. Calibrated from a measured cross-rasteriser proxy,
 * 1.5x the worst perturbation seen across the corpus. See "Tolerance" above
 * for the measurement, the multiplier, and how to tell whether a failure just
 * above it means the floor is wrong.
 */
export const MIN_TOLERANCE_PCT = 12.5;

/**
 * How far apart two distinct cases must sit, as a multiple of tolerance.
 * Derived from the triangle inequality, not chosen - see constraint 3 above.
 */
export const NON_VACUITY_MARGIN = 2;

/**
 * Bundles `signPdf` (plus pdf-lib and pdf.js) for the browser and writes it
 * into the built `dist/`, so a same-origin `<script src>` can fetch it under
 * the app's CSP - the same trick, and the same reason, as
 * `shapingGuardHarness.js`'s `buildFontkitBundle`: `script-src` has no
 * `unsafe-inline`, so `page.addScriptTag({ content })` is blocked outright
 * and `'self'` is what remains.
 *
 * Running the *real* `signPdf` rather than a reimplementation is the entire
 * value here. It pulls in the element registry, which pulls in Preact
 * components and their CSS Modules; those are stubbed below because the
 * export path never touches a class name, only `serialize`.
 */
export async function buildSignBundle(bundleFilename) {
  const distDir = join(process.cwd(), 'dist');
  if (!existsSync(distDir)) {
    throw new Error(`${distDir} does not exist. This guard runs the built site, so run \`npm run build\` before \`npx playwright test\` (\`npm run test:e2e\` does both).`);
  }
  const result = await build({
    stdin: {
      contents: `
        import 'regenerator-runtime/runtime.js';
        import { signPdf } from './src/lib/sign.js';
        import { PDFDocument } from '@cantoo/pdf-lib';
        import * as pdfjs from 'pdfjs-dist';
        window.__exportRender = { signPdf, PDFDocument, pdfjs };
      `,
      resolveDir: process.cwd(),
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    plugins: [cssModuleStubPlugin],
    write: false,
  });
  const bundlePath = join(distDir, bundleFilename);
  writeFileSync(bundlePath, result.outputFiles[0].text);
  return bundlePath;
}

/**
 * Replaces every CSS import with a Proxy that answers any key with its own
 * name. The registry's `render` functions read `styles.foo`; `serialize`, the
 * only half this guard exercises, reads none of it. Stubbing rather than
 * letting esbuild emit a stylesheet keeps `dist/` free of a stray CSS file
 * that a later `npm run preview` would serve and
 * `generate-precache-manifest.mjs` could sweep up.
 */
const cssModuleStubPlugin = {
  name: 'css-module-stub',
  setup(b) {
    b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'css-module-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'css-module-stub' }, () => ({
      contents: 'export default new Proxy({}, { get: (_t, key) => String(key) });',
      loader: 'js',
    }));
  },
};

export function removeSignBundle(bundlePath) {
  if (bundlePath) rmSync(bundlePath, { force: true });
}

/**
 * The already-built, content-hashed pdf.js worker Astro emitted, as a
 * same-origin URL. pdf.js needs an explicit `workerSrc` here because
 * `sign.js`'s own `getPdfjs()` resolves it through Vite's
 * `new URL(..., import.meta.url)` asset pattern, which esbuild does not
 * implement - it would produce a URL that 404s, and pdf.js would then fall
 * back to a fake worker that cannot load in an IIFE bundle.
 */
export function findPdfWorkerUrl() {
  const astroDir = join(process.cwd(), 'dist', '_astro');
  const matches = existsSync(astroDir)
    ? readdirSync(astroDir).filter((name) => /^pdf\.worker\.min\..*\.mjs$/.test(name))
    : [];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one built pdf.js worker in dist/_astro, found ${matches.length}. Run \`npm run build\`.`);
  }
  return `/_astro/${matches[0]}`;
}

/**
 * Runs inside the page via `page.evaluate`, so it must stay self-contained -
 * no closure over this module, only its argument and page globals.
 *
 * For each case: build a blank one-page PDF, run the real `signPdf` over its
 * element, rasterise page 1 with pdf.js, and reduce the pixels to a grid
 * signature. Returns raw signatures only; every pass/fail judgment stays on
 * the Node side (`judgeCases`) so it can be logged before `expect` runs.
 */
export async function captureSignaturesInPage({
  cases, pageWidthPt, pageHeightPt, renderScale, gridCols, gridRows, workerSrc,
}) {
  const { signPdf, PDFDocument, pdfjs } = window.__exportRender;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  async function blankPdfFile() {
    const doc = await PDFDocument.create();
    doc.addPage([pageWidthPt, pageHeightPt]);
    const bytes = await doc.save();
    return new File([bytes], 'blank.pdf', { type: 'application/pdf' });
  }

  async function rasterise(blob) {
    const data = new Uint8Array(await blob.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data });
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // A blank PDF page has no background of its own, and unpainted canvas is
    // transparent black - which would read as maximum ink everywhere. Paint
    // the sheet white first, the way a viewer does.
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // The loading task owns the worker port; the document does not expose a
    // destroy of its own in pdf.js 6. Left un-destroyed, 42 render passes
    // hold 42 documents' page data live at once.
    await loadingTask.destroy();
    return image;
  }

  /**
   * Mean ink per grid cell, quantised to a byte. Ink is `255 - luminance`
   * over the white ground, so a coloured glyph contributes in proportion to
   * how dark it is rather than being counted as absent.
   */
  function toSignature(image) {
    const { width, height, data } = image;
    const sums = new Float64Array(gridCols * gridRows);
    const counts = new Uint32Array(gridCols * gridRows);
    for (let y = 0; y < height; y++) {
      const row = Math.min(gridRows - 1, Math.floor((y * gridRows) / height));
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        const alpha = data[i + 3] / 255;
        // Composite onto white before measuring, so a partially transparent
        // pixel is the grey a viewer would actually show.
        const ink = (255 - luminance) * alpha;
        const cell = row * gridCols + Math.min(gridCols - 1, Math.floor((x * gridCols) / width));
        sums[cell] += ink;
        counts[cell] += 1;
      }
    }
    const bytes = new Uint8Array(gridCols * gridRows);
    for (let c = 0; c < bytes.length; c++) {
      bytes[c] = counts[c] ? Math.round(Math.min(255, sums[c] / counts[c])) : 0;
    }
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  async function signatureFor(element) {
    const blob = await signPdf(await blankPdfFile(), [element]);
    return toSignature(await rasterise(blob));
  }

  const results = [];
  for (const testCase of cases) {
    // Twice, independently, so the run measures its own determinism rather
    // than assuming it. See "Tolerance" in this file's header.
    const first = await signatureFor(testCase.element);
    const second = await signatureFor(testCase.element);
    results.push({ id: testCase.id, signature: first, repeatSignature: second });
  }
  return results;
}

/** Decodes a base64 signature back into its per-cell bytes. */
export function decodeSignature(base64) {
  const binary = Buffer.from(base64, 'base64');
  return Uint8Array.from(binary);
}

/**
 * Symmetric difference between two signatures, normalised by the ink present
 * in either, as a percentage. Two identical signatures are 0; two signatures
 * sharing no ink at all are 100.
 *
 * Deliberately NOT a comparison of ink totals - see constraint 1 in this
 * file's header. Two pages can carry the same amount of ink in entirely
 * different places, and this reports that as 100%, which is the point.
 */
export function signatureDistancePct(a, b) {
  let difference = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    difference += Math.abs(a[i] - b[i]);
    union += Math.max(a[i], b[i]);
  }
  return union ? (100 * difference) / union : 0;
}

export function readBaseline(baselinePath) {
  if (!existsSync(baselinePath)) return null;
  return JSON.parse(readFileSync(baselinePath, 'utf8'));
}

export function writeBaseline(baselinePath, results) {
  const payload = {
    // Recorded so a future reader can tell whether a baseline predates a
    // change to how the signature itself is computed. A mismatch here is not
    // a regression, it is an incomparable baseline, and `judgeCases` says so
    // rather than reporting 20 failures.
    format: {
      pageWidthPt: PAGE_WIDTH_PT,
      pageHeightPt: PAGE_HEIGHT_PT,
      renderScale: RENDER_SCALE,
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
    },
    cases: Object.fromEntries(results.map(({ id, signature }) => [id, signature])),
  };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`);
}

/** True when a stored baseline was captured by this same signature recipe. */
export function baselineFormatMatches(baseline) {
  const format = baseline?.format;
  return !!format
    && format.pageWidthPt === PAGE_WIDTH_PT
    && format.pageHeightPt === PAGE_HEIGHT_PT
    && format.renderScale === RENDER_SCALE
    && format.gridCols === GRID_COLS
    && format.gridRows === GRID_ROWS;
}

/**
 * Turns raw captures plus a stored baseline into everything the spec asserts
 * on. Judgment lives here rather than in the page so the spec can log the
 * whole picture - tolerance, closest pair, every drift - before any `expect`
 * short-circuits it.
 *
 * @returns {{
 *   noiseFloorPct: number, tolerancePct: number,
 *   missingFromBaseline: string[], staleInBaseline: string[],
 *   drifted: {id: string, distancePct: number}[],
 *   nondeterministic: {id: string, distancePct: number}[],
 *   closestPair: {a: string, b: string, distancePct: number} | null,
 *   ownBaselineViolations: {id: string, ownDistancePct: number, closerTo: string, otherDistancePct: number}[],
 * }}
 */
export function judgeCases(results, baseline) {
  const decoded = results.map(({ id, signature, repeatSignature }) => ({
    id,
    signature: decodeSignature(signature),
    repeat: decodeSignature(repeatSignature),
  }));

  const nondeterministic = decoded
    .map(({ id, signature, repeat }) => ({ id, distancePct: signatureDistancePct(signature, repeat) }))
    .filter(({ distancePct }) => distancePct > 0);
  const noiseFloorPct = Math.max(0, ...decoded.map(({ signature, repeat }) => signatureDistancePct(signature, repeat)));
  const tolerancePct = Math.max(MIN_TOLERANCE_PCT, noiseFloorPct * 1.5);

  const baselineCases = baseline?.cases ?? {};
  const missingFromBaseline = decoded.filter(({ id }) => !baselineCases[id]).map(({ id }) => id);
  const staleInBaseline = Object.keys(baselineCases).filter((id) => !decoded.some((c) => c.id === id));

  const drifted = decoded
    .filter(({ id }) => baselineCases[id])
    .map(({ id, signature }) => ({ id, distancePct: signatureDistancePct(signature, decodeSignature(baselineCases[id])) }))
    .filter(({ distancePct }) => distancePct > tolerancePct);

  // Non-vacuity: the closest two distinct cases. A harness that has quietly
  // started measuring one thing over and over reports a near-zero number
  // here, which is exactly how the font-loading probe passed while comparing
  // a system font against itself.
  let closestPair = null;
  for (let i = 0; i < decoded.length; i++) {
    for (let j = i + 1; j < decoded.length; j++) {
      const distancePct = signatureDistancePct(decoded[i].signature, decoded[j].signature);
      if (!closestPair || distancePct < closestPair.distancePct) {
        closestPair = { a: decoded[i].id, b: decoded[j].id, distancePct };
      }
    }
  }

  // Non-vacuity, tested directly rather than only via the closest-pair proxy:
  // for every case, its OWN baseline must be strictly closer than any OTHER
  // case's baseline. A violation means the signature has lost the power to
  // tell this case apart from another - a drift toward that other case's
  // baseline could silently be read as a match instead of a regression.
  const ownBaselineViolations = [];
  for (const { id, signature } of decoded) {
    if (!baselineCases[id]) continue;
    const ownDistancePct = signatureDistancePct(signature, decodeSignature(baselineCases[id]));
    for (const otherId of Object.keys(baselineCases)) {
      if (otherId === id) continue;
      const otherDistancePct = signatureDistancePct(signature, decodeSignature(baselineCases[otherId]));
      if (otherDistancePct <= ownDistancePct) {
        ownBaselineViolations.push({ id, ownDistancePct, closerTo: otherId, otherDistancePct });
      }
    }
  }

  return {
    noiseFloorPct, tolerancePct, missingFromBaseline, staleInBaseline, drifted, nondeterministic, closestPair,
    ownBaselineViolations,
  };
}
