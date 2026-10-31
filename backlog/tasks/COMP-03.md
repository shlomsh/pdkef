---
id: "COMP-03"
title: "A JPEG quality setting looks the same in Safari as in Chrome, so Safari files stop coming out larger"
status: "open"
priority: "P3"
epic: "polish"
horizon: "later"
needs: "A check on your iPhone"
---

# COMP-03 · A quality setting means the same look in Safari and Chrome

*Filed 2026-10-31,* from a codec measurement Shlomi asked for ("Measure codecs"). Roadmap item, not
scheduled.

## What we found

Every JPEG we make goes through `canvas.toBlob('image/jpeg', quality)`, and the browser's encoder
decides what a quality number means. WebKit's encoder (Safari, and every browser on iOS) spends far
more bytes than Chromium's at the same number, for a look past what the level asks for.

Measured in Playwright 1.64.1 (Chromium 156 headless shell, WebKit 27.2) on this Mac, 2026-10-31.
SSIM is ssim.js `weber` on luma, whole image, each output decoded by the browser that made it.
Corpus: page 1 of four PDFs rendered at 108 DPI (IRS 1040, a health declaration,
`src/tools/compress/__fixtures__/scan.pdf` and `mixed.pdf`) and three guide photos
(`public/images/scan-guide/photo.jpg`, `scan.jpg`, `public/images/sign-guide/signature-methods.jpg`).

Canvas bytes at q 0.6, WebKit over Chromium: **1.42x to 1.79x** on all seven images. On the IRS page
WebKit reaches SSIM 0.993 where Chromium reaches 0.973.

The WebKit quality that matches Chromium's SSIM, and what it saves against WebKit at the same number:

| Chromium q | WebKit q for the same SSIM | WebKit file, smaller by |
| --- | --- | --- |
| 0.4 | 0.27 to 0.33 | 11% to 45% |
| 0.6 | 0.38 to 0.44 | 23% to 32% |
| 0.8 | 0.44 to 0.60 | 22% to 40% |

The mapping is steady on the rendered pages (0.6 → 0.38-0.39, 0.8 → 0.50-0.52). The photos spread
more because they are already JPEGs, so re-encoding them near their own quantisation is close to
lossless and their curves are not monotonic above SSIM 0.99.

Not measured: a real iPhone (iOS Safari may not match Playwright's WebKit on macOS), Firefox, and text
legibility beyond whole-image SSIM, which mostly-white pages push high.

## Where a fixed quality is used today

Target-size searches already adapt to whichever encoder runs, so they gain little. The fixed settings
are where Safari visitors get bigger files:

- `src/tools/compress/lib/compressImages.js`: `IMAGE_LEVELS` (0.4 / 0.6 / 0.8) and the Exact size
  ladder `TARGET_IMAGE_LADDER`.
- `src/tools/compress/lib/compress.js`: the "Flatten pages to images" levels.
- `src/tools/scan/lib/scanPipeline.ts`: `KEEP_QUALITY` 0.92, previews at 0.85, thumbs at 0.8, and the
  final page encode. Scan to PDF is mostly used on phones, so this is likely where it matters most.
- `src/editor/adapters/pdf/rasterPage.js`: `RASTER_JPEG_QUALITY`.
- `src/tools/to-image/lib/toImage.js`: JPG output at `quality = 0.92` by default.

## What to do

1. **Check on a real iPhone first.** Run the seven-image curve (or just q 0.4 / 0.6 / 0.8 on the
   four rendered pages) in iOS Safari from the LAN dev server. If iOS matches the table, go on; if it
   does not, record its own numbers here.
2. Decide how a page knows which encoder it has: an engine check, or a one-time probe that encodes a
   fixed test pattern and reads its size. Pick the one that is pure and unit-testable.
3. One pure function, for example `encoderQuality(nominal, encoder)` in `src/lib/images/`, maps a
   Chromium-calibrated number to the encoder's own. Every site above calls it; none re-derives it.
4. Unit tests pin the mapping. Compress's measured copy and FAQ numbers stay true on both engines.

## Also measured, not pursued

From the same run, kept here so it is not repeated:

- **MozJPEG (`@jsquash/jpeg` 1.6.0): declined.** At the same SSIM it is 15-20% smaller than
  Chromium's encoder and 20-30% smaller than WebKit's (medians, SSIM 0.95-0.98), but it loses above
  SSIM 0.99 on the IRS page, it is 20-27x slower (IRS page: 5 ms canvas vs 135 ms, 568 ms at 4x CPU
  throttle), and it compiles in libjpeg code under the IJG license, outside our allowlist and with an
  attribution clause that `test:licenses` cannot see (the script reads only the package's
  `Apache-2.0` field). About 60 KB brotli, built from mozjpeg 3.3.1 (2018). At q 60 it is 26-48%
  smaller than canvas q 0.6 but visibly worse, so it would not even be a drop-in swap.
- **OxiPNG (`@jsquash/oxipng` 2.3.0): a candidate, not ticketed.** Lossless, 11-34% smaller than the
  original PNGs, while canvas `toBlob('image/png')` came out 12-79% larger. About 0.6 s per page-sized
  image on this Mac, about 66 KB brotli, oxipng and libdeflate are MIT. It would let Compress Image
  keep PNGs as PNG instead of turning them into JPEG. Worth a ticket only if people compress PNGs, a
  share we do not know.
- **WebP and AVIF:** a PDF cannot embed either, so they would only help Compress Image's own output.
  AVIF's encoder is about 850 KB brotli and carries libaom's patent license.
- **CSP:** `script-src` has no `'wasm-unsafe-eval'`, so any WASM codec would most likely have to run
  in a worker, as pdf.js does. Inferred from the spec, not checked on a build.
- jSquash itself: last commit 2026-01-05, its codecs frozen on old upstream versions.

The bench was a Playwright script serving its page through `page.route`, so no server or port, with
@jsquash and ssim.js installed in a scratch folder. The scripts were not kept. The method above is
enough to rebuild it.
