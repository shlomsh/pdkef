import { test, expect } from '@playwright/test';
import { HEBREW_CAPABLE_FONTS } from '../../src/lib/fonts.js';
import { ORDER_VARIANT_GROUPS } from '../../src/lib/hebrewCombiningCorpus.js';

/**
 * Tier 3 of the H8 mark-placement guard (docs/hebrew-text-shaping-export.md,
 * "A guard that can see a misplaced mark"): the reference anchor. Tier 1
 * (src/editor/registry/hebrewMarkPlacement.test.js) proves our own pipeline
 * is order-insensitive; this proves the PREMISE that fix is built on still
 * holds - that the browser itself renders every canonically-equivalent
 * ordering of a base+mark cluster pixel-identically, in every catalogued
 * font. It does not shape anything with fontkit and does not compare against
 * our export at all - it is Chromium checked against itself, which is what
 * makes it "the test that fails if a browser update moves the reference out
 * from under us" (the design record's words) rather than a duplicate of
 * Tier 1.
 *
 * Kept small on purpose - a handful of clusters, not the full corpus - since
 * Tier 1 and Tier 2 already cover the full enumerated set with no browser
 * needed at all.
 */

const SAMPLE_IDS = ['U+05D1+U+05BC', 'U+05E9+U+05BC+U+05C1', 'U+05D0+U+05B7', 'U+05D5+U+05B9', 'U+05D9+U+05B4'];
const SAMPLES = ORDER_VARIANT_GROUPS.filter((entry) => SAMPLE_IDS.includes(entry.id));

test.describe('Hebrew composition: the browser is order-insensitive (H7/H8 Tier 3)', () => {
  for (const family of HEBREW_CAPABLE_FONTS) {
    test(`${family}: typed, reordered, and precomposed input render pixel-identically`, async ({ page }) => {
      await page.goto('/sign');

      const result = await page.evaluate(async ({ familyName, samples }) => {
        const size = 200;
        const canvasWidth = 400;
        const canvasHeight = 300;

        await document.fonts.load(`${size}px "${familyName}"`);
        await document.fonts.ready;
        if (!document.fonts.check(`${size}px "${familyName}"`)) {
          throw new Error(`${familyName} did not load; measurement would be against a fallback font`);
        }

        function render(text) {
          const canvas = document.createElement('canvas');
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);
          ctx.font = `${size}px "${familyName}"`;
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = 'black';
          ctx.fillText(text, canvasWidth - 20, canvasHeight / 2);
          return ctx.getImageData(0, 0, canvasWidth, canvasHeight).data;
        }

        // Hashes which pixels are INKED (dark), not the raw alpha channel -
        // the white `fillRect` background is fully opaque everywhere, so
        // alpha alone is 255 for the whole canvas regardless of what text
        // was drawn. `data[i] < 200` (matching shapingGuardHarness.js's own
        // `pixelDiffPct`) is what actually distinguishes drawn ink from
        // background.
        function hashOf(data) {
          let hash = 0;
          for (let i = 0; i < data.length; i += 4) hash = (hash * 31 + (data[i] < 200 ? 1 : 0)) >>> 0;
          return hash;
        }

        // Non-vacuity: two genuinely different strings must hash differently,
        // or a bug in this harness (e.g. measuring a blank/fallback canvas)
        // could make every comparison below pass for the wrong reason - the
        // exact "the probe silently measured nothing" trap CLAUDE.md warns
        // about for font-loading harnesses.
        const distinctA = hashOf(render('א'));
        const distinctB = hashOf(render('ב'));
        if (distinctA === distinctB) throw new Error('non-vacuity check failed: two different letters hashed identically');

        return samples.map(({ id, variants }) => {
          const hashes = Object.fromEntries(Object.entries(variants).map(([name, text]) => [name, hashOf(render(text))]));
          return { id, hashes };
        });
      }, { familyName: family, samples: SAMPLES });

      for (const { id, hashes } of result) {
        const [[firstName, firstHash], ...rest] = Object.entries(hashes);
        for (const [name, hash] of rest) {
          expect(hash, `${family}, ${id}: "${name}" rendered differently from "${firstName}"`).toBe(firstHash);
        }
      }
    });
  }
});
