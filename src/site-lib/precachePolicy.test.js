import { describe, expect, it } from 'vitest';
import { NEVER_PRECACHED_PAGES, PRECACHED_FONTS, shouldPrecache } from './precachePolicy.js';

/**
 * SIGN-07, narrowed by MEM-35: which files may appear in a page's precache list
 * (every script a page reaches, every font except the default), so a tool a person
 * has used can be opened and used offline. See this policy's own doc comment
 * (precachePolicy.js) for the full reasoning and the pre-2026-08-27
 * precedent this restores.
 *
 * ARCH-22: moved here verbatim from scripts/sw.test.mjs, since
 * this is the policy's own unit test and the policy is product behaviour
 * living under src/site-lib/, not build tooling. The service worker's own
 * vm-harness tests (which exercise public/sw.js directly rather than this
 * pure function) stayed behind in scripts/sw.test.mjs.
 */
describe('precache manifest delivery policy', () => {
  const names = { manifestName: 'precache-manifest.json', workerName: 'sw.js' };

  it('keeps the online-only Drive page out of the install', () => {
    expect(NEVER_PRECACHED_PAGES).toEqual(['drive/index.html']);
    expect(shouldPrecache('merge/index.html', names)).toBe(true);
  });

  it('leaves the font catalogue out, so a visitor does not download faces they never pick', () => {
    expect(shouldPrecache('fonts/Pacifico-Regular.ttf', names)).toBe(false);
    expect(shouldPrecache('fonts/Kalam-Bold.ttf', names)).toBe(false);
    expect(shouldPrecache('fonts/NotoSansJP-Regular.ttf', names)).toBe(false);
  });

  it('keeps the default family, because a first-ever offline session has no font to embed otherwise', () => {
    // DEFAULT_FONT_FAMILY in src/lib/fonts/fontManifest.ts. Without this one file, signPdf's
    // fetch fails offline, loadCustomFont returns null, and serialize throws
    // rather than degrading to something upright.
    expect(PRECACHED_FONTS).toEqual(['fonts/Arimo-Regular.ttf']);
    expect(shouldPrecache('fonts/Arimo-Regular.ttf', names)).toBe(true);
  });

  it('precaches every page and script, documentation included, because a page shell alone cannot hydrate', () => {
    expect(shouldPrecache('index.html', names)).toBe(true);
    expect(shouldPrecache('sign/index.html', names)).toBe(true);
    expect(shouldPrecache('pdf-to-image/index.html', names)).toBe(true);
    expect(shouldPrecache('redact/index.html', names)).toBe(true);
    expect(shouldPrecache('merge/index.html', names)).toBe(true);
    expect(shouldPrecache('image-to-pdf/index.html', names)).toBe(true);
    expect(shouldPrecache('split/index.html', names)).toBe(true);
    expect(shouldPrecache('compress/index.html', names)).toBe(true);
    expect(shouldPrecache('unlock/index.html', names)).toBe(true);
    expect(shouldPrecache('organize-pdf/index.html', names)).toBe(true);
    expect(shouldPrecache('install-pdf-app/index.html', names)).toBe(true);
    expect(shouldPrecache('open-source-pdf-editor/index.html', names)).toBe(true);
    expect(shouldPrecache('how-to-sign-a-pdf-on-iphone/index.html', names)).toBe(true);
    expect(shouldPrecache('blur-vs-blackout-vs-delete-pdf/index.html', names)).toBe(true);
    expect(shouldPrecache('future-documentation-page/index.html', names)).toBe(true);
    expect(shouldPrecache('_astro/pdf.worker.min.abc123.mjs', names)).toBe(true);
    expect(shouldPrecache('_astro/PdfToImageTool.abc123.js', names)).toBe(true);
  });

  it('never caches the manifest or the worker as entries in their own manifest', () => {
    // A 404 on the manifest is what tells an orphaned worker to uninstall, so
    // caching either of these would defeat that.
    expect(shouldPrecache('precache-manifest.json', names)).toBe(false);
    expect(shouldPrecache('sw.js', names)).toBe(false);
  });

  it('leaves the sample PDF, the guide media, the Scan guide photos and the codec wasm to the runtime cache (MEM-35)', () => {
    expect(shouldPrecache('images/redaction-guide/sample.pdf', names)).toBe(false);
    expect(shouldPrecache('images/redaction-guide/sample-preview.jpg', names)).toBe(false);
    expect(shouldPrecache('images/redaction-guide/how-to-blur-text-in-pdf-video.webp', names)).toBe(false);
    expect(shouldPrecache('images/scan-guide/step-1.jpg', names)).toBe(false);
    expect(shouldPrecache('pdfjs-dist-wasm/openjpeg.wasm', names)).toBe(false);
    expect(shouldPrecache('images/brand/google-drive.png', names)).toBe(true);
  });
});
