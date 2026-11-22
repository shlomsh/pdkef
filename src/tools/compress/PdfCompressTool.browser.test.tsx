// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import PdfCompressTool, { formatShare } from './PdfCompressTool.tsx';
import { englishCompressMessages, hebrewCompressMessages } from './messages';
import * as compressLib from './lib/compress.js';
import * as compressImageLib from './lib/compressImage.js';
import * as imagesLib from './lib/compressImages.js';
import * as thumbnails from '#lib/pdf/thumbnails.js';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { formatBytes } from './lib/resultView.ts';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { openPdfDoc } from '#lib/pdf/openPdfDoc.ts';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { ANALYSIS_SHAPES, buildAnalysisPdf } from '../../test/support/analysisPdfFixtures.ts';
import needsPasswordUrl from '../../lib/__fixtures__/encrypted/needs-password.pdf?url';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';
import tinyPhotoUrl from '../../lib/__fixtures__/photo-1.jpg?url';

answerNetwork();

vi.mock('./lib/compressImages.js', { spy: true });
vi.mock('./lib/compress.js', { spy: true });
vi.mock('./lib/compressImage.js', { spy: true });
vi.mock('#lib/pdf/thumbnails.js', { spy: true });
vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('#lib/pdf/openPdfDoc.ts', { spy: true });

const actualImages = await vi.importActual<typeof imagesLib>('./lib/compressImages.js');
const actualFlatten = await vi.importActual<typeof compressLib>('./lib/compress.js');
const actualPhoto = await vi.importActual<typeof compressImageLib>('./lib/compressImage.js');
const actualThumbnails = await vi.importActual<typeof thumbnails>('#lib/pdf/thumbnails.js');
const actualProbe = await vi.importActual<{ probeEncryption: typeof probeEncryption }>('#lib/pdf/pdfEncryption.ts');

// Tests that are not about timing build 5ms after the last change instead of 1.5s.
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };

async function noiseBlob(width, height, type = 'image/jpeg', quality = 0.95) {
  const half = document.createElement('canvas');
  half.width = Math.ceil(width / 2);
  half.height = Math.ceil(height / 2);
  const halfContext = half.getContext('2d');
  const pixels = halfContext.createImageData(half.width, half.height);
  for (let offset = 0; offset < pixels.data.length; offset += 65536) crypto.getRandomValues(pixels.data.subarray(offset, offset + 65536));
  for (let at = 3; at < pixels.data.length; at += 4) pixels.data[at] = 255;
  halfContext.putImageData(pixels, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(half, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function photoPdf({ pages = 3, size = [612, 792], width = 1200, height = 800, filler = 0 } = {}) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  const image = await doc.embedJpg(new Uint8Array(await (await noiseBlob(width, height)).arrayBuffer()));
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage(size);
    if (i === 0) {
      page.drawImage(image, { x: 0, y: 0, width: size[0] / 2, height: size[1] / 3 });
      page.drawText('Quarterly report', { x: 50, y: size[1] - 90, size: 12 });
    }
  }
  if (filler) doc.context.register(doc.context.stream(new Uint8Array(filler), {}));
  return doc.save({ useObjectStreams: false });
}

async function flateImagePdf() {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const image = doc.context.flateStream(new Uint8Array(64 * 64 * 3), {
    Type: 'XObject', Subtype: 'Image', Width: 64, Height: 64, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
  });
  page.node.newXObject('Im1', doc.context.register(image));
  return doc.save({ useObjectStreams: false });
}

async function mostlyKeptPdf() {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const jpeg = await doc.embedJpg(new Uint8Array(await (await noiseBlob(100, 100)).arrayBuffer()));
  page.drawImage(jpeg, { x: 0, y: 0, width: 100, height: 100 });
  const raw = doc.context.stream(new Uint8Array(1000 * 1000 * 3), {
    Type: 'XObject', Subtype: 'Image', Width: 1000, Height: 1000, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
  });
  page.node.newXObject('Im2', doc.context.register(raw));
  return doc.save({ useObjectStreams: false });
}

const BYTES = {} as Record<string, Uint8Array>;
const PHOTOS = {} as Record<string, { bytes: Uint8Array; type: string; width: number; height: number }>;
const fetched = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
beforeAll(async () => {
  for (const [shape, spec] of Object.entries(ANALYSIS_SHAPES)) BYTES[shape] = await buildAnalysisPdf(spec);
  BYTES.photo = await photoPdf();
  BYTES.photoWide = await photoPdf({ pages: 1, size: [792, 612] });
  BYTES.photoSingle = await photoPdf({ pages: 1 });
  BYTES.slight = await photoPdf({ pages: 1, width: 400, height: 300, filler: 3_000_000 });
  BYTES.flateImage = await flateImagePdf();
  BYTES.mostlyKept = await mostlyKeptPdf();
  BYTES.ownerOnly = await fetched(ownerOnlyUrl);
  BYTES.needsPassword = await fetched(needsPasswordUrl);
  const photo = async (width, height, type = 'image/jpeg') => ({ bytes: new Uint8Array(await (await noiseBlob(width, height, type)).arrayBuffer()), type, width, height });
  PHOTOS.landscape = await photo(1600, 1200);
  PHOTOS.portrait = await photo(900, 1200);
  PHOTOS.png = await photo(1000, 700, 'image/png');
  PHOTOS.tiny = { bytes: await fetched(tinyPhotoUrl), type: 'image/jpeg', width: 60, height: 40 };
  PHOTOS.broken = { bytes: new Uint8Array(2000), type: 'image/jpeg', width: 0, height: 0 };
});

function makePdfFile(name, shape = 'photo') {
  return new File([BYTES[shape]], name, { type: 'application/pdf' });
}

function makeImageFile(name, key = 'landscape') {
  return new File([PHOTOS[key].bytes], name, { type: PHOTOS[key].type });
}

function hold(fn, original) {
  const started = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  vi.mocked(fn).mockImplementationOnce(async (...args) => {
    started.resolve();
    await gate.promise;
    return original(...args);
  });
  return { started: started.promise, release: () => gate.resolve() };
}

function force(fn, original, change) {
  vi.mocked(fn).mockImplementationOnce(async (...args) => change(await original(...args), ...args));
}

const untouched = (reason) => (file, extra = {}) => ({
  blob: file, beforeBytes: file.size, afterBytes: file.size, rewritten: 0, reason, keptBytes: 0, imageBytes: 0, ...extra,
});

const savedShare = (file, share, extra = {}) => {
  const bytes = Math.round(file.size * (1 - share));
  return { blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), beforeBytes: file.size, afterBytes: bytes, rewritten: 1, reason: 'smaller', keptBytes: 0, imageBytes: 0, ...extra };
};

const deferred = () => Promise.withResolvers<void>();

describe('PdfCompressTool UI flow', () => {
  let container;
  let harness;

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    for (const fn of [imagesLib.compressPdfImages, imagesLib.compressPdfImagesToTarget, compressLib.compressPdf, compressLib.compressPdfToTarget, compressImageLib.compressImageToTarget, thumbnails.renderComparePreview, thumbnails.renderThumbnail, probeEncryption, openPdfDoc]) {
      vi.mocked(fn).mockReset();
    }
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    await harness.restore();
  });

  // The dropzone's input, kept for the whole session: a second pick through it
  // takes the no-confirm path a window drop or a Replace pick takes.
  let fileInput;
  const mount = (props = {}) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool quietPolicy={FAST_QUIET} {...props} />, container);
    });
    fileInput = container.querySelector('input[type="file"]');
  };

  // Lets the promise work already queued run, then renders what it set (a held result landing, a stale one).
  const drain = () => act(async () => { await drainPromises(); });

  const statusOf = () => container.querySelector('[data-compress-status]')?.getAttribute('data-compress-status');
  const settled = () => waitUntil(() => ['done', 'error'].includes(statusOf()));
  const settleOn = async (until) => {
    if (!until) await settled();
    else if (typeof until === 'function') await waitUntil(until);
    else {
      await act(async () => { await until; });
      await drain();
    }
  };

  // A pick starts the run on its own: by default this waits for the result, or
  const pick = async (file, until) => {
    await act(async () => {
      setInputFiles(fileInput, [file]);
    });
    await settleOn(until);
    return file;
  };

  const loadPdf = async (name = 'doc.pdf', shape = 'photo') => {
    mount();
    return pick(makePdfFile(name, shape));
  };

  const radio = (name) =>
    Array.from(container.querySelectorAll('[role="radio"]')).find((r) => r.textContent.trim() === name);
  const choose = async (name) => {
    await act(async () => {
      radio(name).click();
    });
    await settled();
  };
  const preset = (label) =>
    Array.from(container.querySelectorAll('button[aria-pressed]')).find((b) => b.textContent.trim() === label);
  const findButton = (label) =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === label);
  const flattenSwitch = () => container.querySelector('[data-flatten-switch] input[type="checkbox"]');
  const result = () => container.querySelector('[data-result]');
  // The result card: the preview column and the notes about the downloaded file, which sit beside Download.
  const resultCard = () => {
    const parts = [result(), container.querySelector('[data-result-notes]')].filter(Boolean);
    return {
      textContent: parts.map((p) => p.textContent).join(' '),
      querySelector: (selector) => parts.map((p) => p.querySelector(selector)).find(Boolean) ?? null,
    };
  };
  const stripName = () => container.querySelector('[data-tool-shell]').textContent;
  const stripNote = () => container.querySelector('[data-compress-note]').textContent;
  const status = () => container.querySelector('[data-compress-status]').getAttribute('data-compress-status');
  // The rail's Download element (the phone bar's quiet one is a second, separate control).
  const downloadButton = () => container.querySelector('[data-result-action] a[data-state]');
  const tryAgain = () => container.querySelector('[data-result-action] a[data-state="error"]');
  const shareButton = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Share')) ?? null;
  const noCompressButton = () => {
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(labels.some((l) => l === 'Compress PDF' || l === 'Compress Image' || l === 'Compress')).toBe(false);
  };
  const downloaded = async () => harness.blobForUrl(downloadButton().getAttribute('href'));
  const answered = async (fn, n) => vi.mocked(fn).mock.results[n].value;
  const percentSmaller = (before, after) => Math.round((1 - after / before) * 100);
  const pagesOf = async (blob) => {
    const { PDFDocument } = await getPdfLib();
    return (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();
  };
  const decodedSize = async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  };
  const isPngPreview = async (img) => {
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    const { width, height } = await decodedSize(img.getAttribute('src'));
    return width > 0 && height > 0;
  };

  // The pages-to-pictures switch only appears once the image path fell short,
  // so a test that exercises the page-rendering engine gets there the way a
  // person does: a first run that could not shrink the images, then the tick.
  async function loadPdfAndFlatten(name = 'doc.pdf', shape = 'pictures') {
    const file = await loadPdf(name, shape);
    await act(async () => {
      flattenSwitch().click();
    });
    await settled();
    return file;
  }

  it('renders the initial file dropper zone', () => {
    mount();

    const dropzone = container.querySelector('[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop a PDF or image here');
  });

  it('shows no loaded layout until a file is loaded', () => {
    mount();
    expect(container.querySelector('[data-compress-status]')).toBeNull();
  });

  it('a pick runs once at Balanced, with no run button to press', async () => {
    mount();
    expect(container.querySelector('[data-result-sheet]')).toBeNull();
    // forced: the first run is held open until the test lets it finish
    const run = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);

    const file = await pick(makePdfFile('test_doc.pdf'), run.started);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledWith(file, expect.objectContaining({ maxLongSidePx: 1600, quality: 0.6 }));
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(status()).toBe('processing');
    // The sheet already holds Download in its ready look, with the size it knows: the build is silent.
    const sheet = container.querySelector('[data-result-sheet]');
    expect(sheet.contains(downloadButton())).toBe(true);
    expect(downloadButton().textContent).toContain(formatBytes(file.size));
    expect(downloadButton().getAttribute('data-state')).toBe('ready');
    noCompressButton();

    await act(async () => {
      run.release();
    });
    await settled();
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(status()).toBe('done');
    expect(container.querySelector('[data-result-sheet]').contains(downloadButton())).toBe(true);
    expect((await downloaded()).size).toBeLessThan(file.size);
    noCompressButton();
  });

  it('the loaded state is the shell strip, then the result, the controls and the sheet, in that order, with the run counter', async () => {
    await loadPdf('order.pdf');
    const layout = container.querySelector('[data-compress-run]');
    const kids = Array.from(layout.children);
    expect(kids).toHaveLength(4);
    // The strip is the layout's first cell, so on a desktop it sits in the
    // 360px rail beside the result (UX guidelines §18 rule 3) instead of
    // across the top, where it pushed the preview below the first screen.
    expect(kids[0].hasAttribute('data-strip')).toBe(true);
    expect(kids[0].querySelector('[data-tool-shell]')).not.toBeNull();
    expect(container.querySelectorAll('[data-tool-shell]')).toHaveLength(1);
    // The image comes straight under the file it was made from (the phone's reading order); the settings
    // that change it follow.
    expect(kids[1].hasAttribute('data-result')).toBe(true);
    expect(kids[2].hasAttribute('data-controls')).toBe(true);
    expect(kids[3].hasAttribute('data-result-action')).toBe(true);
    expect(layout.getAttribute('data-compress-run')).toBe('1');
    expect(layout.getAttribute('data-compress-status')).toBe('done');
  });

  it('shows the file in the strip and changes the level with the radios, recompressing at once', async () => {
    await loadPdf('test_doc.pdf');
    expect(stripName()).toContain('test_doc.pdf');

    // Default level is Balanced (the recommended one).
    expect(radio('Balanced').getAttribute('aria-checked')).toBe('true');
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    const balanced = (await downloaded()).size;

    await choose('Smallest');
    expect(radio('Smallest').getAttribute('aria-checked')).toBe('true');
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(imagesLib.compressPdfImages.mock.calls[1][1]).toEqual(expect.objectContaining({ maxLongSidePx: 1000, quality: 0.4 }));
    expect((await downloaded()).size).toBeLessThan(balanced);
  });

  it('a level change during a run drops that run\'s result, and only the latest level builds after it', async () => {
    mount();
    // forced: the first run is held open until the test lets it finish
    const first = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
    await pick(makePdfFile('busy.pdf'), first.started);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);

    // Two quick changes while the first run is still out: Smallest never builds.
    await act(async () => {
      radio('Smallest').click();
    });
    await act(async () => {
      radio('Sharpest').click();
    });
    await settled();
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(imagesLib.compressPdfImages.mock.calls[1][1]).toEqual(expect.objectContaining({ maxLongSidePx: 2400, quality: 0.8 }));
    expect(status()).toBe('done');

    // The superseded first run finally ends; it lands nothing.
    await act(async () => {
      first.release();
      await drainPromises();
    });
    const latest = (await answered(imagesLib.compressPdfImages, 1)).blob.size;
    const stale = (await answered(imagesLib.compressPdfImages, 0)).blob.size;
    expect(stale).not.toBe(latest);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(downloadButton().textContent).toContain(formatBytes(latest));
    expect((await downloaded()).size).toBe(latest);
  });

  it('a failed run shows the error and Try again, which runs once more', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // forced: the engine rejects
    vi.mocked(imagesLib.compressPdfImages).mockImplementationOnce(() => Promise.reject(new Error('boom')));
    await loadPdf('flaky.pdf');
    expect(status()).toBe('error');
    expect(container.textContent).toContain('Compression failed.');
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);

    await act(async () => {
      tryAgain().click();
    });
    await settled();
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(status()).toBe('done');
    expect(tryAgain()).toBeNull();
  });

  it('after a failed build, hovering or focusing the phone bar Download does not rebuild', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // forced: the engine rejects
    vi.mocked(imagesLib.compressPdfImages).mockImplementationOnce(() => Promise.reject(new Error('boom')));
    await loadPdf('flaky.pdf');
    expect(status()).toBe('error');
    const quiet = container.querySelector('[data-quiet-download]');
    expect(quiet).not.toBeNull();
    await act(async () => {
      quiet.dispatchEvent(new Event('pointerenter'));
      quiet.dispatchEvent(new Event('focus'));
      await drainPromises();
    });
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
  });

  it('a file replaced mid-run by a password-needing PDF never compresses, even after another level was clicked', async () => {
    mount();
    // forced: the first run is held open until the test lets it finish
    const runA = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
    await pick(makePdfFile('run_a.pdf'), runA.started);
    await act(async () => {
      radio('Smallest').click();
    });
    await pick(makePdfFile('locked.pdf', 'needsPassword'), () => container.querySelector('[data-needs-unlock]') !== null);
    await act(async () => {
      runA.release();
      await drainPromises();
    });

    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-needs-unlock]')).not.toBeNull();
    expect(container.querySelector('[data-compress-status]')).toBeNull();
    expect(container.querySelector('[role="status"].sr-only').textContent).toBe(englishCompressMessages.protectedNeedsPasswordTitle);
  });

  it('a level change during the encryption probe does not compress, and exactly one run happens when the probe answers', async () => {
    // forced: the encryption probe is held open until the test lets it answer
    const probing = hold(probeEncryption, actualProbe.probeEncryption);
    mount();
    await pick(makePdfFile('probing.pdf'), () => container.querySelector('[data-tool-shell]') !== null);
    await act(async () => { await probing.started; });
    // The quiet timer (FAST_QUIET.baseMs, 5) is the product timer that would build after the click: fake only
    // setTimeout from here, so one advance reaches it (afterEach restores the real ones).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      radio('Smallest').click();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); await drainPromises(); });
    expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
    expect(status()).not.toBe('processing');

    await act(async () => {
      probing.release();
    });
    await waitUntil(() => statusOf() === 'done', { dueFakeTimers: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); await drainPromises(); });
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(imagesLib.compressPdfImages.mock.calls[0][1]).toEqual(expect.objectContaining({ maxLongSidePx: 1000, quality: 0.4 }));
  });

  it('a stale run reporting progress after a level change does not move the shown percentage', async () => {
    mount();
    // forced: the first run is held open until the test lets it finish
    const first = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
    await pick(makePdfFile('busy.pdf'), first.started);
    const staleProgress = imagesLib.compressPdfImages.mock.calls[0][1].onProgress;
    await act(async () => {
      radio('Smallest').click();
    });
    // A tap shows the compressing look; the superseded run's progress must not move its ring.
    await act(async () => {
      downloadButton().click();
    });
    await act(async () => {
      staleProgress(0.8);
    });
    const sheetText = () => container.querySelector('[data-result-sheet]').textContent;
    expect(sheetText()).not.toContain('80%');
    expect(sheetText()).toContain('0%');
  });

  it('runs compression on pick and displays the result in the strip and on the sheet', async () => {
    const nativeShare = mockNativeFileShare();
    const file = await loadPdf('test_doc.pdf');
    const out = await downloaded();

    // The sizes ride on the strip; no stats card, no success title.
    const sizes = container.querySelector('[data-compress-sizes]').textContent;
    expect(sizes).toContain(formatBytes(file.size));
    expect(sizes).toContain(formatBytes(out.size));
    expect(sizes).toContain(`${percentSmaller(file.size, out.size)}% smaller`);
    expect(result().querySelector('[data-stats-title]')).toBeNull();
    expect(result().querySelector('[data-stats-grid]')).toBeNull();

    const downloadBtn = downloadButton();
    expect(downloadBtn).not.toBeNull();
    expect(out.size).toBeLessThan(file.size);
    expect(await pagesOf(out)).toBe(3);
    // The result summary rides on the Download button as a second line.
    expect(downloadBtn.textContent).toContain(formatBytes(out.size));
    expect(downloadBtn.textContent).not.toContain('smaller');

    const share = shareButton();
    expect(share).not.toBeNull();
    await act(async () => share.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('test_doc-compressed.pdf');

    nativeShare.restore();
  });

  // The Share ladder is the shared download flow's (useDownloadFlow): a closed sheet is not a failure.
  it.each([
    ['cancelled', Object.assign(new Error('closed'), { name: 'AbortError' }), englishCompressMessages.sharingCanceled],
    ['failed', new Error('no share target'), englishCompressMessages.shareError],
  ])('a share that is %s says so in the live region and records no share', async (_name, rejection, expected) => {
    const nativeShare = mockNativeFileShare();
    nativeShare.share.mockImplementationOnce(() => Promise.reject(rejection));
    await loadPdf('test_doc.pdf');
    await act(async () => shareButton().click());
    await waitUntil(() => expect(container.textContent).toContain(expected));
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(expected);
    expect(recentActions()).not.toContain('share');
    nativeShare.restore();
  });

  it('renders the comparison automatically, with a skeleton while the previews are pending that never blocks the download row, and no show or hide toggle', async () => {
    // forced: both previews are held open until the test lets them render
    const original = hold(thumbnails.renderComparePreview, actualThumbnails.renderComparePreview);
    const compressed = hold(thumbnails.renderComparePreview, actualThumbnails.renderComparePreview);

    await loadPdf('quality_check.pdf');

    // Open on its own as soon as the result lands; the skeleton is the visible
    // "still working" mark, and the download row already rendered.
    await act(async () => { await Promise.all([original.started, compressed.started]); });
    expect(thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-compare-panel]')).not.toBeNull();
    expect(container.querySelector('[data-compare-panel] [data-compare-skeleton]')).not.toBeNull();
    expect(container.querySelectorAll('[data-compare-panel] img')).toHaveLength(0);
    expect(downloadButton()).not.toBeNull();

    await act(async () => {
      original.release();
      compressed.release();
    });
    await waitUntil(() => expect(container.querySelectorAll('[data-compare-panel] img')).toHaveLength(2));

    expect(container.querySelector('[data-compare-skeleton]')).toBeNull();
    const images = Array.from(container.querySelectorAll('[data-compare-panel] img'));
    expect(images).toHaveLength(2);
    for (const img of images) expect(await isPngPreview(img)).toBe(true);
    expect(thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
    // Only the Full screen button is left; nothing hides or restores the slider.
    expect(findButton('Full screen')).toBeDefined();
  });

  // Run-token guard (a workspace drop or a Replace pick lands mid-compress
  // with no confirm, since BasePdfTool's costsSomething stays false until
  // status is 'done' - see the comment on runTokenRef in
  // PdfCompressTool.tsx).
  it('does not land a stale compress result when the file is replaced mid-run', async () => {
    mount();
    // forced: A's run is held open until the test lets it finish
    const runA = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
    await pick(makePdfFile('run_a.pdf'), runA.started);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);

    // While A is 'processing', B lands through the same no-confirm path a
    // workspace drop or Replace pick takes mid-compress.
    await pick(makePdfFile('run_b.pdf', 'photoSingle'), () => stripName().includes('run_b.pdf'));
    expect(stripName()).toContain('run_b.pdf');
    await settled();
    // B starts at once (A's compressor takes no abort signal, so A can only be dropped, not stopped).
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);

    await act(async () => {
      runA.release();
      await drainPromises();
    });

    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(imagesLib.compressPdfImages.mock.calls[1][0].name).toBe('run_b.pdf');
    expect(stripName()).toContain('run_b.pdf');
    expect(status()).toBe('done');
    const forB = (await answered(imagesLib.compressPdfImages, 1)).blob.size;
    const forA = (await answered(imagesLib.compressPdfImages, 0)).blob.size;
    expect(forA).not.toBe(forB);
    expect(downloadButton().textContent).toContain(formatBytes(forB));
    expect(downloadButton().textContent).not.toContain(formatBytes(forA));
  });

  it('does not land a stale PDF compare preview when the file is replaced while it is loading', async () => {
    // forced: A's two previews are held open until the test lets them render
    const aOriginal = hold(thumbnails.renderComparePreview, actualThumbnails.renderComparePreview);
    const aCompressed = hold(thumbnails.renderComparePreview, actualThumbnails.renderComparePreview);

    mount();
    await pick(makePdfFile('preview_a.pdf', 'photoSingle'), () => container.querySelector('[data-compare-skeleton]') !== null);

    // A's compare preview opened automatically and is still loading.
    await act(async () => { await Promise.all([aOriginal.started, aCompressed.started]); });
    expect(container.querySelector('[data-compare-skeleton]')).not.toBeNull();

    // Replace with file B while A's preview is still loading; B compresses on its own.
    await pick(makePdfFile('preview_b.pdf', 'photoWide'));
    expect(stripName()).toContain('preview_b.pdf');
    await waitUntil(() => expect(container.querySelector('[data-compare-panel]')?.querySelectorAll('img')).toHaveLength(2));

    const landscape = async () => {
      const images = Array.from(container.querySelector('[data-compare-panel]').querySelectorAll('img'));
      expect(images).toHaveLength(2);
      const { width, height } = await decodedSize(images[0].getAttribute('src'));
      return width > height;
    };
    expect(await landscape()).toBe(true);

    // A's stale preview resolves last - it must not overwrite B's comparison.
    await act(async () => {
      aOriginal.release();
      aCompressed.release();
      await drainPromises();
    });

    expect(await landscape()).toBe(true);
  });

  it('shows a compareBeforeLabel override from messages in the rendered slider', async () => {
    mount({ messages: { compareBeforeLabel: 'המקור' } });
    await pick(makePdfFile('labeled.pdf'));
    await waitUntil(() => container.querySelectorAll('[data-compare-panel] img').length === 2);

    const panel = container.querySelector('[data-compare-panel]');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('המקור');
  });

  describe('the original page and the label row above the preview', () => {
    const labels = () => container.querySelector('[data-compare-labels]');

    it('the inline slider has no tags on the images, and a label row above it names both sides with their sizes', async () => {
      const file = await loadPdf('labels.pdf');
      await waitUntil(() => container.querySelectorAll('[data-compare-panel] img').length === 2);
      const out = await downloaded();
      const panel = container.querySelector('[data-compare-panel]');
      expect(panel.querySelector('[role="slider"]')).not.toBeNull();
      expect(panel.querySelector('img ~ span')).toBeNull();
      expect(labels().textContent).toContain(`Compressed · ${formatBytes(out.size)}`);
      expect(labels().textContent).toContain(`Original · ${formatBytes(file.size)}`);
    });

    it('the full screen dialog keeps the tags', async () => {
      await loadPdf('tags.pdf');
      await waitUntil(() => container.querySelectorAll('[data-compare-panel] img').length === 2);
      await act(async () => {
        findButton('Full screen').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await waitUntil(() => expect(container.querySelector('dialog[aria-label]')?.querySelectorAll('img ~ span')).toHaveLength(2));
      const dialog = container.querySelector('dialog[aria-label]');
      expect(dialog.querySelectorAll('img ~ span')).toHaveLength(2);
    });

    it('while a run is in flight the original page shows with its label and size, and the compressed side says Compressing', async () => {
      mount();
      // forced: the run is held open until the test lets it finish
      const run = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
      const file = await pick(makePdfFile('inflight.pdf'), () => result().querySelector('img') !== null);
      expect(status()).toBe('processing');
      expect(await isPngPreview(result().querySelector('img'))).toBe(true);
      expect(result().querySelector('[data-compare-skeleton]')).toBeNull();
      expect(labels().textContent).toContain(`Original · ${formatBytes(file.size)}`);
      expect(labels().textContent).toContain('Compressing');
      await act(async () => {
        run.release();
      });
      await settled();
    });

    it('keeps the skeleton until the original has rendered', async () => {
      mount();
      // forced: the original's preview is held open until the test lets it render
      const original = hold(thumbnails.renderComparePreview, actualThumbnails.renderComparePreview);
      await pick(makePdfFile('wait.pdf'), original.started);
      expect(result().querySelector('[data-compare-skeleton]')).not.toBeNull();
      expect(result().querySelector('img')).toBeNull();
      await act(async () => {
        original.release();
      });
      await settled();
      await waitUntil(() => result().querySelectorAll('img').length === 2);
      expect(result().querySelector('[data-compare-skeleton]')).toBeNull();
    });

    // DEBT-56: an <img> painted before its photo decodes has no height, so the centred panel is its
    // label row alone and jumps when the decode lands (CLS 0.0127 on CI's hand-off to Compress Image).
    it('keeps the skeleton until the original photo has decoded', async () => {
      const decode = deferred();
      // forced: the browser's image decode is held open until the test lets it finish
      vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(() => decode.promise);
      // forced: the run is held open until the test lets it finish
      const run = hold(compressImageLib.compressImageToTarget, actualPhoto.compressImageToTarget);
      mount();
      const photo = makeImageFile('decode.jpg');
      await pick(photo, run.started);
      await waitUntil(() => expect(result().querySelector('[data-compare-skeleton]')).not.toBeNull());
      expect(result().querySelector('[data-compare-skeleton]')).not.toBeNull();
      expect(result().querySelector('img')).toBeNull();
      await act(async () => {
        decode.resolve();
      });
      await waitUntil(() => result().querySelector('img') !== null);
      const shown = await harness.blobForUrl(result().querySelector('img').getAttribute('src'));
      expect(new Uint8Array(await shown.arrayBuffer())).toEqual(new Uint8Array(await photo.arrayBuffer()));
      expect(result().querySelector('[data-compare-skeleton]')).toBeNull();
      await act(async () => {
        run.release();
      });
      await settled();
    });

    // DEBT-56: an already-small photo can finish before it decodes; the photo then arriving under the
    // centred stats moved them up 70px. The skeleton holds its place instead.
    it('a result that lands before the photo decodes holds the photo place with the skeleton', async () => {
      const decode = deferred();
      // forced: the browser's image decode is held open until the test lets it finish
      vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(() => decode.promise);
      mount();
      await pick(makeImageFile('small.jpg', 'tiny'));
      expect(result().querySelector('[data-stats-grid]')).not.toBeNull();
      expect(result().querySelector('[data-compare-skeleton]')).not.toBeNull();
      expect(result().querySelector('img')).toBeNull();
      await act(async () => {
        decode.resolve();
      });
      await waitUntil(() => result().querySelector('img') !== null);
      expect(result().querySelector('[data-compare-skeleton]')).toBeNull();
    });

    it('renders the original once per file: one render at pick, one for the compressed page after the run', async () => {
      const file = await loadPdf('once.pdf');
      await waitUntil(() => container.querySelectorAll('[data-compare-panel] img').length === 2);
      // The count is exact: drain, so a third render would show.
      await drain();
      const calls = thumbnails.renderComparePreview.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls.filter(([f]) => f === file)).toHaveLength(1);
      expect(calls.filter(([f]) => f instanceof Blob && !(f instanceof File))).toHaveLength(1);
    });

    it('a file replaced mid-render does not land the old original', async () => {
      mount();
      // forced: A's original preview is held open until the test lets it render
      const aOriginal = hold(thumbnails.renderComparePreview, actualThumbnails.renderComparePreview);
      await pick(makePdfFile('a.pdf', 'photoSingle'), aOriginal.started);
      await pick(makePdfFile('b.pdf', 'photoWide'), () => result().querySelector('img') !== null);
      const originalIsLandscape = async () => {
        await waitUntil(() => !!result()?.querySelector('img'));
        const { width, height } = await decodedSize(result().querySelector('img').getAttribute('src'));
        return width > height;
      };
      expect(await originalIsLandscape()).toBe(true);
      await act(async () => {
        aOriginal.release();
        await drainPromises();
      });
      expect(await originalIsLandscape()).toBe(true);
      await settled();
    });
  });

  it('Exact size runs at once with the 100 KB default, a preset runs at once again, and the page-rendering engine is never touched', async () => {
    const file = await loadPdf('big_scan.pdf');
    expect(imagesLib.compressPdfImagesToTarget).not.toHaveBeenCalled();

    await choose('Exact size');
    expect(radio('Exact size').getAttribute('aria-checked')).toBe('true');
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenCalledTimes(1);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 100 }));
    expect((await downloaded()).size).toBeLessThanOrEqual(100_000);

    await act(async () => {
      preset('500 KB').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settled();
    expect(preset('500 KB').getAttribute('aria-pressed')).toBe('true');
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenCalledTimes(2);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 500 }));
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();
    const out = (await downloaded()).size;
    expect(out).toBeLessThanOrEqual(500_000);
    expect(out).toBeGreaterThan(100_000);
  });

  it('typing a KB value builds once after the pause, not per keystroke; a preset is a change like any other', async () => {
    await loadPdf('typed.pdf');
    await choose('Exact size');
    const calls = () => imagesLib.compressPdfImagesToTarget.mock.calls.length;
    expect(calls()).toBe(1);

    const input = container.querySelector('#target-size-input');
    const runNo = () => container.querySelector('[data-compress-run]').getAttribute('data-compress-run');
    let runBefore = runNo();
    // The quiet timer (FAST_QUIET.baseMs, 5) is the debounce under test: fake only setTimeout from here, so the
    // advances below are the pause (afterEach restores the real ones).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      input.value = '250';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.value = '600';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); });
    await waitUntil(() => runNo() !== runBefore, { dueFakeTimers: true });
    await waitUntil(() => statusOf() === 'done', { dueFakeTimers: true });
    // Past the pause again: a build per keystroke would have a third call by now.
    await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); await drainPromises(); });
    expect(calls()).toBe(2);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ targetKB: 600 }));

    await act(async () => {
      preset('200 KB').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    runBefore = runNo();
    await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); });
    await waitUntil(() => runNo() !== runBefore, { dueFakeTimers: true });
    await waitUntil(() => statusOf() === 'done', { dueFakeTimers: true });
    expect(calls()).toBe(3);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ targetKB: 200 }));
  });

  it('a new file drops a pending KB change', async () => {
    await loadPdf('first.pdf');
    await choose('Exact size');
    const calls = () => imagesLib.compressPdfImagesToTarget.mock.calls.length;
    const before = calls();
    const input = container.querySelector('#target-size-input');
    const runNo = () => container.querySelector('[data-compress-run]').getAttribute('data-compress-run');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      input.value = '300';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // The new file waits on its password check, so only the old change could start a build.
    // forced: the encryption probe is held open until the test lets it answer
    const probe = hold(probeEncryption, actualProbe.probeEncryption);
    await act(async () => {
      setInputFiles(fileInput, [makePdfFile('second.pdf')]);
    });
    await act(async () => { await probe.started; });
    // The pending change's quiet timer (FAST_QUIET.baseMs, 5) passes while the new file waits on its check.
    await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); await drainPromises(); });
    expect(calls()).toBe(before);
    const runBefore = runNo();
    await act(async () => {
      probe.release();
    });
    await waitUntil(() => runNo() !== runBefore, { dueFakeTimers: true });
    await waitUntil(() => statusOf() === 'done', { dueFakeTimers: true });
    expect(calls()).toBe(before + 1);
  });

  // Board-epic-cleanup: the standalone Compress Image tool merged into this
  // one island (see PdfCompressTool.tsx's `deriveKind` dispatch). These
  // cover the image half; everything above is the PDF path.

  it('dropping an image runs at once with the 100 KB default, a preset runs it again, and the dimensions read before to after', async () => {
    mount();
    const file = await pick(makeImageFile('photo.jpg'));

    // The compression-level picker is PDF-only - an image never shows it.
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(stripName()).toContain('photo.jpg');
    expect(compressImageLib.compressImageToTarget).toHaveBeenCalledTimes(1);
    expect(compressImageLib.compressImageToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 100 }));

    // A photo's shortcuts (Shlomi, 2026-11-03: 500 KB back in place of 20 KB); 50 KB is the tighter
    // photo-cap one only the image presets offer.
    expect(Array.from(container.querySelectorAll('[data-controls] button[aria-pressed]'), (b) => b.textContent)).toEqual(['50 KB', '100 KB', '200 KB', '500 KB']);
    await act(async () => {
      preset('50 KB').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settled();
    expect(preset('50 KB').getAttribute('aria-pressed')).toBe('true');
    expect(compressImageLib.compressImageToTarget).toHaveBeenCalledTimes(2);
    expect(compressImageLib.compressImageToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 50 }));
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();

    const downloadBtn = downloadButton();
    expect(downloadBtn).not.toBeNull();
    const linked = await downloaded();
    expect(linked?.type).toBe('image/jpeg');
    expect(linked.size).toBeLessThanOrEqual(50_000);
    expect(downloadBtn.getAttribute('download')).toBe('photo-compressed.jpg');

    const { width, height } = await createImageBitmap(linked);
    expect(resultCard().textContent).toContain('1600 × 1200');
    expect(resultCard().textContent).toContain(`${width} × ${height}`);
    expect(width).toBeLessThan(1600);
  });

  describe('the old browser notice', () => {
    const OLD_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

    it('stays off a photo, which never loads pdf.js', async () => {
      // forced: a Chrome 108 user agent, which a real browser cannot be told to report
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(OLD_CHROME);
      mount();
      await pick(makeImageFile('photo.jpg'));
      expect(container.textContent).not.toContain('or newer to open PDFs');
    });

    it('still names the version for a PDF', async () => {
      // forced: a Chrome 108 user agent, which a real browser cannot be told to report
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(OLD_CHROME);
      await loadPdf();
      expect(container.textContent).toContain('needs Chrome 109 or newer');
    });
  });

  it('names a passthrough PNG download by its own type', async () => {
    // forced: the result is typed image/png, which the JPEG-only engine never answers
    force(compressImageLib.compressImageToTarget, actualPhoto.compressImageToTarget, (real) => ({ ...real, blob: new Blob([real.blob], { type: 'image/png' }) }));
    mount();
    await pick(makeImageFile('id-scan.png', 'png'));

    const downloadBtn = downloadButton();
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('download')).toBe('id-scan-compressed.png');
  });

  it('renders the comparison automatically for an image result with no rasterization, then no slider at all for a passthrough result', async () => {
    mount();
    const portrait = await pick(makeImageFile('portrait.jpg'));
    const out = await answered(compressImageLib.compressImageToTarget, 0);

    // Opens on its own, same as the PDF case - and with no rasterization,
    // just two object URLs.
    expect(thumbnails.renderComparePreview).not.toHaveBeenCalled();
    const panel = container.querySelector('[data-compare-panel]');
    expect(panel).not.toBeNull();
    const images = panel.querySelectorAll('img');
    expect(images).toHaveLength(2);
    const sides = await Promise.all(Array.from(images).map((img) => harness.blobForUrl(img.getAttribute('src'))));
    expect(sides[0].size).toBe(portrait.size);
    expect(sides[0].type).toBe('image/jpeg');
    expect(sides[1].type).toBe('image/jpeg');
    expect(sides[1].size).toBe(out.blob.size);
    expect(sides[1].size).toBeLessThan(portrait.size);

    // Non-passthrough result: the re-encode notice, not the passthrough one.
    expect(resultCard().textContent).toContain('once compressed, the output is a JPEG');
    expect(resultCard().textContent).not.toContain('so the file is untouched');
    // It is about the file that downloads, so it sits with Download in its own grid row, not under the preview.
    expect(container.querySelector('[data-result-notes]').textContent).toContain('once compressed, the output is a JPEG');
    expect(result().textContent).not.toContain('once compressed, the output is a JPEG');
    expect(container.querySelector('[data-compress-status]').className).toContain('has-notes');

    // Passthrough: compressImageToTarget's early-return hands back the same
    // File as `blob`, so a second, already-under-target image gets no slider
    // - a slider comparing a file to itself is noise. The notice swaps too:
    // nothing was re-encoded, so the format-change warning would be false.
    await pick(makeImageFile('tiny.jpg', 'tiny'));

    expect(container.querySelector('[data-compare-panel]')).toBeNull();
    expect(findButton('Full screen')).toBeUndefined();
    expect(resultCard().textContent).toContain('so the file is untouched: same file, same format, nothing re-encoded');
    expect(resultCard().textContent).not.toContain('once compressed, the output is a JPEG');
    expect(resultCard().textContent).toContain('Already under your target');
    expect(resultCard().textContent).toContain('60 × 40');
    expect(downloadButton()).toBeNull();
    expect(shareButton()).toBeNull();
    expect(result().querySelector('[data-honest-note]')).not.toBeNull();
  });

  it('opens the comparison full screen in a modal dialog, re-rendering at the viewport width once, and closes it again', async () => {
    await loadPdf('fullscreen.pdf');
    await waitUntil(() => container.querySelectorAll('[data-compare-panel] img').length === 2);
    expect(thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
    expect(container.querySelector('dialog[aria-label]')).toBeNull();

    const fullScreen = findButton('Full screen');
    expect(fullScreen).toBeTruthy();

    await act(async () => {
      fullScreen.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitUntil(() => expect(container.querySelector('dialog [role="slider"]')).not.toBeNull());

    const dialog = container.querySelector('dialog[aria-label]');
    expect(dialog).not.toBeNull();
    expect(dialog.open).toBe(true);
    expect(dialog.matches(':modal')).toBe(true);
    expect(dialog.querySelector('[role="slider"]')).not.toBeNull();
    // Two inline renders plus two at the full screen width.
    expect(thumbnails.renderComparePreview).toHaveBeenCalledTimes(4);
    expect(thumbnails.renderComparePreview.mock.calls[2][1]).toBeGreaterThanOrEqual(900);
    for (const img of dialog.querySelectorAll('img')) expect(await isPngPreview(img)).toBe(true);

    const closeButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Close');
    await act(async () => {
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(dialog.open).toBe(false);
    expect(container.querySelector('dialog [role="slider"]')).toBeNull();

    // Re-opening reuses the cached full screen renders.
    await act(async () => {
      findButton('Full screen').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(thumbnails.renderComparePreview).toHaveBeenCalledTimes(4);
    expect(container.querySelector('dialog [role="slider"]')).not.toBeNull();
  });

  it('offers no Full screen button for a passthrough result', async () => {
    await loadPdf('already_small.pdf', 'flateImage');
    await choose('Exact size');
    expect(result().querySelector('[data-honest-note]')).not.toBeNull();
    expect(findButton('Full screen')).toBeUndefined();
  });

  it('renders passthroughNotice, not rasterizeNotice, and no slider for a PDF target-mode passthrough result on the pages-to-pictures path', async () => {
    // compressPdfToTarget's own passthrough rule (src/tools/compress/lib/compress.js,
    // "Already under target") returns the input File itself as `blob` when the
    // file is already under the target size - the PDF-side mirror of
    // compressImageToTarget's rule exercised above.
    const file = await loadPdfAndFlatten('already_small.pdf', 'pictures');
    await choose('Exact size');

    expect(compressLib.compressPdfToTarget).toHaveBeenCalledWith(file, expect.objectContaining({ targetKB: 100 }));
    expect(resultCard().textContent).toContain('so the file is untouched: same file, same format, nothing re-encoded');
    expect(resultCard().textContent).not.toContain('Compression rasterizes PDF pages');
    expect(resultCard().textContent).toContain('Already under your target');
    expect(result().querySelector('[data-honest-note]')).not.toBeNull();
    expect(downloadButton()).toBeNull();
    expect(shareButton()).toBeNull();
    expect(container.querySelector('[data-compare-panel]')).toBeNull();
  });

  it('says a PDF is already as small as it gets, instead of a success, when a level hands the input back', async () => {
    // compressPdf returns the input File itself when a re-rendered copy would
    // be bigger (a small vector PDF) - the same reference check as passthrough.
    const file = await loadPdfAndFlatten('small_form.pdf', 'flateImage');
    const { rasterBytes } = await answered(compressLib.compressPdf, 0);
    expect(rasterBytes).toBeGreaterThan(file.size);

    const text = resultCard().textContent;
    expect(text).toContain('Already as small as it gets');
    expect(text).toContain(`Turned into images, this PDF came to ${formatBytes(rasterBytes)}, more than the ${formatBytes(file.size)} it is now`);
    expect(text).toContain('As images');
    expect(text).toContain('None, original kept');
    expect(container.querySelector('[data-compress-status="done"]')).not.toBeNull();
    expect(text).not.toContain('Compression rasterizes PDF pages');
    expect(downloadButton()).toBeNull();
    expect(shareButton()).toBeNull();
    expect(findButton('Full screen')).toBeUndefined();
  });

  it('says the target cannot be reached this way, with the real numbers, when Exact size hands the input back', async () => {
    const file = await loadPdfAndFlatten('small_form.pdf', 'slight');
    // forced: a target the rasterised copy cannot reach, so the input is handed back
    force(compressLib.compressPdfToTarget, actualFlatten.compressPdfToTarget, (real, input) => ({ ...real, blob: input, metTarget: false }));
    await choose('Exact size');
    const { rasterBytes } = await answered(compressLib.compressPdfToTarget, 0);

    const text = resultCard().textContent;
    expect(text).toContain(formatBytes(rasterBytes));
    expect(text).toContain('100 KB can');
    expect(text).toContain("can't be reached this way");
    expect(text).toContain('As images');
    expect(text).not.toContain('Closest achievable');
    expect(downloadButton()).toBeNull();
  });

  describe('the strip note', () => {
    const NOTE = 'Nothing here to shrink.';

    it('formatShare rounds to a whole percent and floors tiny shares', () => {
      expect(formatShare(0.004)).toBe('less than 1%');
      expect(formatShare(0.126)).toBe('13%');
      expect(formatShare(0.994)).toBe('99%');
    });

    it('a mostly-image PDF says the images are what gets smaller', async () => {
      await loadPdf('pics.pdf', 'pictures');
      expect(stripNote()).toBe('Images are 90% of this PDF, the part that gets smaller.');
    });

    it('a pure scan names its share the same way, without talking about text', async () => {
      await loadPdf('scan.pdf', 'scan');
      expect(stripNote()).toContain('Images are 100% of this PDF');
      expect(stripNote()).not.toContain('text');
    });

    it('a mostly-text PDF gets the quiet note', async () => {
      await loadPdf('mixed.pdf', 'mixed');
      expect(stripNote()).toBe('Most of this PDF is text. Images are 12% of it.');
    });

    it('the pages-to-pictures switch hides the share note and unticking brings it back', async () => {
      await loadPdfAndFlatten('pics.pdf', 'pictures');
      expect(stripNote()).toBe('');
      await act(async () => {
        flattenSwitch().click();
      });
      await settled();
      expect(stripNote()).toContain('Images are 90% of this PDF');
    });

    it('a PDF with no images says only that there is nothing here to shrink', async () => {
      await loadPdf('text_only.pdf', 'textOnly');
      expect(stripNote()).toBe(NOTE);
    });

    it('shows no nothing-to-shrink note when the PDF has an image', async () => {
      await loadPdf('photo.pdf');
      expect(stripNote()).not.toContain(NOTE);
    });

    it('an image has no note, and reserves no lines for one', async () => {
      mount();
      await pick(makeImageFile('photo.jpg'));
      expect(container.querySelector('[data-compress-note]')).toBeNull();
      expect(container.querySelector('[data-tool-shell] [data-note]')).toBeNull();
    });

    // The switch's own hint is the visible trace of what the analysis saw: it says "Text stops being selectable"
    // only for a PDF that has text. The images cannot be recompressed here, which is what brings the switch out.
    const unsupportedImages = () => {
      // forced: the image pass reports the images cannot be recompressed, which is what brings the switch out
      vi.mocked(imagesLib.compressPdfImages).mockImplementationOnce(async (file) => untouched('unsupported')(file));
    };
    const flattenHint = () => flattenSwitch().closest('label').textContent;

    it('re-reads an encrypted PDF with an empty password so text detection sees plaintext', async () => {
      // owner-only.pdf: AES-256, an empty user password, the text "hi 0". Read as it is, its page streams are
      // ciphertext and show no text; only the empty-password re-read sees the text.
      unsupportedImages();
      await loadPdf('restricted.pdf', 'ownerOnly');
      expect(stripNote()).toBe('Nothing here to shrink.');
      expect(flattenHint()).toContain(englishCompressMessages.flattenHint);
    });

    it('keeps the first read when the empty-password re-read throws', async () => {
      // needs-password.pdf wants the real password "u", so the empty one throws and the encrypted first read is analysed.
      unsupportedImages();
      mount();
      const locked = makePdfFile('locked.pdf', 'needsPassword');
      // forced: the encryption probe answers 'open' for a file that needs a password
      vi.mocked(probeEncryption).mockImplementationOnce(async () => 'open');
      await pick(locked);
      expect(stripNote()).toBe('Nothing here to shrink.');
      expect(flattenHint()).toContain(englishCompressMessages.flattenHintNoText);
    });

    it('drops an analysis that lands after a newer file was added', async () => {
      // A (no images) is held in its analysis: the probe reads its bytes first, the analysis second.
      const a = makePdfFile('a.pdf', 'textOnly');
      const read = a.arrayBuffer.bind(a);
      let reads = 0;
      let releaseA;
      const held = Promise.withResolvers<void>();
      a.arrayBuffer = () => (++reads === 2 ? new Promise((resolve) => { releaseA = () => resolve(read()); held.resolve(); }) : read());
      mount();
      await act(async () => { setInputFiles(fileInput, [a]); });
      await act(async () => { await held.promise; });
      // A's analysis is still pending; B arrives and is analysed (images present). A cannot finish before it is
      // released, so the second analysis from here on is A's, whether the hook then applies or drops it.
      await pick(makePdfFile('b.pdf', 'pictures'));
      releaseA();
      // A's analysis starts from its own real open of the file: once that has resolved, only the synchronous
      // analysis and the hook's drop-or-apply step are left, which the drain below runs through.
      const aOpened = vi.mocked(openPdfDoc).mock.calls.findIndex(([opened]) => opened === a);
      await vi.mocked(openPdfDoc).mock.results[aOpened].value;
      await act(async () => { await drainPromises(); });

      // B has an image, A's (image-free) result must not leak onto it.
      expect(stripNote()).not.toContain(NOTE);
    });
  });

  describe('images only by default, pages into pictures by switch', () => {
    it('Balanced calls compressPdfImages with the medium level and never compressPdf', async () => {
      const file = await loadPdf();
      expect(imagesLib.compressPdfImages).toHaveBeenCalledWith(file, expect.objectContaining({ maxLongSidePx: 1600, quality: 0.6 }));
      expect(compressLib.compressPdf).not.toHaveBeenCalled();
      // A big saving has nothing to add: no notice.
      expect(resultCard().textContent).not.toContain('Only the images were made smaller');
      expect(resultCard().querySelector('[data-compress-warning]')).toBeNull();
    });

    it('the switch is absent on a fresh result with a good saving, and present after the images could not be recompressed', async () => {
      await loadPdf();
      expect(status()).toBe('done');
      expect(flattenSwitch()).toBeNull();
      container.remove();
      container = undefined;

      await loadPdf('odd.pdf', 'pictures');
      expect(flattenSwitch()).not.toBeNull();
      expect(flattenSwitch().checked).toBe(false);
    });

    describe('result card honesty (COMP-02)', () => {
      const stats = () => resultCard();
      const title = () => stats().querySelector('[data-stats-title]').textContent;
      const savedText = (input, output) => {
        const percent = percentSmaller(input.size, output.size);
        return percent >= 1 ? `${percent}%` : 'less than 1%';
      };
      const answerWithSaving = (fn, share) => {
        // forced: an output exactly this much smaller than the input, which a real file only approaches
        vi.mocked(fn).mockImplementationOnce(async (file) => savedShare(file, share));
      };

      it('a 1% result at Balanced says only a little smaller, already compact, and points at Extreme', async () => {
        const file = await loadPdf('doc.pdf', 'slight');
        expect(title()).toBe('Only a little smaller');
        expect(stats().textContent).toContain(`already compact, so making them smaller saved ${savedText(file, await downloaded())}.`);
        expect(stats().textContent).toContain('"Smallest" can go further');
        expect(downloadButton()).not.toBeNull();
        // The switch is offered here: the images could not carry the saving.
        expect(flattenSwitch()).not.toBeNull();
      });

      it('at the smallest level the same result has no Extreme hint', async () => {
        const file = await loadPdf('doc.pdf', 'slight');
        await choose('Smallest');
        expect(title()).toBe('Only a little smaller');
        expect(stats().textContent).toContain(`already compact, so making them smaller saved ${savedText(file, await downloaded())}.`);
        expect(stats().textContent).not.toContain('"Smallest" can go further');
      });

      it('when most image bytes were kept it says they could not be recompressed', async () => {
        await loadPdf('doc.pdf', 'mostlyKept');
        expect(stats().textContent).toContain("stored in a way I can't recompress, so it stayed as it was and this saved less than 1%");
        expect(stats().textContent).not.toContain('already compact');
      });

      it('4% still gets the slight-gain title', async () => {
        mount();
        answerWithSaving(imagesLib.compressPdfImages, 0.04);
        await pick(makePdfFile('doc.pdf'));
        expect(title()).toBe('Only a little smaller');
        expect(stats().textContent).toContain('saved 4%');
      });

      it('5% and over has no title and shows no notice', async () => {
        mount();
        answerWithSaving(imagesLib.compressPdfImages, 0.06);
        await pick(makePdfFile('doc.pdf'));
        expect(stats().querySelector('[data-stats-title]')).toBeNull();
        expect(stats().querySelector('[data-compress-warning]')).toBeNull();
        expect(stats().querySelector('[data-honest-note]')).toBeNull();
      });

      it('an image re-encoded but not smaller reads as compact, not kept', async () => {
        await loadPdf('doc.pdf', 'slight');
        expect(stats().textContent).toContain('already compact');
        expect(stats().textContent).not.toContain("can't recompress");
      });

      it('exactly 5% has no slight-gain title', async () => {
        mount();
        answerWithSaving(imagesLib.compressPdfImages, 0.05);
        await pick(makePdfFile('doc.pdf'));
        expect(stats().querySelector('[data-stats-title]')).toBeNull();
      });

      it('the flatten path under 5% gets the title and keeps its rasterize notice', async () => {
        await loadPdf('doc.pdf', 'pictures');
        // forced: a rasterised copy only 1% smaller than the file
        vi.mocked(compressLib.compressPdf).mockImplementationOnce(async (file) => ({ blob: savedShare(file, 0.01).blob, rasterBytes: Math.round(file.size * 0.99) }));
        await act(async () => {
          flattenSwitch().click();
        });
        await settled();
        expect(title()).toBe('Only a little smaller');
        expect(stats().textContent).not.toContain('already compact');
        expect(stats().querySelector('[data-compress-warning]').textContent).toBe(englishCompressMessages.rasterizeNotice);
      });

      it('Exact size met with a small gain has no title', async () => {
        await loadPdf();
        // forced: a target met with an output only 1% smaller than the file
        vi.mocked(imagesLib.compressPdfImagesToTarget).mockImplementationOnce(async (file) => ({ ...savedShare(file, 0.01), metTarget: true }));
        await choose('Exact size');
        expect(stats().querySelector('[data-stats-title]')).toBeNull();
        expect(stats().textContent).not.toContain('already compact');
      });

      it('no result card text mentions links or drawings', async () => {
        for (const shape of ['slight', 'photo']) {
          await loadPdf('doc.pdf', shape);
          if (shape === 'slight') expect(stats().textContent).toContain('already compact');
          expect(stats().textContent).not.toMatch(/links|drawings/);
          container.remove();
          container = undefined;
        }
      });

      it('the compare caption names page 1 only for a multi-page PDF', async () => {
        await loadPdf('doc.pdf', 'photoSingle');
        await waitUntil(() => container.querySelectorAll('[data-compare-panel] img').length === 2);
        expect(container.textContent).toContain('Drag to compare the original and the compressed page.');
        expect(container.textContent).not.toContain('rest of the document');
        container.remove();
        container = undefined;
        await loadPdf();
        await waitUntil(() => container.querySelectorAll('[data-compare-panel] img').length === 2);
        expect(container.textContent).toContain('Drag to compare page 1 with the original.');
        expect(container.textContent).not.toContain('rest of the document');
      });
    });

    it('ticking the switch calls compressPdf and not compressPdfImages again', async () => {
      await loadPdfAndFlatten();
      expect(compressLib.compressPdf).toHaveBeenCalled();
      expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['no-images', 'textOnly', 'There are no images in this PDF'],
      ['no-gain', 'flateImage', 'already compact, so making them smaller saved nothing'],
      ['encrypted', 'textOnly', "This PDF is locked, so its images can't be recompressed here"],
      ['unsupported', 'pictures', "stored in a way I can't recompress, so nothing was changed"],
    ])('reason %s shows its notice and says the PDF is unchanged', async (reason, shape, text) => {
      // forced: a PDF whose lock cannot be carried across, which no fixture here is
      if (reason === 'encrypted') vi.mocked(imagesLib.compressPdfImages).mockImplementationOnce(async (file) => untouched('encrypted')(file));
      await loadPdf('same.pdf', shape);
      const stats = resultCard();
      expect(stats.textContent).toContain(text);
      // A locked file was never tried, so it is not "as small as it gets".
      const title = reason === 'encrypted' ? 'This PDF is locked' : reason === 'unsupported' ? 'Left as it was' : 'Already as small as it gets';
      expect(stats.querySelector('[data-stats-title]').textContent).toBe(title);
      expect(stats.textContent).toContain('None, original kept');
      expect(stats.textContent).not.toContain('As images');
      expect(stats.textContent).toContain('Original Size');
      expect(stats.querySelector('[data-honest-note]')).not.toBeNull();
      expect(downloadButton()).toBeNull();
      expect(shareButton()).toBeNull();
      expect(findButton('Full screen')).toBeUndefined();
      // The switch is the way forward after these two, and nothing the others can use.
      expect(flattenSwitch() !== null).toBe(reason === 'unsupported' || reason === 'no-gain');
      // The screen reader hears what the card title says.
      const live = container.querySelector('[role="status"].sr-only').textContent;
      if (reason === 'encrypted' || reason === 'unsupported') expect(live).toBe(title);
    });

    it('reason under-target shows the untouched notice and is not "already as small as it gets"', async () => {
      await loadPdf('tiny.pdf', 'flateImage');
      await choose('Exact size');
      const stats = resultCard();
      expect(stats.textContent).toContain('so the file is untouched');
      expect(stats.textContent).not.toContain('Already as small as it gets');
      expect(stats.textContent).toContain('Already under your target');
      expect(stats.querySelector('[data-honest-note]')).not.toBeNull();
      expect(downloadButton()).toBeNull();
    });

    it('a smaller result still has Download and Share, and a big saving has no notice', async () => {
      const nativeShare = mockNativeFileShare();
      await loadPdf();
      expect(downloadButton()).not.toBeNull();
      expect(shareButton()).not.toBeNull();
      expect(result().querySelector('[data-honest-note]')).toBeNull();
      expect(resultCard().querySelector('[data-compress-warning]')).toBeNull();
      nativeShare.restore();
    });

    // ARCH-41: the shared finish. The rail's buttons and the phone strip's chips agree.
    const handoffLabels = () => Array.from(container.querySelectorAll('[data-result-action] button')).map((b) => b.textContent.trim());
    it('a PDF finish offers Share, Sign and Merge, and never Compress', async () => {
      const nativeShare = mockNativeFileShare();
      await loadPdf();
      expect(handoffLabels()).toEqual(['Share', 'Sign', 'Merge']);
      noCompressButton();
      nativeShare.restore();
    });

    it('an image finish is Share only, with no hand-off to another tool', async () => {
      const nativeShare = mockNativeFileShare();
      mount();
      await pick(makeImageFile('photo.jpg'));
      await settled();
      expect(status()).toBe('done');
      expect(handoffLabels()).toEqual(['Share']);
      nativeShare.restore();
    });

    it('after a passthrough, picking another level runs again and the result comes back', async () => {
      mount();
      // forced: the first run finds nothing to gain and hands the file back
      vi.mocked(imagesLib.compressPdfImages).mockImplementationOnce(async (file) => untouched('no-gain')(file));
      await pick(makePdfFile('same.pdf'));
      expect(downloadButton()).toBeNull();
      await choose('Smallest');
      expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
      expect(downloadButton()).not.toBeNull();
      noCompressButton();
    });

    it('a target missed on the image path names both sizes, drops "Closest achievable", and offers the switch', async () => {
      await loadPdf('big.pdf', 'slight');
      await choose('Exact size');
      const { blob } = await answered(imagesLib.compressPdfImagesToTarget, 0);
      expect(blob.size).toBeGreaterThan(100_000);
      const stats = resultCard();
      expect(stats.textContent).not.toContain('Only the images were made smaller');
      expect(stats.textContent).toContain(`Shrinking the images got this PDF to ${formatBytes(blob.size)}, above your 100 KB target. Turning the pages into pictures, with the switch above, can go smaller.`);
      expect(stats.textContent).not.toContain('Closest achievable');
      expect(flattenSwitch()).not.toBeNull();
    });

    it('has no switch for an image file', async () => {
      mount();
      await pick(makeImageFile('photo.jpg'));
      expect(container.querySelector('[data-flatten-switch]')).toBeNull();
    });

    it('unticking the switch returns at once to the image-path result already built, with no new build', async () => {
      await loadPdfAndFlatten();
      expect(compressLib.compressPdf).toHaveBeenCalledTimes(1);
      expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
      expect(flattenSwitch().checked).toBe(true);

      await act(async () => {
        flattenSwitch().click();
      });
      expect(status()).toBe('done');
      expect(flattenSwitch().checked).toBe(false);
      await drain();
      expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
      expect(compressLib.compressPdf).toHaveBeenCalledTimes(1);
    });

    it('unticking the switch builds the image path when it was not built before', async () => {
      await loadPdfAndFlatten();
      await choose('Smallest');
      expect(compressLib.compressPdf).toHaveBeenCalledTimes(2);
      await act(async () => {
        flattenSwitch().click();
      });
      // Silent: the last result stays on screen until the new build lands.
      expect(status()).toBe('processing');
      await settled();
      expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
      expect(status()).toBe('done');
    });
  });

  it('isolates a skipped file name inside the Hebrew sentence, and only in Hebrew', async () => {
    const skippedHint = async (props) => {
      mount(props);
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [new File(['plain text'], '2025-notes.txt', { type: 'text/plain' })]);
      });
      return container.querySelector('[role="status"]').textContent;
    };
    expect(await skippedHint({ messages: hebrewCompressMessages })).toContain('⁨2025-notes.txt⁩');
    act(() => render(null, container));
    container.remove();
    const english = await skippedHint({});
    expect(english).toContain('2025-notes.txt');
    expect(english).not.toContain('⁨');
  });

  it('rejects a file that is not a PDF, JPG or PNG', async () => {
    mount();
    const textFile = new File(['plain text'], 'notes.txt', { type: 'text/plain' });

    await act(async () => {
      setInputFiles(container.querySelector('input[type="file"]'), [textFile]);
    });

    const hint = container.querySelector('[role="status"]');
    expect(hint).not.toBeNull();
    expect(hint.textContent).toContain('notes.txt');
    expect(hint.textContent).toContain('not a PDF, JPG or PNG');

    // Rejecting doesn't load a file, so the dropzone is still showing.
    expect(container.querySelector('[data-dropzone]')).not.toBeNull();
    expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressImageLib.compressImageToTarget).not.toHaveBeenCalled();
  });

  // DEBT-59: the funnel counts the person's tap, not the builds an option change starts.
  describe('usage events (DEBT-59)', () => {
    const events = async (name) => {
      await harness.flush();
      return harness.usageEvents(name).length;
    };

    it('counts neither started nor ready for the builds a pick and option changes start', async () => {
      await loadPdf('test_doc.pdf');
      await choose('Smallest');
      await choose('Sharpest');
      expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(3);
      expect(status()).toBe('done');
      expect(await events('tool_operation_started')).toBe(0);
      expect(await events('tool_result_ready')).toBe(0);
    });

    it('counts one started and one ready for a Download tap, again after a change', async () => {
      await loadPdf('test_doc.pdf');
      await act(async () => { downloadButton().click(); });
      await settled();
      expect(await events('tool_operation_started')).toBe(1);
      expect(await events('tool_result_ready')).toBe(1);
      await choose('Smallest');
      expect(await events('tool_operation_started')).toBe(1);
      await act(async () => { downloadButton().click(); });
      await settled();
      expect(await events('tool_operation_started')).toBe(2);
      expect(await events('tool_result_ready')).toBe(2);
    });

    it('counts a tap on a stale result as started, and ready once the build lands', async () => {
      await loadPdf('test_doc.pdf');
      // forced: the next build is held open until the test lets it finish
      const slow = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
      await act(async () => { radio('Smallest').click(); });
      await act(async () => { downloadButton().click(); });
      expect(await events('tool_operation_started')).toBe(1);
      expect(await events('tool_result_ready')).toBe(0);
      await act(async () => { slow.release(); });
      await settled();
      expect(await events('tool_operation_started')).toBe(1);
      expect(await events('tool_result_ready')).toBe(1);
    });

    it('counts a failed build, then started and ready for the Try again tap', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      // forced: the engine rejects
      vi.mocked(imagesLib.compressPdfImages).mockImplementationOnce(() => Promise.reject(new Error('boom')));
      await loadPdf('flaky.pdf');
      expect(await events('tool_operation_failed')).toBe(1);
      expect(await events('tool_operation_started')).toBe(0);
      await act(async () => { tryAgain().click(); });
      await settled();
      expect(await events('tool_operation_started')).toBe(1);
      expect(await events('tool_result_ready')).toBe(1);
    });

    it('reports an edit when the person changes an option, not on arrival', async () => {
      await loadPdf('test_doc.pdf');
      await harness.flush();
      expect(harness.usageEvents('tool_first_edit')).toHaveLength(0);
      await choose('Smallest');
      await harness.flush();
      expect(harness.usageEvents('tool_first_edit').map((e) => e.properties.tool)).toEqual(['compress']);
    });
  });

  it('records what the person did, by name only, in order', async () => {
    await loadPdf('secret_name.pdf');
    await choose('Smallest');
    expect(recentActions()).toEqual(['add_files', 'export', 'change_setting', 'export']);
  });

  // Guideline §2, "Quiet means quiet": an option change waits for the person to go quiet, builds
  // silently, and Download keeps showing the last result meanwhile.
  describe('quiet-time prepare', () => {
    const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    const runNo = () => container.querySelector('[data-compress-run]').getAttribute('data-compress-run');
    const busyButton = () => container.querySelector('[data-result-action] [data-state="preparing"]');
    const click = (name) => act(async () => { radio(name).click(); });
    const calls = () => imagesLib.compressPdfImages.mock.calls.length;
    const ready = () => waitUntil(() => statusOf() === 'done', { dueFakeTimers: true });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    });

    const open = async (name = 'doc.pdf') => {
      mount({ quietPolicy: undefined });
      await act(async () => { setInputFiles(fileInput, [makePdfFile(name)]); });
      await advance(100);
    };

    it('starts the first run at once once the encryption probe lets the file run, not after the quiet wait', async () => {
      // forced: the encryption probe is held open until the test lets it answer
      const probing = hold(probeEncryption, actualProbe.probeEncryption);
      await open();
      expect(calls()).toBe(0);
      await act(async () => { probing.release(); });
      await ready();
      expect(calls()).toBe(1);
      expect(status()).toBe('done');
    });

    it('shows the original size in a ready Download before the first result, with no compressing look', async () => {
      // forced: the first run is held open and never finishes
      const first = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
      await open();
      await waitUntil(() => runNo() === '1', { dueFakeTimers: true });
      await act(async () => { await first.started; });
      expect(calls()).toBe(1);
      expect(downloadButton().textContent).toContain(formatBytes(BYTES.photo.byteLength));
      expect(busyButton()).toBeNull();
    });

    it('does not rebuild before 1500ms after a level change, and shows the last result meanwhile', async () => {
      await open();
      await ready();
      await advance(4000);
      expect(calls()).toBe(1);
      const before = downloadButton().textContent;
      const first = (await downloaded()).size;
      await click('Smallest');
      await advance(1400);
      expect(calls()).toBe(1);
      expect(busyButton()).toBeNull();
      expect(downloadButton().textContent).toBe(before);
      expect(container.querySelector('[data-compress-sizes]').textContent).toContain(formatBytes(first));
      await advance(200);
      await ready();
      expect(calls()).toBe(2);
      expect(imagesLib.compressPdfImages.mock.calls[1][1]).toEqual(expect.objectContaining({ maxLongSidePx: 1000 }));
    });

    it('is instant, with no build, when going back to a level already built', async () => {
      await open();
      await ready();
      await advance(4000);
      await click('Smallest');
      await advance(1700);
      await ready();
      expect(calls()).toBe(2);
      await click('Balanced');
      expect(status()).toBe('done');
      await advance(5000);
      expect(calls()).toBe(2);
    });

    it('raises data-compress-run exactly once per started build', async () => {
      await open();
      await ready();
      await advance(4000);
      expect(runNo()).toBe('1');
      await click('Smallest');
      await click('Sharpest');
      expect(runNo()).toBe('1');
      await advance(2500);
      await ready();
      expect(runNo()).toBe('2');
      await click('Balanced');
      await advance(5000);
      expect(runNo()).toBe('2');
      expect(calls()).toBe(2);
    });

    it('shows the compressing look only after a tap before the build is done, then delivers', async () => {
      await open();
      await ready();
      await advance(4000);
      // forced: the next build is held open until the test lets it finish
      const slow = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
      await click('Smallest');
      await advance(100);
      const clicks = [];
      const record = (e) => { const a = e.target.closest('[data-result-action] a[data-state]'); if (a) clicks.push(e.defaultPrevented); };
      document.addEventListener('click', record);
      try {
        await act(async () => { downloadButton().click(); });
        await act(async () => { await slow.started; });
        expect(calls()).toBe(2);
        expect(busyButton()).not.toBeNull();
        expect(clicks).toEqual([true]);
        await act(async () => { slow.release(); });
        await waitUntil(() => busyButton() === null, { dueFakeTimers: true });
        // The shared flow delivers the file itself, so the anchor sees no second click.
        expect(clicks).toEqual([true]);
      } finally {
        document.removeEventListener('click', record);
      }
    });

    it('starts the build at once on pointerdown on Download', async () => {
      await open();
      await ready();
      await advance(4000);
      await click('Smallest');
      await advance(200);
      expect(calls()).toBe(1);
      await act(async () => { downloadButton().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
      await waitUntil(() => runNo() === '2', { dueFakeTimers: true });
      await ready();
      expect(calls()).toBe(2);
    });
  });

  it('puts the before to after sizes and the percent-smaller tag in the shell strip, beside the file meta', async () => {
    const file = await loadPdf('shell.pdf');
    const out = await downloaded();
    const shell = container.querySelector('[data-tool-shell]');
    const sizes = shell.querySelector('[data-compress-sizes]');
    expect(sizes).not.toBeNull();
    expect(sizes.textContent).toContain(formatBytes(file.size));
    expect(sizes.textContent).toContain('→');
    expect(sizes.textContent).toContain(formatBytes(out.size));
    expect(sizes.textContent).toContain(`${percentSmaller(file.size, out.size)}% smaller`);
  });

  it('points the sizes arrow left in right-to-left text and shows only the original before a result', async () => {
    mount({ messages: hebrewCompressMessages });
    // forced: the run is held open, so no result exists yet
    const run = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
    const file = await pick(makePdfFile('rtl.pdf'), run.started);
    expect(container.querySelector('[data-compress-sizes]').textContent).toBe(formatBytes(file.size));
    act(() => render(null, container));
    container.remove();
    mount({ messages: hebrewCompressMessages });
    await pick(makePdfFile('rtl.pdf'));
    const sizes = container.querySelector('[data-compress-sizes]').textContent;
    expect(sizes).toContain('←');
    expect(sizes).not.toContain('→');
  });

  // The size ("15 Bytes") inside the Hebrew detail line must be bidi-isolated
  // or it renders reversed; English stays untouched.
  describe('the download detail line size', () => {
    const compressAndReadDetail = async (props) => {
      mount(props);
      await pick(makePdfFile('test_doc.pdf'));
      return downloadButton().textContent;
    };

    it('wraps the size in LRI/PDI in Hebrew', async () => {
      const detail = await compressAndReadDetail({ messages: hebrewCompressMessages });
      expect(detail).toMatch(/⁦[^⁦⁩]*\d[^⁦⁩]*⁩/);
    });

    it('adds no isolates in English', async () => {
      const detail = await compressAndReadDetail({});
      expect(detail).toMatch(/\d+(\.\d+)? [KM]B/);
      expect(detail).not.toContain('⁦');
      expect(detail).not.toContain('⁩');
    });
  });

  it('re-clicking the selected target preset while its build is in flight still lands the result', async () => {
    await loadPdf('big_scan.pdf');
    await choose('Exact size');
    // forced: the next build is held open until the test lets it finish
    const held = hold(imagesLib.compressPdfImagesToTarget, actualImages.compressPdfImagesToTarget);
    await act(async () => { preset('200 KB').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await held.started; });
    await drain();
    await act(async () => { preset('200 KB').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { held.release(); });
    await waitUntil(() => expect(statusOf()).toBe('done'));
  });

  describe('COMP-04 several photos', () => {
    const rows = () => Array.from(container.querySelectorAll('li[data-batch-photo]'));
    const outcomes = () => rows().map((r) => r.getAttribute('data-outcome'));
    const pickMany = async (files, until) => {
      await act(async () => {
        setInputFiles(fileInput, files);
      });
      await settleOn(until);
    };
    const toTarget = compressImageLib.compressImageToTarget;
    const finishedAt = (kb) => waitUntil(() => statusOf() === 'done' && container.querySelector('[data-batch-summary]')?.textContent.includes(`${kb} KB`));
    const broken = (name) => makeImageFile(name, 'broken');

    it('two photos show the batch, one call per file in order, every row met, and no single-photo result', async () => {
      mount();
      const a = makeImageFile('a.jpg');
      const b = makeImageFile('b.jpg', 'portrait');
      await pickMany([a, b]);
      expect(container.querySelector('[data-compress-batch]')).not.toBeNull();
      expect(rows()).toHaveLength(2);
      expect(toTarget).toHaveBeenCalledTimes(2);
      expect(toTarget.mock.calls[0][0]).toBe(a);
      expect(toTarget.mock.calls[1][0]).toBe(b);
      expect(toTarget.mock.calls[0][1]).toEqual(expect.objectContaining({ targetKB: 100 }));
      expect(toTarget.mock.calls[1][1]).toEqual(expect.objectContaining({ targetKB: 100 }));
      expect(outcomes()).toEqual(['met', 'met']);
      expect(statusOf()).toBe('done');
      expect(container.querySelector('[data-result]')).toBeNull();
      // The set is the photos themselves: one Save lives in each photo's preview, not on every tile.
      expect(container.querySelectorAll('[data-batch-save]')).toHaveLength(0);
    });

    it('shows each photo from its original, rendered once, and keeps them through a new target', async () => {
      mount();
      const a = makeImageFile('a.jpg');
      const b = makeImageFile('b.jpg', 'portrait');
      await pickMany([a, b]);
      const sources = () => rows().map((r) => r.querySelector('img')?.getAttribute('src'));
      await waitUntil(() => sources().every((src) => src?.startsWith('data:image/jpeg;base64,')));
      const [first, second] = await Promise.all(sources().map(decodedSize));
      expect(first.width).toBeGreaterThan(first.height);
      expect(second.height).toBeGreaterThan(second.width);
      expect(thumbnails.renderThumbnail.mock.calls.map((c) => c[0])).toEqual([a, b]);
      const before = sources();
      await act(async () => { preset('50 KB').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await finishedAt(50);
      await drain();
      expect(thumbnails.renderThumbnail).toHaveBeenCalledTimes(2);
      expect(sources()).toEqual(before);
    });

    it('the strip names the set by its first photo and sums it, before and after', async () => {
      mount();
      const a = makeImageFile('a.jpg');
      const b = makeImageFile('b.jpg', 'portrait');
      await pickMany([a, b]);
      const outputs = await Promise.all(toTarget.mock.results.map((r) => r.value));
      const after = outputs[0].blob.size + outputs[1].blob.size;
      const strip = container.querySelector('[data-strip]');
      expect(strip.textContent).toContain('2 photos');
      const sizes = strip.querySelector('[data-compress-sizes]').textContent;
      expect(sizes).toContain(formatBytes(a.size + b.size));
      expect(sizes).toContain(formatBytes(after));
      expect(sizes).toContain(`${percentSmaller(a.size + b.size, after)}% smaller`);
    });

    it('runs one photo at a time', async () => {
      mount();
      // forced: the first photo is held open until the test lets it finish
      const first = hold(toTarget, actualPhoto.compressImageToTarget);
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')], first.started);
      await drain();
      expect(toTarget).toHaveBeenCalledTimes(1);
      expect(statusOf()).toBe('processing');
      await act(async () => { first.release(); });
      await settled();
      expect(toTarget).toHaveBeenCalledTimes(2);
    });

    it('the strip sums only the photos Download saves when one fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();
      const a = makeImageFile('a.jpg');
      await pickMany([a, broken('b.png')]);
      const kept = (await answered(toTarget, 0)).blob.size;
      const sizes = container.querySelector('[data-strip] [data-compress-sizes]').textContent;
      expect(sizes).toContain(formatBytes(a.size));
      expect(sizes).toContain(formatBytes(kept));
      expect(sizes).toContain(`${percentSmaller(a.size, kept)}% smaller`);
    });

    it('draws no thumbnail while a photo is compressing: one big image in memory at a time', async () => {
      mount();
      // forced: the first photo is held open until the test lets it finish
      const first = hold(toTarget, actualPhoto.compressImageToTarget);
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')], first.started);
      await drain();
      expect(thumbnails.renderThumbnail).not.toHaveBeenCalled();
      await act(async () => { first.release(); });
      await settled();
      await waitUntil(() => rows().every((r) => r.querySelector('img')));
      expect(thumbnails.renderThumbnail).toHaveBeenCalledTimes(2);
    });

    it('a failed or unchanged photo says its state once to a screen reader', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();
      await pickMany([broken('a.png'), makeImageFile('b.jpg', 'tiny')]);
      const [failed, kept] = rows().map((r) => r.querySelector('[data-batch-caption]').textContent);
      expect(failed).toBe("Couldn't read this one");
      expect(kept).toBe('287 Bytes · unchanged');
    });

    it('names missed, kept and failed rows and still finishes', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();
      // forced: the first photo's target cannot be reached, so its verdict is a miss
      force(toTarget, actualPhoto.compressImageToTarget, (real) => ({ ...real, metTarget: false }));
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'tiny'), broken('c.png')]);
      expect(outcomes()).toEqual(['missed', 'kept', 'failed']);
      expect(statusOf()).toBe('done');
    });

    it('a preset target recompresses every photo with that target', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      expect(toTarget).toHaveBeenCalledTimes(2);
      await act(async () => {
        preset('50 KB').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await finishedAt(50);
      expect(toTarget).toHaveBeenCalledTimes(4);
      expect(toTarget.mock.calls[2][1]).toEqual(expect.objectContaining({ targetKB: 50 }));
      expect(toTarget.mock.calls[3][1]).toEqual(expect.objectContaining({ targetKB: 50 }));
      expect(outcomes()).toEqual(['met', 'met']);
    });

    it('a PDF picked among photos is named as left out and never compressed as a photo', async () => {
      mount();
      const pdf = makePdfFile('notes.pdf');
      await pickMany([makeImageFile('a.jpg'), pdf, makeImageFile('b.jpg', 'portrait')]);
      expect(rows()).toHaveLength(2);
      // Inside the stage, under its status line, not a band above the card's columns.
      expect(container.querySelector('[data-batch] [data-batch-left-out]').textContent).toContain('notes.pdf');
      expect(toTarget.mock.calls.map((c) => c[0])).not.toContain(pdf);
      expect(toTarget).toHaveBeenCalledTimes(2);
    });

    it('a PDF picked with one photo is named as left out too', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makePdfFile('notes.pdf')]);
      expect(container.querySelector('[data-compress-batch]')).toBeNull();
      expect(container.textContent).toContain('Left out "notes.pdf"');
    });

    it('the status line counts a photo that could not be read apart from the ones that missed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();
      await pickMany([makeImageFile('a.jpg'), broken('b.png')]);
      expect(container.querySelector('[data-batch-summary]').textContent).toBe("1 of 2 photos are now 100 KB or less. One couldn't be read.");
    });

    it('the strip shows the first photo that could be drawn', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();
      const bad = broken('bad.png');
      const good = makeImageFile('good.jpg');
      await pickMany([bad, good]);
      await waitUntil(() => !!container.querySelector('[data-strip] img'));
      const cover = await harness.blobForUrl(container.querySelector('[data-strip] img').getAttribute('src'));
      expect(cover.size).toBe(good.size);
      expect(cover.size).not.toBe(bad.size);
    });

    it('an unchanged photo is named by its name alone, not offered as a comparison', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'tiny')]);
      expect(Array.from(container.querySelectorAll('[data-batch-open]')).map((el) => el.getAttribute('aria-label'))).toEqual(['Compare a.jpg', 'b.jpg']);
    });

    it("opening a photo brings its preview's bar into view", async () => {
      mount();
      const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      await act(async () => { container.querySelector('[data-batch-open]').click(); });
      await settled();
      expect(scrolled.mock.contexts).toContain(container.querySelector('[data-batch-preview-bar]'));
    });

    it('counts the Download tap, not the compression a pick starts', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      await harness.flush();
      expect(harness.usageEvents('tool_operation_started')).toHaveLength(0);
      expect(harness.usageEvents('tool_result_ready')).toHaveLength(0);
    });

    it("announces the finished set once, and names each photo's button by its photo", async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      const live = container.querySelector('[data-batch-live]');
      expect(live.textContent).toBe(container.querySelector('[data-batch-summary]').textContent);
      expect(Array.from(container.querySelectorAll('[data-batch-open]')).map((b) => b.getAttribute('aria-label'))).toEqual(['Compare a.jpg', 'Compare b.jpg']);
      expect(container.querySelector('[data-batch] ol').getAttribute('role')).toBe('list');
    });

    it('a finished row opens its photo in the compare preview with Full screen, and Back returns to the list', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      expect(container.querySelector('[data-result]')).toBeNull();
      await act(async () => { container.querySelector('[data-batch-open]').click(); });
      await settled();
      // The set stays mounted behind the preview, so its scroll and pictures are as they were on the way back.
      expect(container.querySelector('[data-batch]').hidden).toBe(true);
      const result = container.querySelector('[data-result]');
      expect(result.querySelector('[data-compare-panel]')).not.toBeNull();
      expect(result.textContent).toContain('1600 × 1200');
      expect(Array.from(result.querySelectorAll('button')).some((b) => b.textContent.includes('Full screen'))).toBe(true);
      await act(async () => { container.querySelector('[data-batch-back]').click(); });
      expect(container.querySelector('[data-result]')).toBeNull();
      expect(rows()).toHaveLength(2);
    });

    it("Escape in a photo's preview goes back to the set and lands on that photo; not while Full screen is open", async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      await act(async () => { container.querySelectorAll('[data-batch-open]')[1].click(); });
      await settled();
      const escape = () => act(async () => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
      await act(async () => { Array.from(container.querySelectorAll('[data-result] button')).find((b) => b.textContent.includes('Full screen')).click(); });
      await settled();
      const dialog = document.querySelector('dialog[open]');
      expect(dialog).not.toBeNull();
      dialog.querySelector('button').focus();
      await escape();
      expect(container.querySelector('[data-batch-preview-bar]')).not.toBeNull();
      await act(async () => { Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Close').click(); });
      expect(document.querySelector('dialog[open]')).toBeNull();
      // A held key repeats: the repeat that follows Full screen's close must not leave the preview too.
      await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat: true, bubbles: true, cancelable: true })); });
      expect(container.querySelector('[data-batch-preview-bar]')).not.toBeNull();
      container.querySelector('[data-batch-next]')?.focus();
      await escape();
      expect(container.querySelector('[data-batch-preview-bar]')).toBeNull();
      expect(rows()).toHaveLength(2);
      expect(document.activeElement).toBe(rows()[1].querySelector('[data-batch-open]'));
    });

    it('back from a photo whose new run has not reached it yet still lands focus in the set', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      await act(async () => { container.querySelectorAll('[data-batch-open]')[1].click(); });
      await settled();
      // forced: the next photo is held open until the test lets it finish
      const held = hold(toTarget, actualPhoto.compressImageToTarget);
      await act(async () => { preset('200 KB').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await act(async () => { await held.started; });
      // b.jpg waits behind a.jpg, so its tile is not openable yet.
      await act(async () => { container.querySelector('[data-batch-back]').click(); });
      expect(document.activeElement).toBe(container.querySelector('[data-batch] ol'));
      await act(async () => { held.release(); });
      await settled();
    });

    it('the target field widens for a five-digit size', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      const field = container.querySelector('#image-target-size-input');
      expect(field.style.width).toBe('3.5ch');
      await act(async () => {
        field.value = '10240';
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(field.style.width).toBe('5.5ch');
    });

    it('Escape while typing a target stays in the preview', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      await act(async () => { container.querySelector('[data-batch-open]').click(); });
      await settled();
      const field = container.querySelector('#image-target-size-input');
      field.focus();
      await act(async () => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
      expect(container.querySelector('[data-batch-preview-bar]')).not.toBeNull();
    });

    it('the preview steps through the finished photos and saves the one on screen', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      await act(async () => { container.querySelector('[data-batch-open]').click(); });
      await settled();
      const bar = () => container.querySelector('[data-batch-preview-bar]');
      const prev = () => bar().querySelector('[data-batch-prev]');
      const next = () => bar().querySelector('[data-batch-next]');
      const save = () => bar().querySelector('a[data-batch-save]');
      expect(bar().querySelector('[data-batch-position]').textContent).toBe('1 of 2');
      expect(bar().textContent).toContain('a.jpg');
      // Disabled by aria-disabled, so a keyboard press on the last arrow keeps its focus.
      expect(prev().getAttribute('aria-disabled')).toBe('true');
      expect(save().getAttribute('aria-label')).toBe('Save a.jpg');
      expect(save().getAttribute('download')).toBe('a-compressed.jpg');
      await act(async () => { next().click(); });
      await settled();
      expect(bar().querySelector('[data-batch-position]').textContent).toBe('2 of 2');
      expect(bar().textContent).toContain('b.jpg');
      expect(next().getAttribute('aria-disabled')).toBe('true');
      expect(next().disabled).toBe(false);
      next().focus();
      await act(async () => { next().click(); });
      expect(bar().querySelector('[data-batch-position]').textContent).toBe('2 of 2');
      expect(document.activeElement).toBe(next());
      expect(save().getAttribute('aria-label')).toBe('Save b.jpg');
      await act(async () => { prev().click(); });
      expect(bar().querySelector('[data-batch-position]').textContent).toBe('1 of 2');
    });

    it('the open preview stays on its photo while a new target recompresses it', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      await act(async () => { container.querySelector('[data-batch-open]').click(); });
      await settled();
      // forced: the next photo is held open until the test lets it finish
      const held = hold(toTarget, actualPhoto.compressImageToTarget);
      await act(async () => {
        preset('200 KB').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      // While the photo recompresses the stage still shows it, as a single photo does mid-run.
      expect(container.querySelector('[data-result]')).not.toBeNull();
      await act(async () => { held.release(); });
      await finishedAt(200);
      expect(container.querySelector('[data-result] [data-compare-panel]')).not.toBeNull();
      await act(async () => { container.querySelector('[data-batch-back]').click(); });
      expect(container.querySelectorAll('[data-batch-open]')).toHaveLength(2);
    });

    it('a single photo after a batch goes back to the single-photo view', async () => {
      mount();
      await pickMany([makeImageFile('a.jpg'), makeImageFile('b.jpg', 'portrait')]);
      expect(container.querySelector('[data-compress-batch]')).not.toBeNull();
      await pickMany([makeImageFile('solo.jpg')]);
      expect(container.querySelector('[data-compress-batch]')).toBeNull();
      expect(container.querySelector('[data-result]')).not.toBeNull();
    });
  });
});
