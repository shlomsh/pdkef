// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PdfCompressTool, { formatShare } from './PdfCompressTool.tsx';
import { englishCompressMessages, hebrewCompressMessages } from './messages';
import * as compressLib from './lib/compress.js';
import * as compressImageLib from './lib/compressImage.js';
import * as imagesLib from './lib/compressImages.js';
import styles from './PdfCompressTool.module.css';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { recentActions } from '../../lib/actionTrail.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { ANALYSIS_SHAPES, buildAnalysisPdf } from '../../test/support/analysisPdfFixtures.ts';

// Tests that are not about timing build 5ms after the last change instead of 1.5s.
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };

// Real PDFs, so the real analysis runs: a shape is built once (analysisPdfFixtures.ts) and every File of it
// carries those bytes. `pictures` (the default) is three pages, 90% images, with text. The size a test
// passes is the File's reported size, which is what the run's savings are measured against.
const SHAPE_BYTES = {} as Record<string, Uint8Array>;
beforeAll(async () => {
  for (const [shape, spec] of Object.entries(ANALYSIS_SHAPES)) SHAPE_BYTES[shape] = await buildAnalysisPdf(spec);
});
const encryptedFixture = (name) => new Uint8Array(fs.readFileSync(path.resolve(__dirname, `../../lib/__fixtures__/encrypted/${name}.pdf`)));

function makePdfFile(name, size = 1000, shape = 'pictures') {
  const file = new File([typeof shape === 'string' ? SHAPE_BYTES[shape] : shape], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size, writable: true });
  return file;
}

function makeImageFile(name, size = 1000, type = 'image/jpeg') {
  const file = new File(['fake-image-bytes'], name, { type });
  Object.defineProperty(file, 'size', { value: size, writable: true });
  return file;
}

function makeImageResult(overrides = {}) {
  return {
    blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }),
    metTarget: true,
    width: 800,
    height: 600,
    originalWidth: 1600,
    originalHeight: 1200,
    ...overrides,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

// The edge is the harness's, not this file's: the encryption probe and the preview (harness.pdfjs, a PDF is
// probed for a password before its first run and none of these files has one), and the three compression
// engines, which need a canvas, createImageBitmap and image codecs jsdom lacks (setup/compressEngines.ts: the
// spies are imported below and each test builds the result shape it wants). The analysis of the picked PDF
// runs for real, on the real PDFs of `makePdfFile` (analysisPdfFixtures.ts).

function imagesResult(overrides = {}) {
  return {
    blob: new Blob(['%PDF-1.4-images'], { type: 'application/pdf' }),
    beforeBytes: 100000,
    afterBytes: 15,
    rewritten: 1,
    reason: 'smaller',
    ...overrides,
  };
}

describe('PdfCompressTool UI flow', () => {
  let container;
  let harness;

  beforeEach(() => {
    harness = installToolHarness();
    vi.clearAllMocks();
    compressImageLib.compressImageToTarget.mockImplementation(() => Promise.resolve(makeImageResult()));
    imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult()));
    imagesLib.compressPdfImagesToTarget.mockImplementation(() => Promise.resolve(imagesResult({ metTarget: true })));
    // Restored explicitly, not left to vi.restoreAllMocks(): a test further
    // down that overrides these with a deferred implementation (to hold a run
    // in flight) would otherwise leave every later test's compress/preview
    // calls returning undefined instead of a Blob/data URL.
    compressLib.compressPdf.mockImplementation(() => Promise.resolve({ blob: new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' }), rasterBytes: 500 }));
    compressLib.compressPdfToTarget.mockImplementation(() =>
      Promise.resolve({ blob: new Blob(['%PDF-1.4-target'], { type: 'application/pdf' }), metTarget: true, rasterBytes: 500 }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    harness.restore();
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

  const wait = (ms = 50) =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });

  // Polls until `cond` holds (jsdom reads a File's bytes on a later tick, so a fixed sleep is a guess).
  const waitFor = async (cond, timeout = 2000) => {
    const end = Date.now() + timeout;
    while (!cond() && Date.now() < end) await wait(10);
    expect(cond()).toBe(true);
  };
  const statusOf = () => container.querySelector('[data-compress-status]')?.getAttribute('data-compress-status');
  const settled = () => waitFor(() => ['done', 'error'].includes(statusOf()));
  const ran = (mock, n) => () => mock.mock.calls.length >= n;

  // A pick starts the run on its own: by default this waits for the result, or
  // for whatever `until` says (a run held open by a deferred).
  const pick = async (file, until) => {
    await act(async () => {
      setInputFiles(fileInput, [file]);
    });
    await (until ? waitFor(until) : settled());
    return file;
  };

  const loadPdf = async (name = 'doc.pdf', size = 100000, shape = 'pictures') => {
    mount();
    return pick(makePdfFile(name, size, shape));
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
  const flattenSwitch = () => container.querySelector(`.${styles['flatten-switch']} input[type="checkbox"]`);
  const result = () => container.querySelector(`.${styles.result}`);
  const stripName = () => container.querySelector('[data-tool-shell]').textContent;
  const stripNote = () => container.querySelector('[data-compress-note]').textContent;
  const status = () => container.querySelector('[data-compress-status]').getAttribute('data-compress-status');
  const downloadButton = () => container.querySelector(`.${pdfToolStyles['download-button']}`);
  const noCompressButton = () => {
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(labels.some((l) => l === 'Compress PDF' || l === 'Compress Image' || l === 'Compress')).toBe(false);
  };

  // The pages-to-pictures switch only appears once the image path fell short,
  // so a test that exercises the page-rendering engine gets there the way a
  // person does: a first run that could not shrink the images, then the tick.
  async function loadPdfAndFlatten(name = 'doc.pdf', size = 100000) {
    imagesLib.compressPdfImages.mockImplementationOnce((f) =>
      Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason: 'unsupported' })),
    );
    const file = await loadPdf(name, size);
    await act(async () => {
      flattenSwitch().click();
    });
    await settled();
    return file;
  }

  it('renders the initial file dropper zone', () => {
    mount();

    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop a PDF or image here');
  });

  it('shows no loaded layout until a file is loaded', () => {
    mount();
    expect(container.querySelector('[data-compress-status]')).toBeNull();
  });

  it('a pick runs once at Balanced, with no run button to press', async () => {
    mount();
    const deferredRun = deferred();
    imagesLib.compressPdfImages.mockImplementation(() => deferredRun.promise);
    expect(container.querySelector(`.${styles['result-sheet']}`)).toBeNull();

    const file = await pick(makePdfFile('test_doc.pdf', 100000), ran(imagesLib.compressPdfImages, 1));
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledWith(file, expect.objectContaining({ maxLongSidePx: 1600, quality: 0.6 }));
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(status()).toBe('processing');
    // The sheet already holds Download in its ready look, with the size it knows: the build is silent.
    const sheet = container.querySelector(`.${styles['result-sheet']}`);
    expect(sheet.contains(downloadButton())).toBe(true);
    expect(downloadButton().textContent).toContain('97.66 KB');
    expect(sheet.querySelector(`.${pdfToolStyles['is-processing']}`)).toBeNull();
    noCompressButton();

    await act(async () => {
      deferredRun.resolve(imagesResult());
    });
    await settled();
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(status()).toBe('done');
    expect(container.querySelector(`.${styles['result-sheet']}`).contains(downloadButton())).toBe(true);
    noCompressButton();
  });

  it('the loaded state is the shell strip, then the controls, the result and the sheet, in that order, with the run counter', async () => {
    await loadPdf('order.pdf');
    const layout = container.querySelector(`.${styles['loaded-layout']}`);
    const kids = Array.from(layout.children);
    expect(kids).toHaveLength(4);
    // The strip is the layout's first cell, so on a desktop it sits in the
    // 360px rail beside the result (UX guidelines §18 rule 3) instead of
    // across the top, where it pushed the preview below the first screen.
    expect(kids[0].className).toContain(styles.strip);
    expect(kids[0].querySelector('[data-tool-shell]')).not.toBeNull();
    expect(container.querySelectorAll('[data-tool-shell]')).toHaveLength(1);
    expect(kids[1].className).toContain(styles.controls);
    expect(kids[2].className).toContain(styles.result);
    expect(kids[3].className).toContain(styles['result-action']);
    expect(layout.getAttribute('data-compress-run')).toBe('1');
    expect(layout.getAttribute('data-compress-status')).toBe('done');
  });

  it('shows the file in the strip and changes the level with the radios, recompressing at once', async () => {
    await loadPdf('test_doc.pdf', 50000);
    expect(stripName()).toContain('test_doc.pdf');

    // Default level is Balanced (the recommended one).
    expect(radio('Balanced').getAttribute('aria-checked')).toBe('true');
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);

    await choose('Smallest');
    expect(radio('Smallest').getAttribute('aria-checked')).toBe('true');
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(imagesLib.compressPdfImages.mock.calls[1][1]).toEqual(expect.objectContaining({ maxLongSidePx: 1000, quality: 0.4 }));
  });

  it('a level change during a run drops that run\'s result, and only the latest level builds after it', async () => {
    const first = deferred();
    imagesLib.compressPdfImages.mockImplementationOnce(() => first.promise);
    mount();
    await pick(makePdfFile('busy.pdf', 100000), ran(imagesLib.compressPdfImages, 1));
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
      first.resolve(imagesResult({ blob: new Blob(['stale-first-run-bytes-bytes']) }));
    });
    await wait(60);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(downloadButton().textContent).toContain('15 Bytes');
  });

  it('a failed run shows the error and Try again, which runs once more', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    imagesLib.compressPdfImages.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    await loadPdf('flaky.pdf');
    expect(status()).toBe('error');
    expect(container.textContent).toContain('Compression failed.');
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);

    await act(async () => {
      findButton('Try again').click();
    });
    await settled();
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(status()).toBe('done');
    expect(findButton('Try again')).toBeUndefined();
  });

  it('a file replaced mid-run by a password-needing PDF never compresses, even after another level was clicked', async () => {
    const runA = deferred();
    imagesLib.compressPdfImages.mockImplementationOnce(() => runA.promise);
    mount();
    await pick(makePdfFile('run_a.pdf', 100000), ran(imagesLib.compressPdfImages, 1));
    await act(async () => {
      radio('Smallest').click();
    });
    harness.pdfjs.probeAs('needs-password');
    await pick(makePdfFile('locked.pdf', 40000), () => container.querySelector('[data-needs-unlock]') !== null);
    await act(async () => {
      runA.resolve(imagesResult());
    });
    await wait(80);

    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-needs-unlock]')).not.toBeNull();
    expect(container.querySelector('[data-compress-status]')).toBeNull();
    expect(container.querySelector('[role="status"].sr-only').textContent).toBe(englishCompressMessages.protectedNeedsPasswordTitle);
  });

  it('a level change during the encryption probe does not compress, and exactly one run happens when the probe answers', async () => {
    const probing = harness.pdfjs.holdNextProbe();
    mount();
    await pick(makePdfFile('probing.pdf', 100000), () => container.querySelector('[data-tool-shell]') !== null);
    await act(async () => {
      radio('Smallest').click();
    });
    await wait(60);
    expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
    expect(status()).not.toBe('processing');

    await act(async () => {
      probing.release('open');
    });
    await settled();
    await wait(60);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(imagesLib.compressPdfImages.mock.calls[0][1]).toEqual(expect.objectContaining({ maxLongSidePx: 1000, quality: 0.4 }));
  });

  it('a stale run reporting progress after a level change does not move the shown percentage', async () => {
    const first = deferred();
    let staleProgress;
    imagesLib.compressPdfImages.mockImplementationOnce((f, opts) => {
      staleProgress = opts.onProgress;
      return first.promise;
    });
    mount();
    await pick(makePdfFile('busy.pdf', 100000), ran(imagesLib.compressPdfImages, 1));
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
    const sheetText = () => container.querySelector(`.${styles['result-sheet']}`).textContent;
    expect(sheetText()).not.toContain('80%');
    expect(sheetText()).toContain('0%');
  });

  it('runs compression on pick and displays the result in the strip and on the sheet', async () => {
    const nativeShare = mockNativeFileShare();
    await loadPdf('test_doc.pdf', 100000);

    // The sizes ride on the strip; no stats card, no success title.
    expect(container.querySelector('[data-compress-sizes]').textContent).toContain('97.66 KB');
    expect(container.querySelector('[data-compress-sizes]').textContent).toContain('15 Bytes');
    expect(container.querySelector('[data-compress-sizes]').textContent).toContain('100% smaller');
    expect(result().querySelector(`.${styles['stats-title']}`)).toBeNull();
    expect(result().querySelector(`.${styles['stats-grid']}`)).toBeNull();

    const downloadBtn = downloadButton();
    expect(downloadBtn).not.toBeNull();
    // The link carries the compressed bytes the run produced.
    expect(harness.blobForUrl(downloadBtn.getAttribute('href'))?.size).toBe(15);
    // The result summary rides on the Download button as a second line.
    expect(downloadBtn.textContent).toContain('15 Bytes');
    expect(downloadBtn.textContent).not.toContain('smaller');

    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
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
    await loadPdf('test_doc.pdf', 100000);
    await act(async () => container.querySelector(`.${pdfToolStyles['pdf-share-button']}`).click());
    await waitUntil(() => expect(container.textContent).toContain(expected));
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(expected);
    expect(recentActions()).not.toContain('share');
    nativeShare.restore();
  });

  it('renders the comparison automatically, with a skeleton while the previews are pending that never blocks the download row, and no show or hide toggle', async () => {
    let resolveBefore;
    let resolveAfter;
    harness.pdfjs.thumbnails.renderComparePreview.mockImplementation(
      (fileOrBlob) =>
        new Promise((resolve) => {
          if (fileOrBlob instanceof File) resolveBefore = () => resolve('data:image/png;base64,before');
          else resolveAfter = () => resolve('data:image/png;base64,after');
        }),
    );

    await loadPdf('quality_check.pdf', 200000);

    // Open on its own as soon as the result lands; the skeleton is the visible
    // "still working" mark, and the download row already rendered.
    expect(harness.pdfjs.thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
    expect(container.querySelector(`.${styles['compare-panel']}`)).not.toBeNull();
    expect(container.querySelector(`.${styles['compare-panel']} .${styles['compare-skeleton']}`)).not.toBeNull();
    expect(container.querySelectorAll(`.${styles['compare-panel']} img`)).toHaveLength(0);
    expect(downloadButton()).not.toBeNull();

    await act(async () => {
      resolveBefore();
      resolveAfter();
    });
    await waitUntil(() => expect(container.querySelectorAll(`.${styles['compare-panel']} img`)).toHaveLength(2));

    expect(container.querySelector(`.${styles['compare-skeleton']}`)).toBeNull();
    expect(container.querySelectorAll(`.${styles['compare-panel']} img`)).toHaveLength(2);
    expect(harness.pdfjs.thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
    // Only the Full screen button is left; nothing hides or restores the slider.
    expect(findButton('Full screen')).toBeDefined();
  });

  // Run-token guard (a workspace drop or a Replace pick lands mid-compress
  // with no confirm, since BasePdfTool's costsSomething stays false until
  // status is 'done' - see the comment on runTokenRef in
  // PdfCompressTool.tsx).
  it('does not land a stale compress result when the file is replaced mid-run', async () => {
    const runA = deferred();
    imagesLib.compressPdfImages.mockImplementationOnce(() => runA.promise);
    mount();
    await pick(makePdfFile('run_a.pdf', 100000), ran(imagesLib.compressPdfImages, 1));
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);

    // While A is 'processing', B lands through the same no-confirm path a
    // workspace drop or Replace pick takes mid-compress.
    await pick(makePdfFile('run_b.pdf', 40000), () => stripName().includes('run_b.pdf'));
    await waitUntil(() => expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2));
    expect(stripName()).toContain('run_b.pdf');
    // B starts at once (A's compressor takes no abort signal, so A can only be dropped, not stopped).
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    await settled();

    await act(async () => {
      runA.resolve(imagesResult({ blob: new Blob(['a-stale-7']) }));
    });
    await wait(60);

    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(imagesLib.compressPdfImages.mock.calls[1][0].name).toBe('run_b.pdf');
    expect(stripName()).toContain('run_b.pdf');
    expect(status()).toBe('done');
    expect(downloadButton().textContent).toContain('15 Bytes');
    expect(downloadButton().textContent).not.toContain('9 Bytes');
  });

  it('does not land a stale PDF compare preview when the file is replaced while it is loading', async () => {
    // Two independent deferred pairs, each resolving to a value keyed by call
    // order, so file A's render (still pending when B lands) can be resolved
    // after B's own render already completed and landed.
    let callIndex = 0;
    const beforeResolvers = [];
    const afterResolvers = [];
    harness.pdfjs.thumbnails.renderComparePreview.mockImplementation((fileOrBlob) => {
      const isFile = fileOrBlob instanceof File;
      const index = callIndex++;
      return new Promise((resolve) => {
        const resolver = () => resolve(`data:image/png;base64,${isFile ? 'before' : 'after'}-${index}`);
        if (isFile) beforeResolvers.push(resolver);
        else afterResolvers.push(resolver);
      });
    });

    await loadPdf('preview_a.pdf', 200000);

    // A's compare preview opened automatically and is still loading.
    expect(container.querySelector(`.${styles['compare-skeleton']}`)).not.toBeNull();
    expect(beforeResolvers).toHaveLength(1);
    expect(afterResolvers).toHaveLength(1);

    // Replace with file B while A's preview is still loading; B compresses on its own.
    await pick(makePdfFile('preview_b.pdf', 90000));
    expect(stripName()).toContain('preview_b.pdf');

    // B's own preview render is now pending too (index 2 and 3).
    expect(beforeResolvers).toHaveLength(2);
    expect(afterResolvers).toHaveLength(2);

    await act(async () => {
      beforeResolvers[1]();
      afterResolvers[1]();
    });
    await waitUntil(() => expect(container.querySelector(`.${styles['compare-panel']}`)?.querySelectorAll('img')).toHaveLength(2));

    let panel = container.querySelector(`.${styles['compare-panel']}`);
    expect(panel).not.toBeNull();
    let images = panel.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('data:image/png;base64,before-2');

    // A's stale preview resolves last - it must not overwrite B's comparison.
    await act(async () => {
      beforeResolvers[0]();
      afterResolvers[0]();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    panel = container.querySelector(`.${styles['compare-panel']}`);
    images = panel.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('data:image/png;base64,before-2');
  });

  it('shows a compareBeforeLabel override from messages in the rendered slider', async () => {
    mount({ messages: { compareBeforeLabel: 'המקור' } });
    await pick(makePdfFile('labeled.pdf', 60000));

    const panel = container.querySelector(`.${styles['compare-panel']}`);
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('המקור');
  });

  describe('the original page and the label row above the preview', () => {
    const labels = () => container.querySelector(`.${styles['compare-labels']}`);

    it('the inline slider has no tags on the images, and a label row above it names both sides with their sizes', async () => {
      await loadPdf('labels.pdf', 100000);
      const panel = container.querySelector(`.${styles['compare-panel']}`);
      expect(panel.querySelector('[role="slider"]')).not.toBeNull();
      expect(panel.querySelector('[data-testid="compare-tag"]')).toBeNull();
      expect(labels().textContent).toContain('Compressed · 15 Bytes');
      expect(labels().textContent).toContain('Original · 97.66 KB');
    });

    it('the full screen dialog keeps the tags', async () => {
      HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; });
      HTMLDialogElement.prototype.close = vi.fn(function () { this.open = false; });
      await loadPdf('tags.pdf', 200000);
      await act(async () => {
        findButton('Full screen').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await waitUntil(() => expect(container.querySelector('dialog[aria-label]')?.querySelectorAll('[data-testid="compare-tag"]')).toHaveLength(2));
      const dialog = container.querySelector('dialog[aria-label]');
      expect(dialog.querySelectorAll('[data-testid="compare-tag"]')).toHaveLength(2);
    });

    it('while a run is in flight the original page shows with its label and size, and the compressed side says Compressing', async () => {
      const run = deferred();
      imagesLib.compressPdfImages.mockImplementation(() => run.promise);
      mount();
      await pick(makePdfFile('inflight.pdf', 100000), () => result().querySelector('img') !== null);
      expect(status()).toBe('processing');
      expect(result().querySelector('img').getAttribute('src')).toBe('data:image/png;base64,before');
      expect(result().querySelector(`.${styles['compare-skeleton']}`)).toBeNull();
      expect(labels().textContent).toContain('Original · 97.66 KB');
      expect(labels().textContent).toContain('Compressing');
      await act(async () => {
        run.resolve(imagesResult());
      });
      await settled();
    });

    it('keeps the skeleton until the original has rendered', async () => {
      const original = deferred();
      harness.pdfjs.thumbnails.renderComparePreview.mockImplementation((f) =>
        f instanceof File ? original.promise : Promise.resolve('data:image/png;base64,after'),
      );
      const run = deferred();
      imagesLib.compressPdfImages.mockImplementation(() => run.promise);
      mount();
      await pick(makePdfFile('wait.pdf', 100000), ran(harness.pdfjs.thumbnails.renderComparePreview, 1));
      expect(result().querySelector(`.${styles['compare-skeleton']}`)).not.toBeNull();
      expect(result().querySelector('img')).toBeNull();
      await act(async () => {
        original.resolve('data:image/png;base64,before');
        run.resolve(imagesResult());
      });
      await settled();
    });

    // DEBT-56: an <img> painted before its photo decodes has no height, so the centred panel is its
    // label row alone and jumps when the decode lands (CLS 0.0127 on CI's hand-off to Compress Image).
    it('keeps the skeleton until the original photo has decoded', async () => {
      const decode = deferred();
      HTMLImageElement.prototype.decode = vi.fn(() => decode.promise);
      try {
        const run = deferred();
        compressImageLib.compressImageToTarget.mockImplementation(() => run.promise);
        mount();
        const photo = await pick(makeImageFile('decode.jpg', 900_000), ran(compressImageLib.compressImageToTarget, 1));
        await waitUntil(() => expect(result().querySelector(`.${styles['compare-skeleton']}`)).not.toBeNull());
        expect(result().querySelector(`.${styles['compare-skeleton']}`)).not.toBeNull();
        expect(result().querySelector('img')).toBeNull();
        await act(async () => {
          decode.resolve();
        });
        await waitFor(() => result().querySelector('img') !== null);
        expect(harness.blobForUrl(result().querySelector('img').getAttribute('src'))).toBe(photo);
        expect(result().querySelector(`.${styles['compare-skeleton']}`)).toBeNull();
        await act(async () => {
          run.resolve(makeImageResult());
        });
        await settled();
      } finally {
        delete HTMLImageElement.prototype.decode;
      }
    });

    // DEBT-56: an already-small photo can finish before it decodes; the photo then arriving under the
    // centred stats moved them up 70px. The skeleton holds its place instead.
    it('a result that lands before the photo decodes holds the photo place with the skeleton', async () => {
      const decode = deferred();
      HTMLImageElement.prototype.decode = vi.fn(() => decode.promise);
      try {
        compressImageLib.compressImageToTarget.mockImplementation((passthroughFile) =>
          Promise.resolve(makeImageResult({ blob: passthroughFile })),
        );
        mount();
        await pick(makeImageFile('small.jpg', 5_000));
        expect(result().querySelector(`.${styles['stats-grid']}`)).not.toBeNull();
        expect(result().querySelector(`.${styles['compare-skeleton']}`)).not.toBeNull();
        expect(result().querySelector('img')).toBeNull();
        await act(async () => {
          decode.resolve();
        });
        await waitFor(() => result().querySelector('img') !== null);
        expect(result().querySelector(`.${styles['compare-skeleton']}`)).toBeNull();
      } finally {
        delete HTMLImageElement.prototype.decode;
      }
    });

    it('renders the original once per file: one render at pick, one for the compressed page after the run', async () => {
      const file = await loadPdf('once.pdf', 100000);
      await waitUntil(() => expect(harness.pdfjs.thumbnails.renderComparePreview.mock.calls.length).toBeGreaterThanOrEqual(2));
      // The count is exact: a short settle so a third render would show.
      await wait(20);
      const calls = harness.pdfjs.thumbnails.renderComparePreview.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls.filter(([f]) => f === file)).toHaveLength(1);
      expect(calls.filter(([f]) => f instanceof Blob && !(f instanceof File))).toHaveLength(1);
    });

    it('a file replaced mid-render does not land the old original', async () => {
      const resolvers = [];
      harness.pdfjs.thumbnails.renderComparePreview.mockImplementation((f) =>
        f instanceof File
          ? new Promise((resolve) => resolvers.push(() => resolve(`data:image/png;base64,orig-${f.name}`)))
          : Promise.resolve('data:image/png;base64,after'),
      );
      const run = deferred();
      imagesLib.compressPdfImages.mockImplementation(() => run.promise);
      mount();
      await pick(makePdfFile('a.pdf', 100000), ran(harness.pdfjs.thumbnails.renderComparePreview, 1));
      await pick(makePdfFile('b.pdf', 100000), () => resolvers.length === 2);
      await act(async () => {
        resolvers[1]();
      });
      await waitUntil(() => expect(result().querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,orig-b.pdf'));
      expect(result().querySelector('img').getAttribute('src')).toBe('data:image/png;base64,orig-b.pdf');
      await act(async () => {
        resolvers[0]();
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(result().querySelector('img').getAttribute('src')).toBe('data:image/png;base64,orig-b.pdf');
      await act(async () => {
        run.resolve(imagesResult());
      });
      await settled();
    });
  });

  it('Exact size runs at once with the 100 KB default, a preset runs at once again, and the page-rendering engine is never touched', async () => {
    const file = await loadPdf('big_scan.pdf', 5_000_000);
    expect(imagesLib.compressPdfImagesToTarget).not.toHaveBeenCalled();

    await choose('Exact size');
    expect(radio('Exact size').getAttribute('aria-checked')).toBe('true');
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenCalledTimes(1);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 100 }));

    await act(async () => {
      preset('500 KB').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settled();
    expect(preset('500 KB').className).toContain('is-selected');
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenCalledTimes(2);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 500 }));
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();
    expect(harness.blobForUrl(downloadButton().getAttribute('href'))?.size).toBe(15);
  });

  it('typing a KB value builds once after the pause, not per keystroke; a preset is a change like any other', async () => {
    await loadPdf('typed.pdf', 5_000_000);
    await choose('Exact size');
    const calls = () => imagesLib.compressPdfImagesToTarget.mock.calls.length;
    expect(calls()).toBe(1);

    const input = container.querySelector('#target-size-input');
    await act(async () => {
      input.value = '250';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.value = '2500';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(() => calls() >= 2);
    await wait(60);
    expect(calls()).toBe(2);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ targetKB: 2500 }));

    await act(async () => {
      preset('200 KB').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => calls() >= 3);
    expect(calls()).toBe(3);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ targetKB: 200 }));
  });

  it('a new file drops a pending KB change', async () => {
    await loadPdf('first.pdf', 5_000_000);
    await choose('Exact size');
    const calls = () => imagesLib.compressPdfImagesToTarget.mock.calls.length;
    const before = calls();
    const input = container.querySelector('#target-size-input');
    await act(async () => {
      input.value = '300';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // The new file waits on its password check, so only the old change could start a build.
    const probe = harness.pdfjs.holdNextProbe();
    await act(async () => {
      setInputFiles(fileInput, [makePdfFile('second.pdf', 5_000_000)]);
    });
    await wait(150);
    expect(calls()).toBe(before);
    await act(async () => {
      probe.release('open');
    });
    await settled();
    expect(calls()).toBe(before + 1);
  });

  // Board-epic-cleanup: the standalone Compress Image tool merged into this
  // one island (see PdfCompressTool.tsx's `deriveKind` dispatch). These
  // cover the image half; everything above is the PDF path.

  it('dropping an image runs at once with the 100 KB default, a preset runs it again, and the dimensions read before to after', async () => {
    mount();
    const file = await pick(makeImageFile('photo.jpg', 5_000_000));

    // The compression-level picker is PDF-only - an image never shows it.
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(stripName()).toContain('photo.jpg');
    expect(compressImageLib.compressImageToTarget).toHaveBeenCalledTimes(1);
    expect(compressImageLib.compressImageToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 100 }));

    // The tighter photo-cap shortcut only the image presets offer.
    await act(async () => {
      preset('20 KB').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settled();
    expect(preset('20 KB').className).toContain('is-selected');
    expect(compressImageLib.compressImageToTarget).toHaveBeenCalledTimes(2);
    expect(compressImageLib.compressImageToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 20 }));
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();

    expect(result().textContent).toContain('1600 × 1200');
    expect(result().textContent).toContain('800 × 600');

    const downloadBtn = downloadButton();
    expect(downloadBtn).not.toBeNull();
    const linked = harness.blobForUrl(downloadBtn.getAttribute('href'));
    expect(linked?.type).toBe('image/jpeg');
    expect(linked?.size).toBe(10);
    expect(downloadBtn.getAttribute('download')).toBe('photo-compressed.jpg');
  });

  it('names a passthrough PNG download by its own type', async () => {
    compressImageLib.compressImageToTarget.mockImplementation(() =>
      Promise.resolve(makeImageResult({ blob: new Blob(['png-bytes'], { type: 'image/png' }) })),
    );
    mount();
    await pick(makeImageFile('id-scan.png', 50_000, 'image/png'));

    const downloadBtn = downloadButton();
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('download')).toBe('id-scan-compressed.png');
  });

  it('renders the comparison automatically for an image result with no rasterization, then no slider at all for a passthrough result', async () => {
    mount();
    const portrait = await pick(makeImageFile('portrait.jpg', 900_000));

    // Opens on its own, same as the PDF case - and with no rasterization,
    // just two object URLs.
    expect(harness.pdfjs.thumbnails.renderComparePreview).not.toHaveBeenCalled();
    const panel = container.querySelector(`.${styles['compare-panel']}`);
    expect(panel).not.toBeNull();
    const images = panel.querySelectorAll('img');
    expect(images).toHaveLength(2);
    // The two sides are the original photo and the compressed JPEG, straight from their blobs.
    const sides = Array.from(images).map((img) => harness.blobForUrl(img.getAttribute('src')));
    expect(sides[0]).toBe(portrait);
    expect(sides[1]?.type).toBe('image/jpeg');
    expect(sides[1]?.size).toBe(10);

    // Non-passthrough result: the re-encode notice, not the passthrough one.
    expect(result().textContent).toContain('once compressed, the output is a JPEG');
    expect(result().textContent).not.toContain('so the file is untouched');

    // Passthrough: compressImageToTarget's early-return hands back the same
    // File as `blob`, so a second, already-under-target image gets no slider
    // - a slider comparing a file to itself is noise. The notice swaps too:
    // nothing was re-encoded, so the format-change warning would be false.
    compressImageLib.compressImageToTarget.mockImplementation((passthroughFile) =>
      Promise.resolve(makeImageResult({ blob: passthroughFile })),
    );
    await pick(makeImageFile('tiny.jpg', 5_000));

    expect(container.querySelector(`.${styles['compare-panel']}`)).toBeNull();
    expect(findButton('Full screen')).toBeUndefined();
    expect(result().textContent).toContain('so the file is untouched: same file, same format, nothing re-encoded');
    expect(result().textContent).not.toContain('once compressed, the output is a JPEG');
    expect(result().textContent).toContain('Already under your target');
    expect(result().textContent).toContain('1600 × 1200');
    expect(downloadButton()).toBeNull();
    expect(container.querySelector(`.${pdfToolStyles['pdf-share-button']}`)).toBeNull();
    expect(result().querySelector(`.${styles['honest-note']}`)).not.toBeNull();
  });

  it('opens the comparison full screen in a modal dialog, re-rendering at the viewport width once, and closes it again', async () => {
    const showModal = vi.fn(function () { this.open = true; });
    const close = vi.fn(function () { this.open = false; });
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = close;

    await loadPdf('fullscreen.pdf', 200000);
    expect(harness.pdfjs.thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
    expect(container.querySelector('dialog[aria-label]')).toBeNull();

    const fullScreen = findButton('Full screen');
    expect(fullScreen).toBeTruthy();

    await act(async () => {
      fullScreen.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitUntil(() => expect(container.querySelector('dialog [role="slider"]')).not.toBeNull());

    const dialog = container.querySelector('dialog[aria-label]');
    expect(dialog).not.toBeNull();
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog.querySelector('[role="slider"]')).not.toBeNull();
    // Two inline renders plus two at the full screen width.
    expect(harness.pdfjs.thumbnails.renderComparePreview).toHaveBeenCalledTimes(4);
    expect(harness.pdfjs.thumbnails.renderComparePreview.mock.calls[2][1]).toBeGreaterThanOrEqual(900);

    const closeButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Close');
    await act(async () => {
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(close).toHaveBeenCalled();
    expect(container.querySelector('dialog [role="slider"]')).toBeNull();

    // Re-opening reuses the cached full screen renders.
    await act(async () => {
      findButton('Full screen').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.pdfjs.thumbnails.renderComparePreview).toHaveBeenCalledTimes(4);
    expect(container.querySelector('dialog [role="slider"]')).not.toBeNull();
  });

  it('offers no Full screen button for a passthrough result', async () => {
    imagesLib.compressPdfImagesToTarget.mockImplementation((f) =>
      Promise.resolve(imagesResult({ blob: f, metTarget: true, rewritten: 0, reason: 'under-target' })),
    );
    await loadPdf('already_small.pdf', 20_000);
    await choose('Exact size');
    expect(result().querySelector(`.${styles['honest-note']}`)).not.toBeNull();
    expect(findButton('Full screen')).toBeUndefined();
  });

  it('renders passthroughNotice, not rasterizeNotice, and no slider for a PDF target-mode passthrough result on the pages-to-pictures path', async () => {
    // compressPdfToTarget's own passthrough rule (src/tools/compress/lib/compress.js,
    // "Already under target") returns the input File itself as `blob` when the
    // file is already under the target size - the PDF-side mirror of
    // compressImageToTarget's rule exercised above.
    compressLib.compressPdfToTarget.mockImplementation((passthroughFile) =>
      Promise.resolve({ blob: passthroughFile, metTarget: true, rasterBytes: null }),
    );
    mount();
    const file = makePdfFile('already_small.pdf', 20_000);
    imagesLib.compressPdfImages.mockImplementationOnce((f) =>
      Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason: 'unsupported' })),
    );
    await pick(file);
    imagesLib.compressPdfImagesToTarget.mockImplementationOnce((f) =>
      Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason: 'unsupported', metTarget: false })),
    );
    await choose('Exact size');
    await act(async () => {
      flattenSwitch().click();
    });
    await settled();

    expect(compressLib.compressPdfToTarget).toHaveBeenCalledWith(file, expect.objectContaining({ targetKB: 100 }));
    expect(result().textContent).toContain('so the file is untouched: same file, same format, nothing re-encoded');
    expect(result().textContent).not.toContain('Compression rasterizes PDF pages');
    expect(result().textContent).toContain('Already under your target');
    expect(result().querySelector(`.${styles['honest-note']}`)).not.toBeNull();
    expect(downloadButton()).toBeNull();
    expect(container.querySelector(`.${pdfToolStyles['pdf-share-button']}`)).toBeNull();
    expect(container.querySelector(`.${styles['compare-panel']}`)).toBeNull();
  });

  it('says a PDF is already as small as it gets, instead of a success, when a level hands the input back', async () => {
    // compressPdf returns the input File itself when a re-rendered copy would
    // be bigger (a small vector PDF) - the same reference check as passthrough.
    compressLib.compressPdf.mockImplementation((inputFile) => Promise.resolve({ blob: inputFile, rasterBytes: 30390 }));

    await loadPdfAndFlatten('small_form.pdf', 11_000);

    const text = result().textContent;
    expect(text).toContain('Already as small as it gets');
    expect(text).toContain('Turned into images, this PDF came to 29.68 KB, more than the 10.74 KB it is now');
    expect(text).toContain('As images');
    expect(text).toContain('None, original kept');
    expect(container.querySelector('[data-compress-status="done"]')).not.toBeNull();
    expect(text).not.toContain('Compression rasterizes PDF pages');
    expect(downloadButton()).toBeNull();
    expect(container.querySelector(`.${pdfToolStyles['pdf-share-button']}`)).toBeNull();
    expect(findButton('Full screen')).toBeUndefined();
  });

  it('says the target cannot be reached this way, with the real numbers, when Exact size hands the input back', async () => {
    compressLib.compressPdfToTarget.mockImplementation((inputFile) =>
      Promise.resolve({ blob: inputFile, metTarget: false, rasterBytes: 30390 }),
    );
    mount();
    imagesLib.compressPdfImages.mockImplementationOnce((f) =>
      Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason: 'unsupported' })),
    );
    await pick(makePdfFile('small_form.pdf', 11_000));
    imagesLib.compressPdfImagesToTarget.mockImplementationOnce((f) =>
      Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason: 'unsupported', metTarget: false })),
    );
    await choose('Exact size');
    await act(async () => {
      flattenSwitch().click();
    });
    await settled();

    const text = result().textContent;
    expect(text).toContain('29.68 KB');
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
      await loadPdf('pics.pdf', 5000);
      expect(stripNote()).toBe('Images are 90% of this PDF, the part that gets smaller.');
    });

    it('a pure scan names its share the same way, without talking about text', async () => {
      await loadPdf('scan.pdf', 5000, 'scan');
      expect(stripNote()).toContain('Images are 100% of this PDF');
      expect(stripNote()).not.toContain('text');
    });

    it('a mostly-text PDF gets the quiet note', async () => {
      await loadPdf('mixed.pdf', 5000, 'mixed');
      expect(stripNote()).toBe('Most of this PDF is text. Images are 12% of it.');
    });

    it('the pages-to-pictures switch hides the share note and unticking brings it back', async () => {
      await loadPdfAndFlatten('pics.pdf', 5000);
      expect(stripNote()).toBe('');
      await act(async () => {
        flattenSwitch().click();
      });
      await settled();
      expect(stripNote()).toContain('Images are 90% of this PDF');
    });

    it('a PDF with no images says only that there is nothing here to shrink', async () => {
      await loadPdf('text_only.pdf', 5000, 'textOnly');
      expect(stripNote()).toBe(NOTE);
    });

    it('shows no nothing-to-shrink note when the PDF has an image', async () => {
      await loadPdf('photo.pdf', 5000);
      expect(stripNote()).not.toContain(NOTE);
    });

    it('an image has no note', async () => {
      mount();
      await pick(makeImageFile('photo.jpg', 100000));
      expect(stripNote()).toBe('');
    });

    // The switch's own hint is the visible trace of what the analysis saw: it says "Text stops being selectable"
    // only for a PDF that has text. The images cannot be recompressed here, which is what brings the switch out.
    const unsupportedImages = () => imagesLib.compressPdfImages.mockImplementationOnce((f) =>
      Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason: 'unsupported' })));
    const flattenHint = () => flattenSwitch().closest('label').textContent;

    it('re-reads an encrypted PDF with an empty password so text detection sees plaintext', async () => {
      // owner-only.pdf: AES-256, an empty user password, the text "hi 0". Read as it is, its page streams are
      // ciphertext and show no text; only the empty-password re-read sees the text.
      unsupportedImages();
      await loadPdf('restricted.pdf', 11_000, encryptedFixture('owner-only'));
      expect(stripNote()).toBe('Nothing here to shrink.');
      expect(flattenHint()).toContain(englishCompressMessages.flattenHint);
    });

    it('keeps the first read when the empty-password re-read throws', async () => {
      // needs-password.pdf wants the real password "u", so the empty one throws and the encrypted first read is analysed.
      unsupportedImages();
      await loadPdf('locked.pdf', 11_000, encryptedFixture('needs-password'));
      expect(stripNote()).toBe('Nothing here to shrink.');
      expect(flattenHint()).toContain(englishCompressMessages.flattenHintNoText);
    });

    it('drops an analysis that lands after a newer file was added', async () => {
      // A (no images) is held in its analysis: the probe reads its bytes first, the analysis second.
      const a = makePdfFile('a.pdf', 5000, 'textOnly');
      const read = a.arrayBuffer.bind(a);
      let reads = 0;
      let releaseA;
      a.arrayBuffer = () => (++reads === 2 ? new Promise((resolve) => { releaseA = () => resolve(read()); }) : read());
      mount();
      await act(async () => { setInputFiles(fileInput, [a]); });
      await waitFor(() => releaseA !== undefined);
      // A's analysis is still pending; B arrives and is analysed (images present).
      await pick(makePdfFile('b.pdf', 5000));
      await act(async () => {
        releaseA();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

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
      expect(result().textContent).not.toContain('Only the images were made smaller');
      expect(result().querySelector(`.${styles['compress-warning']}`)).toBeNull();
    });

    it('the switch is absent on a fresh result with a good saving, and present after the images could not be recompressed', async () => {
      await loadPdf();
      expect(status()).toBe('done');
      expect(flattenSwitch()).toBeNull();
      container.remove();
      container = undefined;

      imagesLib.compressPdfImages.mockImplementationOnce((f) =>
        Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason: 'unsupported' })),
      );
      await loadPdf('odd.pdf', 11_000);
      expect(flattenSwitch()).not.toBeNull();
      expect(flattenSwitch().checked).toBe(false);
    });

    describe('result card honesty (COMP-02)', () => {
      const slightBlob = (bytes) => new Blob(['x'.repeat(bytes)], { type: 'application/pdf' });
      const stats = () => result();
      const title = () => stats().querySelector(`.${styles['stats-title']}`).textContent;

      it('a 1% result at Balanced says only a little smaller, already compact, and points at Extreme', async () => {
        imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult({ blob: slightBlob(99000), afterBytes: 99000, keptBytes: 0 })));
        await loadPdf();
        expect(title()).toBe('Only a little smaller');
        expect(stats().textContent).toContain('already compact, so making them smaller saved 1%');
        expect(stats().textContent).toContain('"Smallest" can go further');
        expect(downloadButton()).not.toBeNull();
        // The switch is offered here: the images could not carry the saving.
        expect(flattenSwitch()).not.toBeNull();
      });

      it('at the smallest level the same result has no Extreme hint', async () => {
        imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult({ blob: slightBlob(99000), afterBytes: 99000, keptBytes: 0 })));
        await loadPdf();
        await choose('Smallest');
        expect(title()).toBe('Only a little smaller');
        expect(stats().textContent).toContain('already compact, so making them smaller saved 1%');
        expect(stats().textContent).not.toContain('"Smallest" can go further');
      });

      it('when most image bytes were kept it says they could not be recompressed', async () => {
        imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult({ blob: slightBlob(99900), afterBytes: 99900, keptBytes: 80000, imageBytes: 90000 })));
        await loadPdf();
        expect(stats().textContent).toContain("stored in a way I can't recompress, so it stayed as it was and this saved less than 1%");
        expect(stats().textContent).not.toContain('already compact');
      });

      it('4% still gets the slight-gain title', async () => {
        imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult({ blob: slightBlob(96000), afterBytes: 96000 })));
        await loadPdf();
        expect(title()).toBe('Only a little smaller');
        expect(stats().textContent).toContain('saved 4%');
      });

      it('5% and over has no title and shows no notice', async () => {
        imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult({ blob: slightBlob(94000), afterBytes: 94000 })));
        await loadPdf();
        expect(stats().querySelector(`.${styles['stats-title']}`)).toBeNull();
        expect(stats().querySelector(`.${styles['compress-warning']}`)).toBeNull();
        expect(stats().querySelector(`.${styles['honest-note']}`)).toBeNull();
      });

      it('an image re-encoded but not smaller reads as compact, not kept', async () => {
        imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult({ blob: slightBlob(99000), afterBytes: 99000, keptBytes: 0, imageBytes: 90000 })));
        await loadPdf();
        expect(stats().textContent).toContain('already compact');
        expect(stats().textContent).not.toContain("can't recompress");
      });

      it('exactly 5% has no slight-gain title', async () => {
        imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult({ blob: slightBlob(95000), afterBytes: 95000 })));
        await loadPdf();
        expect(stats().querySelector(`.${styles['stats-title']}`)).toBeNull();
      });

      it('the flatten path under 5% gets the title and keeps its rasterize notice', async () => {
        compressLib.compressPdf.mockImplementation(() => Promise.resolve({ blob: slightBlob(99000), rasterBytes: 99000 }));
        await loadPdfAndFlatten();
        expect(title()).toBe('Only a little smaller');
        expect(stats().textContent).not.toContain('already compact');
        expect(stats().querySelector(`.${styles['compress-warning']}`).textContent).toBe(englishCompressMessages.rasterizeNotice);
      });

      it('Exact size met with a small gain has no title', async () => {
        imagesLib.compressPdfImagesToTarget.mockImplementation(() => Promise.resolve(imagesResult({ blob: slightBlob(99000), afterBytes: 99000, metTarget: true })));
        await loadPdf();
        await choose('Exact size');
        expect(stats().querySelector(`.${styles['stats-title']}`)).toBeNull();
        expect(stats().textContent).not.toContain('already compact');
      });

      it('no result card text mentions links or drawings', async () => {
        for (const bytes of [99000, 90000]) {
          // 99000 is a ~1% saving, so a notice is on the card.
          imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult({ blob: slightBlob(bytes), afterBytes: bytes })));
          await loadPdf();
          if (bytes === 99000) expect(stats().textContent).toContain('already compact');
          expect(stats().textContent).not.toMatch(/links|drawings/);
          container.remove();
          container = undefined;
        }
      });

      it('the compare caption names page 1 only for a multi-page PDF', async () => {
        await loadPdf('doc.pdf', 100000, 'single');
        expect(container.textContent).toContain('Drag to compare the original and the compressed page.');
        expect(container.textContent).not.toContain('rest of the document');
        container.remove();
        container = undefined;
        await loadPdf();
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
      ['no-images', 'There are no images in this PDF'],
      ['no-gain', 'already compact, so making them smaller saved nothing'],
      ['encrypted', "This PDF is locked, so its images can't be recompressed here"],
      ['unsupported', "stored in a way I can't recompress, so nothing was changed"],
    ])('reason %s shows its notice and says the PDF is unchanged', async (reason, text) => {
      imagesLib.compressPdfImages.mockImplementation((f) => Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason })));
      await loadPdf('same.pdf', 11_000);
      const stats = result();
      expect(stats.textContent).toContain(text);
      // A locked file was never tried, so it is not "as small as it gets".
      const title = reason === 'encrypted' ? 'This PDF is locked' : reason === 'unsupported' ? 'Left as it was' : 'Already as small as it gets';
      expect(stats.querySelector(`.${styles['stats-title']}`).textContent).toBe(title);
      expect(stats.textContent).toContain('None, original kept');
      expect(stats.textContent).not.toContain('As images');
      expect(stats.textContent).toContain('Original Size');
      expect(stats.querySelector(`.${styles['honest-note']}`)).not.toBeNull();
      expect(downloadButton()).toBeNull();
      expect(container.querySelector(`.${pdfToolStyles['pdf-share-button']}`)).toBeNull();
      expect(findButton('Full screen')).toBeUndefined();
      // The switch is the way forward after these two, and nothing the others can use.
      expect(flattenSwitch() !== null).toBe(reason === 'unsupported' || reason === 'no-gain');
      // The screen reader hears what the card title says.
      const live = container.querySelector('[role="status"].sr-only').textContent;
      if (reason === 'encrypted' || reason === 'unsupported') expect(live).toBe(title);
    });

    it('reason under-target shows the untouched notice and is not "already as small as it gets"', async () => {
      imagesLib.compressPdfImagesToTarget.mockImplementation((f) => Promise.resolve(imagesResult({ blob: f, metTarget: true, rewritten: 0, reason: 'under-target' })));
      await loadPdf('tiny.pdf', 20_000);
      await choose('Exact size');
      const stats = result();
      expect(stats.textContent).toContain('so the file is untouched');
      expect(stats.textContent).not.toContain('Already as small as it gets');
      expect(stats.textContent).toContain('Already under your target');
      expect(stats.querySelector(`.${styles['honest-note']}`)).not.toBeNull();
      expect(downloadButton()).toBeNull();
    });

    it('a smaller result still has Download and Share, and a big saving has no notice', async () => {
      const nativeShare = mockNativeFileShare();
      await loadPdf();
      expect(downloadButton()).not.toBeNull();
      expect(container.querySelector(`.${pdfToolStyles['pdf-share-button']}`)).not.toBeNull();
      expect(result().querySelector(`.${styles['honest-note']}`)).toBeNull();
      expect(result().querySelector(`.${styles['compress-warning']}`)).toBeNull();
      nativeShare.restore();
    });

    it('after a passthrough, picking another level runs again and the result comes back', async () => {
      imagesLib.compressPdfImages.mockImplementationOnce((f) => Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason: 'no-gain' })));
      await loadPdf('same.pdf', 11_000);
      expect(downloadButton()).toBeNull();
      await choose('Smallest');
      expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
      expect(downloadButton()).not.toBeNull();
      noCompressButton();
    });

    it('a target missed on the image path names both sizes, drops "Closest achievable", and offers the switch', async () => {
      imagesLib.compressPdfImagesToTarget.mockImplementation(() => Promise.resolve(imagesResult({ metTarget: false })));
      await loadPdf('big.pdf', 5_000_000);
      await choose('Exact size');
      const stats = result();
      expect(stats.textContent).not.toContain('Only the images were made smaller');
      expect(stats.textContent).toContain('Shrinking the images got this PDF to 15 Bytes, above your 100 KB target. Turning the pages into pictures, with the switch above, can go smaller.');
      expect(stats.textContent).not.toContain('Closest achievable');
      expect(flattenSwitch()).not.toBeNull();
    });

    it('has no switch for an image file', async () => {
      mount();
      await pick(makeImageFile('photo.jpg', 100000));
      expect(container.querySelector(`.${styles['flatten-switch']}`)).toBeNull();
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
      await wait(60);
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
      return container.querySelector(`.${pdfToolStyles['hint-message']}`).textContent;
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

    const hint = container.querySelector(`.${pdfToolStyles['hint-message']}`);
    expect(hint).not.toBeNull();
    expect(hint.textContent).toContain('notes.txt');
    expect(hint.textContent).toContain('not a PDF, JPG or PNG');

    // Rejecting doesn't load a file, so the dropzone is still showing.
    expect(container.querySelector(`.${dropzoneStyles.dropzone}`)).not.toBeNull();
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
      await loadPdf('test_doc.pdf', 50000);
      await choose('Smallest');
      await choose('Sharpest');
      expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(3);
      expect(status()).toBe('done');
      expect(await events('tool_operation_started')).toBe(0);
      expect(await events('tool_result_ready')).toBe(0);
    });

    it('counts one started and one ready for a Download tap, again after a change', async () => {
      await loadPdf('test_doc.pdf', 50000);
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
      await loadPdf('test_doc.pdf', 50000);
      const slow = deferred();
      imagesLib.compressPdfImages.mockImplementationOnce(() => slow.promise);
      await act(async () => { radio('Smallest').click(); });
      await act(async () => { downloadButton().click(); });
      expect(await events('tool_operation_started')).toBe(1);
      expect(await events('tool_result_ready')).toBe(0);
      await act(async () => { slow.resolve(imagesResult()); });
      await settled();
      expect(await events('tool_operation_started')).toBe(1);
      expect(await events('tool_result_ready')).toBe(1);
    });

    it('counts a failed build, then started and ready for the Try again tap', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      imagesLib.compressPdfImages.mockImplementationOnce(() => Promise.reject(new Error('boom')));
      await loadPdf('flaky.pdf');
      expect(await events('tool_operation_failed')).toBe(1);
      expect(await events('tool_operation_started')).toBe(0);
      await act(async () => { findButton('Try again').click(); });
      await settled();
      expect(await events('tool_operation_started')).toBe(1);
      expect(await events('tool_result_ready')).toBe(1);
    });

    it('reports an edit when the person changes an option, not on arrival', async () => {
      await loadPdf('test_doc.pdf', 50000);
      await harness.flush();
      expect(harness.usageEvents('tool_first_edit')).toHaveLength(0);
      await choose('Smallest');
      await harness.flush();
      expect(harness.usageEvents('tool_first_edit').map((e) => e.properties.tool)).toEqual(['compress']);
    });
  });

  it('records what the person did, by name only, in order', async () => {
    await loadPdf('secret_name.pdf', 100000);
    await choose('Smallest');
    expect(recentActions()).toEqual(['add_files', 'export', 'change_setting', 'export']);
  });

  // Guideline §2, "Quiet means quiet": an option change waits for the person to go quiet, builds
  // silently, and Download keeps showing the last result meanwhile.
  describe('quiet-time prepare', () => {
    const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    const runNo = () => container.querySelector('[data-compress-run]').getAttribute('data-compress-run');
    const busyButton = () => container.querySelector(`.${pdfToolStyles['is-processing']}`);
    const click = (name) => act(async () => { radio(name).click(); });
    const calls = () => imagesLib.compressPdfImages.mock.calls.length;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    const open = async (name = 'doc.pdf') => {
      mount({ quietPolicy: undefined });
      await act(async () => { setInputFiles(fileInput, [makePdfFile(name, 100000)]); });
      await advance(100);
    };

    it('starts the first run at once once the encryption probe lets the file run, not after the quiet wait', async () => {
      const probing = harness.pdfjs.holdNextProbe();
      await open();
      expect(calls()).toBe(0);
      await act(async () => { probing.release('open'); });
      await advance(50);
      expect(calls()).toBe(1);
      expect(status()).toBe('done');
    });

    it('shows the original size in a ready Download before the first result, with no compressing look', async () => {
      imagesLib.compressPdfImages.mockImplementationOnce(() => new Promise(() => {}));
      await open();
      expect(calls()).toBe(1);
      expect(downloadButton().textContent).toContain('97.66 KB');
      expect(busyButton()).toBeNull();
    });

    it('does not rebuild before 1500ms after a level change, and shows the last result meanwhile', async () => {
      await open();
      await advance(4000);
      expect(calls()).toBe(1);
      const before = downloadButton().textContent;
      await click('Smallest');
      await advance(1400);
      expect(calls()).toBe(1);
      expect(busyButton()).toBeNull();
      expect(downloadButton().textContent).toBe(before);
      expect(container.querySelector('[data-compress-sizes]').textContent).toContain('15 Bytes');
      await advance(200);
      expect(calls()).toBe(2);
      expect(imagesLib.compressPdfImages.mock.calls[1][1]).toEqual(expect.objectContaining({ maxLongSidePx: 1000 }));
    });

    it('is instant, with no build, when going back to a level already built', async () => {
      await open();
      await advance(4000);
      await click('Smallest');
      await advance(1700);
      expect(calls()).toBe(2);
      await click('Balanced');
      expect(status()).toBe('done');
      await advance(5000);
      expect(calls()).toBe(2);
    });

    it('raises data-compress-run exactly once per started build', async () => {
      await open();
      await advance(4000);
      expect(runNo()).toBe('1');
      await click('Smallest');
      await click('Sharpest');
      expect(runNo()).toBe('1');
      await advance(2500);
      expect(runNo()).toBe('2');
      await click('Balanced');
      await advance(5000);
      expect(runNo()).toBe('2');
      expect(calls()).toBe(2);
    });

    it('shows the compressing look only after a tap before the build is done, then delivers', async () => {
      await open();
      await advance(4000);
      const slow = deferred();
      imagesLib.compressPdfImages.mockImplementationOnce(() => slow.promise);
      await click('Smallest');
      await advance(100);
      const clicks = [];
      const record = (e) => { const a = e.target.closest('a[download]'); if (a) clicks.push(e.defaultPrevented); };
      document.addEventListener('click', record);
      try {
        await act(async () => { downloadButton().click(); });
        await advance(50);
        expect(calls()).toBe(2);
        expect(busyButton()).not.toBeNull();
        expect(clicks).toEqual([true]);
        await act(async () => { slow.resolve(imagesResult()); await vi.advanceTimersByTimeAsync(50); });
        expect(busyButton()).toBeNull();
        expect(clicks).toEqual([true, false]);
      } finally {
        document.removeEventListener('click', record);
      }
    });

    it('starts the build at once on pointerdown on Download', async () => {
      await open();
      await advance(4000);
      await click('Smallest');
      await advance(200);
      expect(calls()).toBe(1);
      await act(async () => { downloadButton().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
      await advance(50);
      expect(calls()).toBe(2);
    });
  });

  it('puts the before to after sizes and the percent-smaller tag in the shell strip, beside the file meta', async () => {
    await loadPdf('shell.pdf', 100000);
    const shell = container.querySelector('[data-tool-shell]');
    const sizes = shell.querySelector('[data-compress-sizes]');
    expect(sizes).not.toBeNull();
    expect(sizes.textContent).toContain('97.66 KB');
    expect(sizes.textContent).toContain('→');
    expect(sizes.textContent).toContain('15 Bytes');
    expect(sizes.textContent).toContain('100% smaller');
  });

  it('points the sizes arrow left in right-to-left text and shows only the original before a result', async () => {
    imagesLib.compressPdfImages.mockImplementationOnce(() => new Promise(() => {}));
    mount({ messages: hebrewCompressMessages });
    await pick(makePdfFile('rtl.pdf', 100000), ran(imagesLib.compressPdfImages, 1));
    expect(container.querySelector('[data-compress-sizes]').textContent).toBe('97.66 KB');
    act(() => render(null, container));
    container.remove();
    mount({ messages: hebrewCompressMessages });
    await pick(makePdfFile('rtl.pdf', 100000));
    const sizes = container.querySelector('[data-compress-sizes]').textContent;
    expect(sizes).toContain('←');
    expect(sizes).not.toContain('→');
  });

  // The size ("15 Bytes") inside the Hebrew detail line must be bidi-isolated
  // or it renders reversed; English stays untouched.
  describe('the download detail line size', () => {
    const compressAndReadDetail = async (props) => {
      mount(props);
      await pick(makePdfFile('test_doc.pdf', 100000));
      return downloadButton().textContent;
    };

    it('wraps the size in LRI/PDI in Hebrew', async () => {
      const detail = await compressAndReadDetail({ messages: hebrewCompressMessages });
      expect(detail).toMatch(/⁦[^⁦⁩]*\d[^⁦⁩]*⁩/);
    });

    it('adds no isolates in English', async () => {
      const detail = await compressAndReadDetail({});
      expect(detail).toMatch(/\d+ Bytes/);
      expect(detail).not.toContain('⁦');
      expect(detail).not.toContain('⁩');
    });
  });

  it('re-clicking the selected target preset while its build is in flight still lands the result', async () => {
    await loadPdf('big_scan.pdf', 5_000_000);
    await choose('Exact size');
    const held = deferred();
    imagesLib.compressPdfImagesToTarget.mockImplementationOnce(() => held.promise);
    await act(async () => { preset('200 KB').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await waitFor(ran(imagesLib.compressPdfImagesToTarget, 2));
    await act(async () => { preset('200 KB').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { held.resolve(imagesResult()); });
    await waitUntil(() => expect(statusOf()).toBe('done'));
  });
});
