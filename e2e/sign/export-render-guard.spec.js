/**
 * @file export-render-guard.spec.js
 * @description W1: run the real `signPdf`, rasterise what it produced, and
 * compare the ink to a stored per-case baseline.
 *
 * This is the first check in the repo on the artifact users actually receive.
 * Everything else looks at inputs (`fontCoverage.test.js` reads font bytes),
 * at intermediate shaping (`hebrew-font-parity.spec.js`,
 * `arabic-shaping-guard.spec.js`, `devanagari-shaping-guard.spec.js` compare
 * fontkit against the browser, before a PDF exists), or at what the produced
 * file *says* (`sign.test.js` reads pdf.js text items). None of them draws it.
 *
 * The method, the three non-negotiable constraints on it, and the reasoning
 * behind the tolerance are in `fixtures/exportRenderHarness.js`. Read that
 * before changing anything here - in particular before "fixing" a red run by
 * regenerating the baseline.
 *
 * One test, not one per case: every case has to be captured in the same page
 * to share one bundle and one pdf.js worker, and the non-vacuity assertion is
 * a statement about the corpus as a whole rather than about any single case.
 * Failures name the case, so the granularity is in the message rather than in
 * the test list.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPORT_RENDER_CORPUS } from './fixtures/exportRenderCorpus.js';
import {
  BASELINE_PLATFORM,
  GRID_COLS, GRID_ROWS, NON_VACUITY_MARGIN, PAGE_HEIGHT_PT, PAGE_WIDTH_PT, RENDER_SCALE,
  baselineFormatMatches, buildSignBundle, captureSignaturesInPage, findPdfWorkerUrl,
  judgeCases, readBaseline, removeSignBundle, writeBaseline,
} from './fixtures/exportRenderHarness.js';

const BUNDLE_FILENAME = '__e2e-export-render-bundle.js';
const BASELINE_PATH = join(fileURLToPath(new URL('./fixtures/', import.meta.url)), 'exportRenderBaseline.json');
const UPDATING = process.env.UPDATE_EXPORT_RENDER_BASELINE === '1';
const ON_BASELINE_PLATFORM = process.platform === BASELINE_PLATFORM;

let bundlePath;

test.beforeAll(async () => {
  bundlePath = await buildSignBundle(BUNDLE_FILENAME);
});

test.afterAll(() => {
  removeSignBundle(bundlePath);
});

test.describe('Exported PDF render guard', () => {
  // Each case exports and rasterises twice (the determinism measurement), so
  // the corpus is ~2x its length in full pdf.js render passes.
  test.setTimeout(180_000);

  // Font rasterisation differs between operating systems by more than this
  // guard's tolerance, so the stored baseline is only comparable with a run on
  // the platform that captured it. Skipping off-platform is deliberate: see
  // BASELINE_PLATFORM in exportRenderHarness.js for the measurement behind it
  // and why widening the tolerance instead was rejected.
  test.skip(
    !ON_BASELINE_PLATFORM,
    `Exported PDF render guard runs on ${BASELINE_PLATFORM} only (this is ${process.platform}). `
    + 'Its baseline is platform-bound - font rasterisation differs across operating systems by more than '
    + 'the 12.50% tolerance (measured: 13.68% and 17.61% on the two handwriting faces), while signPdf itself '
    + 'is byte-identical on both. A local run would report drift that is not a regression, so it reports '
    + 'nothing instead. This guard is enforced in CI.',
  );

  test(`the ink signPdf draws matches its baseline across ${EXPORT_RENDER_CORPUS.length} cases`, async ({ page }) => {
    const workerSrc = findPdfWorkerUrl();
    // SIGN-21: the preview server snapshots dist/'s file list at startup,
    // before this file's beforeAll writes the bundle, so answer the request
    // from that file directly instead - see shapingGuardHarness.js's
    // buildFontkitBundle doc (the same mechanism, applied to buildSignBundle).
    await page.route(`**/${BUNDLE_FILENAME}`, (route) => route.fulfill({ path: bundlePath }));
    await page.goto('/sign');
    await page.addScriptTag({ url: `/${BUNDLE_FILENAME}` });

    const results = await page.evaluate(captureSignaturesInPage, {
      cases: EXPORT_RENDER_CORPUS.map(({ id, element }) => ({ id, element })),
      pageWidthPt: PAGE_WIDTH_PT,
      pageHeightPt: PAGE_HEIGHT_PT,
      renderScale: RENDER_SCALE,
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
      workerSrc,
    });

    if (UPDATING) {
      // Guarded rather than trusted to discipline: capturing on the wrong
      // platform silently rewrites every signature and makes the next CI run
      // read as a whole-corpus regression in signPdf.
      expect(
        process.platform,
        `Refusing to capture a baseline on ${process.platform}. This guard's baseline is platform-bound and must be captured on ${BASELINE_PLATFORM} - see "Regenerating the baseline" in exportRenderHarness.js.`,
      ).toBe(BASELINE_PLATFORM);
      writeBaseline(BASELINE_PATH, results);
      console.log(`Wrote ${results.length} baseline signatures to ${BASELINE_PATH}. Review the diff - a baseline change is a change to what users receive.`);
    }

    const baseline = readBaseline(BASELINE_PATH);
    expect(baseline, `No baseline at ${BASELINE_PATH}. Capture one with UPDATE_EXPORT_RENDER_BASELINE=1 and review it before committing.`).not.toBeNull();
    expect(
      baseline.platform ?? BASELINE_PLATFORM,
      'The stored baseline was captured on a different platform than this run, so its numbers describe a different rasteriser rather than a different PDF. Recapture it on the baseline platform.',
    ).toBe(process.platform);
    expect(
      baselineFormatMatches(baseline),
      'The stored baseline was captured with a different signature recipe (page size, render scale or grid), so its numbers are not comparable with these. Recapture it with UPDATE_EXPORT_RENDER_BASELINE=1 rather than reading the differences as regressions.',
    ).toBe(true);

    const judgment = judgeCases(results, baseline);
    const { closestPair, noiseFloorPct, tolerancePct } = judgment;

    console.log([
      `Export render guard: ${results.length} cases`,
      `determinism noise floor ${noiseFloorPct.toFixed(2)}%`,
      `tolerance ${tolerancePct.toFixed(2)}%`,
      closestPair ? `closest distinct pair ${closestPair.a}/${closestPair.b} at ${closestPair.distancePct.toFixed(2)}% (${(closestPair.distancePct / tolerancePct).toFixed(1)}x tolerance)` : 'no pairs',
      `${judgment.drifted.length} drifted`,
    ].join(', '));

    // Determinism first: if the export is not reproducible, every other
    // number in this run is noise measured against noise.
    expect(
      judgment.nondeterministic,
      `signPdf did not produce identical ink twice for the same element, so nothing else this guard reports is trustworthy: ${judgment.nondeterministic.map((c) => `${c.id} ${c.distancePct.toFixed(2)}%`).join(', ')}`,
    ).toEqual([]);

    // Then the corpus and the baseline have to be describing the same set of
    // cases, or a silently-dropped case would read as a pass.
    expect(
      judgment.missingFromBaseline,
      `These corpus cases have no baseline, so nothing checked them: ${judgment.missingFromBaseline.join(', ')}. Capture with UPDATE_EXPORT_RENDER_BASELINE=1.`,
    ).toEqual([]);
    expect(
      judgment.staleInBaseline,
      `The baseline holds cases the corpus no longer has: ${judgment.staleInBaseline.join(', ')}. Recapture it so the file stops describing a corpus that does not exist.`,
    ).toEqual([]);

    // Non-vacuity. A harness that has started measuring the same thing for
    // every case passes forever and proves nothing - which is exactly how the
    // font-loading probe passed while comparing one system font against
    // itself seven times.
    expect(closestPair, 'A corpus of fewer than two cases cannot be checked for non-vacuity.').not.toBeNull();
    expect(
      closestPair.distancePct,
      `Non-vacuity: "${closestPair.a}" and "${closestPair.b}" are only ${closestPair.distancePct.toFixed(2)}% apart, under the ${(NON_VACUITY_MARGIN * tolerancePct).toFixed(2)}% this guard needs to be able to tell cases apart. Either the two cases genuinely draw the same thing (make one of them distinct, or drop it), or the harness has stopped varying what it renders - which is the failure mode that matters, because it makes every other assertion here vacuous.`,
    ).toBeGreaterThan(NON_VACUITY_MARGIN * tolerancePct);

    // Non-vacuity, tested directly rather than only through the closest-pair
    // proxy above: every case must remain strictly closer to its OWN baseline
    // than to any other case's baseline. A violation here means the signature
    // has lost the power to tell that case apart from another - a drift could
    // silently be read as a match with the wrong case instead of a regression
    // against the right one.
    expect(
      judgment.ownBaselineViolations,
      `These cases are no closer to their own baseline than to another case's baseline, so a drift here could silently read as a match instead of a regression: ${judgment.ownBaselineViolations.map((v) => `${v.id} (${v.ownDistancePct.toFixed(2)}% from its own baseline, ${v.otherDistancePct.toFixed(2)}% from "${v.closerTo}")`).join(', ')}.`,
    ).toEqual([]);

    // Only now the actual regression check.
    expect(
      judgment.drifted,
      `The ink these cases draw no longer matches the baseline: ${judgment.drifted.map((c) => `${c.id} ${c.distancePct.toFixed(2)}%`).join(', ')} (tolerance ${tolerancePct.toFixed(2)}%). Look at the rendered page before deciding this is a baseline that needs updating.`,
    ).toEqual([]);
  });
});

