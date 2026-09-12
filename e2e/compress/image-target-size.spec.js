import { test, expect } from '@playwright/test';
import fs from 'fs';

// SEO-19 - the image half of the compress island (compressImage.js) always
// re-encodes its output as a real JPEG via canvas.toBlob, and flattens a
// transparent PNG onto white before it does. Neither claim can be checked
// in jsdom: jsdom has no JPEG encoder, and the unit tests
// (compressImage.test.js) mock canvas.toBlob outright, so they can prove the
// search loop's arithmetic but not that the bytes it produces are an actual
// JPEG at or under the requested size, or that a transparent pixel really
// comes back white rather than black. This spec drives the real island in a
// real browser and checks the decoded output bytes instead of component
// state.
//
// Both fixtures are generated in-page (a gradient/shapes/text/noise photo
// for the JPEG case, a mostly-transparent canvas with opaque noisy shapes
// for the PNG case) via canvas.toDataURL, so no binary fixture is committed
// to the repo. Each fixture's own size is asserted first, so a future change
// to the drawing code that accidentally makes a fixture small enough to
// pass through untouched (compressImageToTarget's passthrough rule) can't
// quietly turn either case trivial.
//
// Two things are proven per case: the output is at or under the requested
// target and is a real JPEG (magic bytes, not just a MIME string), and - PNG
// case only - the input's transparency was flattened to white, not black.
//
// Chromium only: canvas noise generation and JPEG decoding behave the same
// in every engine, so there's nothing browser-specific to add here, and
// playwright.config.js's "webkit" project is scoped to other specs anyway.

const JPEG_FIXTURE_WIDTH = 1600;
const JPEG_FIXTURE_HEIGHT = 1200;
const PNG_FIXTURE_WIDTH = 1000;
const PNG_FIXTURE_HEIGHT = 1000;

// A pixel inside the PNG fixture's fully transparent top-left block (left
// untouched by the shapes/noise drawn elsewhere on the canvas). Sampled
// again on the *output* to prove compressImage.js's flatten-to-white
// behaviour, scaled to the output's own dimensions since the target-size
// search may have picked a smaller scale off the ladder.
const TRANSPARENT_CORNER_FRACTION = 0.05;

const JPEG_MIN_BYTES = 250 * 1024;
const JPEG_MAX_BYTES = 900 * 1024;
const PNG_MIN_BYTES = 50 * 1024;

const TARGET_KB = 50;

/** Generates a fixture on an in-page canvas and returns it as a Node
 * Buffer, so no binary ever needs to be committed to the repo. `kind` is
 * 'jpeg' or 'png'. */
async function makeFixtureInPage(page, kind) {
  const dataUrl = await page.evaluate(
    ({ kind: fixtureKind, jpegWidth, jpegHeight, pngWidth, pngHeight }) => {
      function drawJpegFixture(ctx, width, height) {
        // Gradient background, a few dozen coloured rectangles and circles,
        // some text, and a band of per-pixel noise across the lower part of
        // the canvas. The noise is what keeps this from JPEG-compressing
        // down to almost nothing the way a plain gradient would, while
        // staying well short of the 1MB+ a fully-random image would hit.
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#1b2a4a');
        gradient.addColorStop(0.5, '#3d6e91');
        gradient.addColorStop(1, '#e8c468');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < 45; i += 1) {
          ctx.globalAlpha = 0.5 + Math.random() * 0.5;
          ctx.fillStyle = `hsl(${Math.floor(Math.random() * 360)}, 70%, 55%)`;
          const w = 40 + Math.random() * 160;
          const h = 40 + Math.random() * 160;
          ctx.fillRect(Math.random() * width, Math.random() * height, w, h);
        }
        ctx.globalAlpha = 1;

        for (let i = 0; i < 30; i += 1) {
          ctx.beginPath();
          ctx.fillStyle = `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`;
          const r = 20 + Math.random() * 80;
          ctx.arc(Math.random() * width, Math.random() * height, r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px sans-serif';
        for (let i = 0; i < 8; i += 1) {
          ctx.fillText(`SEO-19 fixture ${i}`, Math.random() * (width - 420), 80 + i * 130);
        }

        const noiseY = Math.floor(height * 0.6);
        const noiseHeight = height - noiseY;
        const imageData = ctx.getImageData(0, noiseY, width, noiseHeight);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          if (Math.random() < 0.6) {
            data[i] = Math.floor(Math.random() * 256);
            data[i + 1] = Math.floor(Math.random() * 256);
            data[i + 2] = Math.floor(Math.random() * 256);
          }
        }
        ctx.putImageData(imageData, 0, noiseY);
      }

      function drawPngFixture(ctx, width, height) {
        // Canvas starts fully transparent. The top-left 300x300 block is
        // left untouched (that's the block TRANSPARENT_CORNER_FRACTION
        // samples from). Everything else gets opaque coloured circles plus
        // a block of fully-random, fully-opaque per-pixel noise - lossless
        // PNG can't compress that away, which keeps the fixture comfortably
        // over the 50KB target so the passthrough rule can't make this case
        // trivial.
        for (let i = 0; i < 50; i += 1) {
          ctx.beginPath();
          ctx.fillStyle = `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`;
          const r = 30 + Math.random() * 100;
          const x = 320 + Math.random() * (width - 340);
          const y = 320 + Math.random() * (height - 340);
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        const noiseX = 300;
        const noiseY = 300;
        const noiseWidth = width - noiseX;
        const noiseHeight = height - noiseY;
        const imageData = ctx.getImageData(noiseX, noiseY, noiseWidth, noiseHeight);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.floor(Math.random() * 256);
          data[i + 1] = Math.floor(Math.random() * 256);
          data[i + 2] = Math.floor(Math.random() * 256);
          data[i + 3] = 255;
        }
        ctx.putImageData(imageData, noiseX, noiseY);
      }

      const width = fixtureKind === 'jpeg' ? jpegWidth : pngWidth;
      const height = fixtureKind === 'jpeg' ? jpegHeight : pngHeight;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (fixtureKind === 'jpeg') {
        drawJpegFixture(ctx, width, height);
        return canvas.toDataURL('image/jpeg', 0.92);
      }
      drawPngFixture(ctx, width, height);
      return canvas.toDataURL('image/png');
    },
    {
      kind,
      jpegWidth: JPEG_FIXTURE_WIDTH,
      jpegHeight: JPEG_FIXTURE_HEIGHT,
      pngWidth: PNG_FIXTURE_WIDTH,
      pngHeight: PNG_FIXTURE_HEIGHT,
    },
  );

  const base64 = dataUrl.split(',')[1];
  return Buffer.from(base64, 'base64');
}

async function openCompressPage(page) {
  await page.goto('/compress/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
}

async function dropFile(page, { name, mimeType, buffer }) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name, mimeType, buffer });
}

async function compressToTarget(page, targetKB) {
  await page.getByRole('button', { name: `${targetKB} KB`, exact: true }).click();
  await page.getByRole('button', { name: 'Compress Image', exact: true }).click();
  await expect(page.getByText('Image Successfully Compressed!')).toBeVisible({ timeout: 30_000 });

  // A missed target means the search gave up and returned its closest
  // result - on these fixtures at this target it must succeed outright, so
  // the "closest achievable" miss copy must never appear.
  await expect(page.getByText('Closest achievable size', { exact: false })).toHaveCount(0);
}

async function readDownload(page) {
  const link = page.getByRole('link', { name: 'Download Compressed Image', exact: true });
  await expect(link).toBeVisible();

  const href = await link.getAttribute('href');
  expect(href).toMatch(/^blob:/);
  const downloadAttr = await link.getAttribute('download');

  // fetch()/XHR against a blob: URL is governed by connect-src, and this
  // app's own CSP (astro.config.mjs's security.csp, baked into every page
  // as a <meta> tag - see .claude/rules/csp-scripts-pwa.md) ships
  // connect-src 'self', which blocks it even locally: confirmed with a
  // plain `fetch(URL.createObjectURL(...))` in this exact preview build,
  // independent of this test, before writing this workaround. Clicking the
  // <a download> element is the real user flow - the browser treats it as
  // a download, not a fetch, so it isn't subject to connect-src - so read
  // the bytes it actually saves to disk instead.
  const downloadPromise = page.waitForEvent('download');
  await link.click();
  const downloadEvent = await downloadPromise;
  const downloadPath = await downloadEvent.path();
  const bytes = fs.readFileSync(downloadPath);

  return { href, downloadAttr, bytes, head: Array.from(bytes.slice(0, 3)) };
}

test.describe('compress tool - image target size', () => {
  test('compresses a JPEG photo to a real JPEG at or under the target size', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Canvas fixture generation and JPEG decoding only need checking once; chromium is the default project here.');

    await openCompressPage(page);
    const jpegBuffer = await makeFixtureInPage(page, 'jpeg');

    // If the fixture drifts out of the intended range the case proves
    // nothing: too small and the input passes through untouched (compress
    // never runs), too large and the search's 20s wall-clock budget
    // (compress.js's MAX_SEARCH_MS) could get squeezed.
    expect(jpegBuffer.length).toBeGreaterThanOrEqual(JPEG_MIN_BYTES);
    expect(jpegBuffer.length).toBeLessThanOrEqual(JPEG_MAX_BYTES);

    await dropFile(page, { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpegBuffer });
    await compressToTarget(page, TARGET_KB);

    const download = await readDownload(page);
    expect(download.downloadAttr).toBe('photo-compressed.jpg');
    expect(download.bytes.length).toBeLessThanOrEqual(TARGET_KB * 1024);
    // The magic bytes are the real proof of "a real JPEG" - stronger than a
    // MIME string, and the only one available here (see readDownload's
    // comment on why blob.type isn't reachable via fetch under this app's
    // own CSP).
    expect(download.head).toEqual([0xff, 0xd8, 0xff]);

    console.log(`[SEO-19] JPEG fixture ${jpegBuffer.length} bytes -> output ${download.bytes.length} bytes at ${TARGET_KB}KB target`);

    // SEO-25 (extended to images 2026-09-12): the before/after slider needs
    // no rasterization for an image - just the original file and the output
    // blob, each as an object URL - so a real browser is the right place to
    // confirm the toggle actually produces two loadable `blob:` images, not
    // just component state (jsdom's own coverage is in PdfCompressTool.test.tsx).
    await page.getByRole('button', { name: 'Compare with original' }).click();
    const compareSlider = page.locator('[class*="compare-slider"]');
    await expect(compareSlider).toBeVisible();
    const compareImages = compareSlider.locator('img');
    await expect(compareImages).toHaveCount(2);
    for (const src of await compareImages.evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src')))) {
      expect(src).toMatch(/^blob:/);
    }
  });

  test('compresses a transparent PNG to a real JPEG, flattened to white, at or under the target size', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Canvas fixture generation and JPEG decoding only need checking once; chromium is the default project here.');

    await openCompressPage(page);
    const pngBuffer = await makeFixtureInPage(page, 'png');

    // Same non-vacuity guard as the JPEG case: this only proves the
    // flatten-to-white claim if the search actually has to run.
    expect(pngBuffer.length).toBeGreaterThan(PNG_MIN_BYTES);

    await dropFile(page, { name: 'shot.png', mimeType: 'image/png', buffer: pngBuffer });
    await compressToTarget(page, TARGET_KB);

    const download = await readDownload(page);
    // Output is always JPEG (compressImage.js never produces PNG), so the
    // download keeps the original basename but the JPEG extension - see
    // deriveDownloadName in PdfCompressTool.tsx.
    expect(download.downloadAttr).toBe('shot-compressed.jpg');
    expect(download.bytes.length).toBeLessThanOrEqual(TARGET_KB * 1024);
    expect(download.head).toEqual([0xff, 0xd8, 0xff]);

    // Decode the downloaded bytes back into an in-page Blob to sample a
    // pixel - constructing a Blob from bytes we already hold is a local
    // decode, not a network fetch, so (unlike readDownload's blob: URL) it
    // isn't affected by connect-src. The search may have scaled the image
    // down (the ladder in compressImage.js), so sample the known-transparent
    // corner at the same fraction of the *output's* own dimensions rather
    // than a fixed pixel.
    const corner = await page.evaluate(
      async ({ base64, fraction }) => {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) array[i] = binary.charCodeAt(i);
        const blob = new Blob([array], { type: 'image/jpeg' });
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const x = Math.floor(bitmap.width * fraction);
        const y = Math.floor(bitmap.height * fraction);
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        return { width: bitmap.width, height: bitmap.height, r: pixel[0], g: pixel[1], b: pixel[2] };
      },
      { base64: download.bytes.toString('base64'), fraction: TRANSPARENT_CORNER_FRACTION },
    );

    console.log(`[SEO-19] PNG fixture ${pngBuffer.length} bytes -> output ${download.bytes.length} bytes (${corner.width}x${corner.height}) at ${TARGET_KB}KB target`);

    // JPEG re-encoding won't give exactly 255, but a flattened-to-white
    // pixel should be close; flattened-to-black (the bug this guards
    // against) would read near 0.
    expect(corner.r).toBeGreaterThanOrEqual(240);
    expect(corner.g).toBeGreaterThanOrEqual(240);
    expect(corner.b).toBeGreaterThanOrEqual(240);
  });
});
