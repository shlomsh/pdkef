// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfCompressTool from './PdfCompressTool.tsx';
import * as compressLib from './compress.js';
import * as analyzePdfLib from './analyzePdf.js';
import * as compressImageLib from './compressImage.js';
import * as imagesLib from './compressImages.js';
import * as thumbnailsLib from '../../lib/thumbnails.js';
import styles from './PdfCompressTool.module.css';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import toolShellStyles from '../../shell/ToolShell.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import { mockNativeFileShare } from '../../test/mockFileShare.js';
import { setInputFiles } from '../../test/setInputFiles.js';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';

function makePdfFile(name, size = 1000) {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
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

vi.mock('pdfjs-dist', () => {
  return {
    GlobalWorkerOptions: {
      workerSrc: ''
    },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn(() => Promise.resolve({
          getViewport: () => ({ width: 612, height: 792 }),
          render: () => ({ promise: Promise.resolve() })
        }))
      })
    }))
  };
});

vi.mock('./compressImages.js', () => ({
  IMAGE_LEVELS: {
    high: { maxLongSidePx: 1000, quality: 0.4 },
    medium: { maxLongSidePx: 1600, quality: 0.6 },
    low: { maxLongSidePx: 2400, quality: 0.8 },
  },
  compressPdfImages: vi.fn(),
  compressPdfImagesToTarget: vi.fn(),
}));

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

// The "Turn pages into pictures" switch: off by default, so every test that
// exercises the page-rendering engine ticks it first.
async function tickFlatten(root) {
  const box = root.querySelector(`.${styles['flatten-switch']} input[type="checkbox"]`);
  await act(async () => {
    box.click();
  });
}

vi.mock('./compress.js', () => {
  return {
    compressPdf: vi.fn(() => Promise.resolve({ blob: new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' }), rasterBytes: 500 })),
    compressPdfToTarget: vi.fn(() =>
      Promise.resolve({
        blob: new Blob(['%PDF-1.4-target'], { type: 'application/pdf' }),
        metTarget: true,
        rasterBytes: 500,
      }),
    ),
  };
});

// analyzePdf statically imports pdf-lib; the island loads it dynamically.
vi.mock('./analyzePdf.js', () => ({
  analyzePdf: vi.fn(() => ({ images: [{}], hasText: true })),
}));
vi.mock('../../lib/pdfLib.js', () => ({
  getPdfLib: vi.fn(() => Promise.resolve({ PDFDocument: { load: vi.fn(() => Promise.resolve({})) } })),
}));

// The interface this tool is built against (see compressImage.js's own
// tests): mocked here so this suite never depends on its implementation,
// only the shape it promises to return.
vi.mock('./compressImage.js', () => ({
  compressImageToTarget: vi.fn(() => Promise.resolve(makeImageResult())),
}));

vi.mock('../../lib/thumbnails.js', () => {
  return {
    renderComparePreview: vi.fn((fileOrBlob) =>
      Promise.resolve(`data:image/png;base64,${fileOrBlob instanceof File ? 'before' : 'after'}`),
    ),
  };
});

describe('PdfCompressTool UI flow', () => {
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
    compressImageLib.compressImageToTarget.mockImplementation(() => Promise.resolve(makeImageResult()));
    imagesLib.compressPdfImages.mockImplementation(() => Promise.resolve(imagesResult()));
    imagesLib.compressPdfImagesToTarget.mockImplementation(() => Promise.resolve(imagesResult({ metTarget: true })));
    // Restored explicitly, not left to vi.restoreAllMocks(): a test further
    // down that overrides these with a deferred implementation (to hold a run
    // in flight) would otherwise leave every later test's compress/preview
    // calls returning undefined instead of a Blob/data URL.
    compressLib.compressPdf.mockImplementation(() => Promise.resolve({ blob: new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' }), rasterBytes: 500 }));
    analyzePdfLib.analyzePdf.mockImplementation(() => ({ images: [{}], hasText: true }));
    thumbnailsLib.renderComparePreview.mockImplementation((fileOrBlob) =>
      Promise.resolve(`data:image/png;base64,${fileOrBlob instanceof File ? 'before' : 'after'}`),
    );
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  it('renders the initial file dropper zone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop a PDF or image here');
  });

  it('transitions to options and handles compression level change', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('test_doc.pdf', 50000);

    await act(async () => {
      setInputFiles(input, [file]);
    });

    // Wait for async file load to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Check the loaded-state file bar
    const fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar).not.toBeNull();
    expect(fileBar.textContent).toContain('test_doc.pdf');

    // Default level should be 'medium' (Recommended)
    const recommendedCard = container.querySelector(`.${styles['compress-card']}.${styles['is-selected']}`);
    expect(recommendedCard).not.toBeNull();
    expect(recommendedCard.textContent).toContain('Recommended');

    // Click 'Extreme Compression' card
    const cards = container.querySelectorAll(`.${styles['compress-card']}`);
    const extremeCard = Array.from(cards).find(c => c.textContent.includes('Extreme Compression'));
    expect(extremeCard).not.toBeNull();

    await act(async () => {
      extremeCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Extreme card should now be selected
    expect(extremeCard.className).toContain(styles['is-selected']);
  });

  it('runs compression and displays results', async () => {
    const nativeShare = mockNativeFileShare();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('test_doc.pdf', 100000); // 100 KB

    await act(async () => {
      setInputFiles(input, [file]);
    });

    // Wait for async file load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Mock global URL creator
    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');

    // Click compression button
    await tickFlatten(container);
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('Compress PDF');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Wait for mock compressPdf async call to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Verify completion states
    const stats = container.querySelector(`.${styles['compression-stats']}`);
    expect(stats).not.toBeNull();
    expect(stats.textContent).toContain('PDF Successfully Compressed!');

    const downloadBtn = container.querySelector(`.${pdfToolStyles['download-button']}`);
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('href')).toBe('blob:testurl');

    // SEO-25 "button anchor" (2026-09-12): the result summary now rides on
    // the Download button itself as a second line, computed from the same
    // sizes the stats card shows above - the mocked compressPdf blob
    // ('%PDF-1.4-compressed') is 19 bytes against a 100000-byte input, a
    // 100% reduction once rounded.
    expect(downloadBtn.textContent).toContain('19 Bytes, 100% smaller');

    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('test_doc-compressed.pdf');

    window.URL.createObjectURL = originalCreateObjectURL;
    nativeShare.restore();
  });

  it('renders the comparison automatically once compression completes, showing a skeleton while the previews are still pending and never blocking the download row, then can be hidden and restored without re-rendering', async () => {
    const thumbnails = await import('../../lib/thumbnails.js');

    // A controllable promise per side, so the 'loading' state (and its
    // skeleton) can be observed before it resolves, instead of the mock's
    // usual immediate resolution.
    let resolveBefore;
    let resolveAfter;
    thumbnails.renderComparePreview.mockImplementation(
      (fileOrBlob) =>
        new Promise((resolve) => {
          if (fileOrBlob instanceof File) resolveBefore = () => resolve('data:image/png;base64,before');
          else resolveAfter = () => resolve('data:image/png;base64,after');
        }),
    );

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('quality_check.pdf', 200000);

    await act(async () => {
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:comparetesturl');

    await tickFlatten(container);
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // Opens on its own as soon as the result lands (SEO-25, 2026-09-12) - no
    // tap needed - but the previews haven't resolved yet: the skeleton is
    // the visible "still working" notification, and it does not hold up the
    // download row, which already rendered because compression itself is
    // done.
    expect(thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
    expect(container.querySelector(`.${styles['compare-panel']}`)).not.toBeNull();
    expect(container.querySelector(`.${styles['compare-skeleton']}`)).not.toBeNull();
    expect(container.querySelectorAll(`.${styles['compare-panel']} img`)).toHaveLength(0);
    expect(container.querySelector(`.${pdfToolStyles['download-button']}`)).not.toBeNull();

    // Resolving both sides clears the skeleton and renders the slider.
    await act(async () => {
      resolveBefore();
      resolveAfter();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(container.querySelector(`.${styles['compare-skeleton']}`)).toBeNull();
    let panel = container.querySelector(`.${styles['compare-panel']}`);
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('img')).toHaveLength(2);

    const toggle = container.querySelector(`.${styles['compare-toggle-button']}`);
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('Hide comparison');

    // Hiding removes the panel without discarding the rendered previews.
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector(`.${styles['compare-panel']}`)).toBeNull();
    expect(toggle.textContent).toContain('Compare with original');

    // Restoring it reuses the cached previews rather than re-rendering (no
    // skeleton either, since comparePreviews is already populated).
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
    panel = container.querySelector(`.${styles['compare-panel']}`);
    expect(panel).not.toBeNull();
    expect(panel.querySelector(`.${styles['compare-skeleton']}`)).toBeNull();
    expect(toggle.textContent).toContain('Hide comparison');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  // Run-token guard (a workspace drop or a Replace pick lands mid-compress
  // with no confirm, since BasePdfTool's costsSomething stays false until
  // status is 'done' - see the comment on runTokenRef in
  // PdfCompressTool.tsx).
  it('does not land a stale compress result when the file is replaced mid-run', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const fileA = makePdfFile('run_a.pdf', 100000);
    const fileB = makePdfFile('run_b.pdf', 40000);

    await act(async () => {
      setInputFiles(input, [fileA]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // A deferred compressPdf so A's run is still in flight when B lands.
    let resolveA;
    compressLib.compressPdf.mockImplementation(
      () => new Promise((resolve) => { resolveA = resolve; }),
    );

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:stale-run');

    await tickFlatten(container);
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // While A is 'processing', hasWork (status === 'done') is false, so
    // costsSomething is false and B lands through the same no-confirm path a
    // workspace drop or Replace pick takes mid-compress.
    await act(async () => {
      setInputFiles(input, [fileB]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    let fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar.textContent).toContain('run_b.pdf');

    // A's compress now resolves - it must not land on B.
    await act(async () => {
      resolveA({ blob: new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' }), rasterBytes: 500 });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.querySelector(`.${styles['compression-stats']}`)).toBeNull();
    expect(container.querySelector(`.${pdfToolStyles['download-button']}`)).toBeNull();
    fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar.textContent).toContain('run_b.pdf');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('does not land a stale PDF compare preview when the file is replaced while it is loading', async () => {
    // Two independent deferred pairs, each resolving to a value keyed by call
    // order, so file A's render (still pending when B lands) can be resolved
    // after B's own render already completed and landed.
    let callIndex = 0;
    const beforeResolvers = [];
    const afterResolvers = [];
    thumbnailsLib.renderComparePreview.mockImplementation((fileOrBlob) => {
      const isFile = fileOrBlob instanceof File;
      const index = callIndex++;
      return new Promise((resolve) => {
        const resolver = () => resolve(`data:image/png;base64,${isFile ? 'before' : 'after'}-${index}`);
        if (isFile) beforeResolvers.push(resolver);
        else afterResolvers.push(resolver);
      });
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const fileA = makePdfFile('preview_a.pdf', 200000);

    await act(async () => {
      setInputFiles(input, [fileA]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:preview-test');

    await tickFlatten(container);
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // A's compare preview opened automatically (SEO-25) and is still loading -
    // both of its renderComparePreview calls (index 0 and 1) are pending.
    expect(container.querySelector(`.${styles['compare-skeleton']}`)).not.toBeNull();
    expect(beforeResolvers).toHaveLength(1);
    expect(afterResolvers).toHaveLength(1);

    // Replace with file B while A's preview is still loading, the same input
    // path the other tests in this file use to swap a loaded file.
    const fileB = makePdfFile('preview_b.pdf', 90000);
    await act(async () => {
      setInputFiles(input, [fileB]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    const fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar.textContent).toContain('preview_b.pdf');

    // Compress file B (compressPdf's default mock resolves immediately).
    const buttonForB = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      buttonForB.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // B's own preview render is now pending too (index 2 and 3).
    expect(beforeResolvers).toHaveLength(2);
    expect(afterResolvers).toHaveLength(2);

    await act(async () => {
      beforeResolvers[1]();
      afterResolvers[1]();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    let panel = container.querySelector(`.${styles['compare-panel']}`);
    expect(panel).not.toBeNull();
    let images = panel.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('data:image/png;base64,before-2');

    // A's stale preview resolves last - it must not overwrite B's already
    // rendered comparison, and must not render a slider for a passthrough
    // combination of the two.
    await act(async () => {
      beforeResolvers[0]();
      afterResolvers[0]();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    panel = container.querySelector(`.${styles['compare-panel']}`);
    images = panel.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('data:image/png;base64,before-2');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('shows a compareBeforeLabel override from messages in the rendered slider', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool messages={{ compareBeforeLabel: 'המקור' }} />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('labeled.pdf', 60000);

    await act(async () => {
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:label-test');

    await tickFlatten(container);
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const panel = container.querySelector(`.${styles['compare-panel']}`);
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('המקור');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('switches to Target Size mode, edits the KB value, and compresses to target', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('big_scan.pdf', 5_000_000);

    await act(async () => {
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const cards = container.querySelectorAll(`.${styles['compress-card']}`);
    const targetCard = Array.from(cards).find((c) => c.textContent.includes('Target Size'));
    expect(targetCard).not.toBeNull();

    await act(async () => {
      targetCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(targetCard.className).toContain(styles['is-selected']);

    // Default target is 100 KB; pick the 500 KB preset chip instead.
    const presets = container.querySelectorAll(`.${styles['target-size-preset']}`);
    const preset500 = Array.from(presets).find((b) => b.textContent.includes('500 KB'));
    expect(preset500).not.toBeNull();
    await act(async () => {
      preset500.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(preset500.className).toContain(styles['is-selected']);

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:targeturl');

    await tickFlatten(container);
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(compressLib.compressPdfToTarget).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ targetKB: 500 }),
    );
    expect(compressLib.compressPdf).not.toHaveBeenCalled();

    const downloadBtn = container.querySelector(`.${pdfToolStyles['download-button']}`);
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('href')).toBe('blob:targeturl');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  // Board-epic-cleanup: the standalone Compress Image tool merged into this
  // one island (see PdfCompressTool.tsx's `deriveKind` dispatch). These three
  // cover the image half; everything above this line is the PDF path,
  // unchanged by the merge.

  it('dropping an image switches to the image panel and dispatches to compressImageToTarget with the chosen target, rendering dimensions', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makeImageFile('photo.jpg', 5_000_000);

    await act(async () => {
      setInputFiles(input, [file]);
    });

    const fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar).not.toBeNull();
    expect(fileBar.textContent).toContain('photo.jpg');

    // The compression-level grid is PDF-only - an image never shows it.
    expect(container.querySelector(`.${styles['compress-options']}`)).toBeNull();

    // Default target is 100 KB; pick the 20 KB preset chip instead, the
    // tighter photo-cap shortcut only the image presets offer.
    const presets = container.querySelectorAll(`.${styles['target-size-preset']}`);
    const preset20 = Array.from(presets).find((b) => b.textContent.includes('20 KB'));
    expect(preset20).not.toBeNull();
    await act(async () => {
      preset20.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(preset20.className).toContain(styles['is-selected']);

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:imagetargeturl');

    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    expect(button.textContent).toContain('Compress Image');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(compressImageLib.compressImageToTarget).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ targetKB: 20 }),
    );
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();

    const stats = container.querySelector(`.${styles['compression-stats']}`);
    expect(stats).not.toBeNull();
    expect(stats.textContent).toContain('Image Successfully Compressed!');
    expect(stats.textContent).toContain('1600 × 1200');
    expect(stats.textContent).toContain('800 × 600');

    const downloadBtn = container.querySelector(`.${pdfToolStyles['download-button']}`);
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('href')).toBe('blob:imagetargeturl');
    expect(downloadBtn.getAttribute('download')).toBe('photo-compressed.jpg');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('names a passthrough PNG download by its own type', async () => {
    compressImageLib.compressImageToTarget.mockImplementation(() =>
      Promise.resolve(makeImageResult({ blob: new Blob(['png-bytes'], { type: 'image/png' }) })),
    );

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makeImageFile('id-scan.png', 50_000, 'image/png');

    await act(async () => {
      setInputFiles(input, [file]);
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:pngpassthrough');

    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const downloadBtn = container.querySelector(`.${pdfToolStyles['download-button']}`);
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('download')).toBe('id-scan-compressed.png');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('renders the comparison automatically for an image result with no rasterization, then hides the toggle entirely for a passthrough result', async () => {
    const thumbnails = await import('../../lib/thumbnails.js');
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makeImageFile('portrait.jpg', 900_000);

    await act(async () => {
      setInputFiles(input, [file]);
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    let nextBlobUrl = 0;
    window.URL.createObjectURL = vi.fn(() => `blob:image-compare-${nextBlobUrl++}`);

    let button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // Opens on its own, same as the PDF case - and with no rasterization,
    // just two object URLs.
    expect(thumbnails.renderComparePreview).not.toHaveBeenCalled();
    const panel = container.querySelector(`.${styles['compare-panel']}`);
    expect(panel).not.toBeNull();
    const images = panel.querySelectorAll('img');
    expect(images).toHaveLength(2);
    images.forEach((img) => expect(img.getAttribute('src')).toMatch(/^blob:image-compare-/));

    const toggle = container.querySelector(`.${styles['compare-toggle-button']}`);
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('Hide comparison');

    // Non-passthrough result: the re-encode notice, not the passthrough one.
    const stats = container.querySelector(`.${styles['compression-stats']}`);
    expect(stats.textContent).toContain('once compressed, the output is a JPEG');
    expect(stats.textContent).not.toContain('so the file is untouched');

    // Passthrough: compressImageToTarget's early-return hands back the same
    // File as `blob`, so a second, already-under-target image gets no
    // toggle (and no auto-open) at all - a slider comparing a file to
    // itself is noise. It also swaps the notice: nothing was re-encoded, so
    // the format-change warning would be false.
    compressImageLib.compressImageToTarget.mockImplementation((passthroughFile) =>
      Promise.resolve(makeImageResult({ blob: passthroughFile })),
    );
    const tinyFile = makeImageFile('tiny.jpg', 5_000);
    await act(async () => {
      setInputFiles(input, [tinyFile]);
    });
    button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(container.querySelector(`.${styles['compare-toggle-button']}`)).toBeNull();
    expect(container.querySelector(`.${styles['compare-panel']}`)).toBeNull();

    const passthroughStats = container.querySelector(`.${styles['compression-stats']}`);
    expect(passthroughStats.textContent).toContain('so the file is untouched: same file, same format, nothing re-encoded');
    expect(passthroughStats.textContent).not.toContain('once compressed, the output is a JPEG');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('renders passthroughNotice, not rasterizeNotice, and no compare toggle for a PDF target-mode passthrough result', async () => {
    // compressPdfToTarget's own passthrough rule (src/tools/compress/compress.js,
    // "Already under target" near line 146) returns the input File itself as
    // `blob` when the file is already under the target size - the PDF-side
    // mirror of compressImageToTarget's rule exercised above.
    compressLib.compressPdfToTarget.mockImplementation((passthroughFile) =>
      Promise.resolve({ blob: passthroughFile, metTarget: true, rasterBytes: null }),
    );

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('already_small.pdf', 20_000);

    await act(async () => {
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const cards = container.querySelectorAll(`.${styles['compress-card']}`);
    const targetCard = Array.from(cards).find((c) => c.textContent.includes('Target Size'));
    await act(async () => {
      targetCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:pdfpassthrough');

    await tickFlatten(container);
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(compressLib.compressPdfToTarget).toHaveBeenCalledWith(file, expect.objectContaining({ targetKB: 100 }));

    const stats = container.querySelector(`.${styles['compression-stats']}`);
    expect(stats).not.toBeNull();
    expect(stats.textContent).toContain('so the file is untouched: same file, same format, nothing re-encoded');
    expect(stats.textContent).not.toContain('Compression rasterizes PDF pages');

    expect(container.querySelector(`.${styles['compare-toggle-button']}`)).toBeNull();
    expect(container.querySelector(`.${styles['compare-panel']}`)).toBeNull();

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('says a PDF is already as small as it gets, instead of "Successfully Compressed", when a level hands the input back', async () => {
    // compressPdf returns the input File itself when a re-rendered copy would
    // be bigger (a small vector PDF) - the same reference check as passthrough.
    compressLib.compressPdf.mockImplementation((inputFile) => Promise.resolve({ blob: inputFile, rasterBytes: 30390 }));

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('small_form.pdf', 11_000);
    await act(async () => {
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:alreadysmall');

    await tickFlatten(container);
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const stats = container.querySelector(`.${styles['compression-stats']}`);
    expect(stats.textContent).toContain('Already as small as it gets');
    expect(stats.textContent).toContain('Turned into images, this PDF came to 29.68 KB, more than the 10.74 KB it is now');
    expect(stats.textContent).toContain('As images');
    expect(stats.textContent).toContain('None, original kept');
    expect(stats.textContent).not.toContain('No size reduction');
    expect(stats.textContent).not.toContain('Successfully Compressed');
    expect(stats.textContent).not.toContain('Compression rasterizes PDF pages');

    const downloadBtn = container.querySelector(`.${pdfToolStyles['download-button']}`);
    expect(downloadBtn.textContent).toContain('Download PDF');
    expect(downloadBtn.textContent).not.toContain('Compressed');
    expect(downloadBtn.getAttribute('download')).toBe('small_form.pdf');
    expect(container.querySelector(`.${styles['compare-toggle-button']}`)).toBeNull();

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('says the target cannot be reached this way, with the real numbers, when Target Size hands the input back', async () => {
    compressLib.compressPdfToTarget.mockImplementation((inputFile) =>
      Promise.resolve({ blob: inputFile, metTarget: false, rasterBytes: 30390 }),
    );

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('small_form.pdf', 11_000);
    await act(async () => {
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const cards = container.querySelectorAll(`.${styles['compress-card']}`);
    const targetCard = Array.from(cards).find((c) => c.textContent.includes('Target Size'));
    await act(async () => {
      targetCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:alreadysmalltarget');

    await tickFlatten(container);
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const stats = container.querySelector(`.${styles['compression-stats']}`);
    expect(stats.textContent).toContain('29.68 KB');
    expect(stats.textContent).toContain('100 KB can');
    expect(stats.textContent).toContain("can't be reached this way");
    expect(stats.textContent).toContain('As images');
    expect(stats.textContent).not.toContain('Closest achievable');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  describe('the nothing-to-shrink note', () => {
    const NOTE = 'Nothing here to shrink.';

    async function addPdf(name) {
      container = container || document.createElement('div');
      if (!container.isConnected) document.body.appendChild(container);
      const file = makePdfFile(name, 5000);
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [file]);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      return file;
    }

    function mountTool() {
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(<PdfCompressTool />, container);
      });
    }

    it('says so before any click for a PDF with text and no images, and keeps the cards and button', async () => {
      analyzePdfLib.analyzePdf.mockImplementation(() => ({ images: [], hasText: true }));
      mountTool();
      await addPdf('text_only.pdf');

      expect(container.textContent).toContain(NOTE);
      expect(container.textContent).toContain('This PDF is text and drawings, with no images in it');
      expect(container.querySelector('[role="note"]')).not.toBeNull();
      expect(container.querySelectorAll(`.${styles['compress-card']}`).length).toBeGreaterThan(0);
      expect(container.querySelector(`.${pdfToolStyles['tool-primary-action']}`)).not.toBeNull();
    });

    it('uses the drawing wording when the PDF has no text either', async () => {
      analyzePdfLib.analyzePdf.mockImplementation(() => ({ images: [], hasText: false }));
      mountTool();
      await addPdf('drawing.pdf');

      expect(container.textContent).toContain(NOTE);
      expect(container.textContent).toContain('This PDF is drawings, with no images in it');
      expect(container.textContent).not.toContain('text and drawings');
    });

    it('shows no note when the PDF has an image', async () => {
      analyzePdfLib.analyzePdf.mockImplementation(() => ({ images: [{}], hasText: true }));
      mountTool();
      await addPdf('photo.pdf');

      expect(container.textContent).not.toContain(NOTE);
    });

    it('drops an analysis that lands after a newer file was added', async () => {
      let resolveA;
      // B's analysis runs first (A's is held), so B takes the one-shot answer.
      analyzePdfLib.analyzePdf.mockImplementation(() => ({ images: [], hasText: true }));
      const pdfLib = await import('../../lib/pdfLib.js');
      pdfLib.getPdfLib.mockImplementationOnce(
        () => new Promise((resolve) => { resolveA = resolve; }),
      );
      mountTool();
      await addPdf('a.pdf');
      // A's analysis is still pending; B arrives and is analysed (images present).
      analyzePdfLib.analyzePdf.mockImplementationOnce(() => ({ images: [{}], hasText: true }));
      await addPdf('b.pdf');
      await act(async () => {
        resolveA({ PDFDocument: { load: () => Promise.resolve({}) } });
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // B has an image, A's (image-free) result must not leak onto it.
      expect(container.textContent).not.toContain(NOTE);
    });
  });

  describe('images only by default, pages into pictures by switch', () => {
    async function loadPdf(name = 'doc.pdf', size = 100000) {
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(<PdfCompressTool />, container);
      });
      const file = makePdfFile(name, size);
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [file]);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      window.URL.createObjectURL = vi.fn(() => 'blob:images');
      return file;
    }

    async function clickCompress() {
      await act(async () => {
        container.querySelector(`.${pdfToolStyles['tool-primary-action']}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }

    async function pickTarget() {
      const card = Array.from(container.querySelectorAll(`.${styles['compress-card']}`)).find((c) => c.textContent.includes('Target Size'));
      await act(async () => {
        card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    it('Recommended calls compressPdfImages with the medium level and never compressPdf', async () => {
      const file = await loadPdf();
      await clickCompress();
      expect(imagesLib.compressPdfImages).toHaveBeenCalledWith(file, expect.objectContaining({ maxLongSidePx: 1600, quality: 0.6 }));
      expect(compressLib.compressPdf).not.toHaveBeenCalled();
      expect(container.querySelector(`.${styles['compression-stats']}`).textContent).toContain('Only the images were made smaller');
    });

    it('ticking the switch calls compressPdf and not compressPdfImages', async () => {
      await loadPdf();
      await tickFlatten(container);
      await clickCompress();
      expect(compressLib.compressPdf).toHaveBeenCalled();
      expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
    });

    it('Target Size without the switch calls compressPdfImagesToTarget with targetKB', async () => {
      const file = await loadPdf();
      await pickTarget();
      await clickCompress();
      expect(imagesLib.compressPdfImagesToTarget).toHaveBeenCalledWith(file, expect.objectContaining({ targetKB: 100 }));
      expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();
    });

    it.each([
      ['no-images', 'There are no images in this PDF'],
      ['no-gain', 'already compact, so making them smaller saved nothing'],
      ['encrypted', "protected against changes, so its images can't be recompressed"],
    ])('reason %s shows its notice and says the PDF is unchanged', async (reason, text) => {
      imagesLib.compressPdfImages.mockImplementation((f) => Promise.resolve(imagesResult({ blob: f, afterBytes: f.size, rewritten: 0, reason })));
      await loadPdf('same.pdf', 11_000);
      await clickCompress();
      const stats = container.querySelector(`.${styles['compression-stats']}`);
      expect(stats.textContent).toContain(text);
      expect(stats.textContent).toContain('Already as small as it gets');
      expect(stats.textContent).toContain('None, original kept');
      expect(stats.textContent).not.toContain('As images');
      const downloadBtn = container.querySelector(`.${pdfToolStyles['download-button']}`);
      expect(downloadBtn.textContent).toContain('Download PDF');
      expect(downloadBtn.getAttribute('download')).toBe('same.pdf');
      expect(container.querySelector(`.${styles['compare-toggle-button']}`)).toBeNull();
    });

    it('reason under-target shows the untouched notice and is not "already as small as it gets"', async () => {
      imagesLib.compressPdfImagesToTarget.mockImplementation((f) => Promise.resolve(imagesResult({ blob: f, metTarget: true, rewritten: 0, reason: 'under-target' })));
      await loadPdf('tiny.pdf', 20_000);
      await pickTarget();
      await clickCompress();
      const stats = container.querySelector(`.${styles['compression-stats']}`);
      expect(stats.textContent).toContain('so the file is untouched');
      expect(stats.textContent).not.toContain('Already as small as it gets');
    });

    it('a target missed on the image path names both sizes and drops "Closest achievable"', async () => {
      imagesLib.compressPdfImagesToTarget.mockImplementation(() => Promise.resolve(imagesResult({ metTarget: false })));
      await loadPdf('big.pdf', 5_000_000);
      await pickTarget();
      await clickCompress();
      const stats = container.querySelector(`.${styles['compression-stats']}`);
      expect(stats.textContent).toContain('Only the images were made smaller');
      expect(stats.textContent).toContain('Shrinking the images got this PDF to 15 Bytes. Reaching 100 KB would mean turning the pages into pictures');
      expect(stats.textContent).not.toContain('Closest achievable');
    });

    it('has no switch for an image file', async () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(<PdfCompressTool />, container);
      });
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [makeImageFile('photo.jpg', 100000)]);
      });
      expect(container.querySelector(`.${styles['flatten-switch']}`)).toBeNull();
    });

    it('toggling the switch after a result clears it, back to the Compress button', async () => {
      await loadPdf();
      await clickCompress();
      expect(container.querySelector(`.${pdfToolStyles['download-button']}`)).not.toBeNull();
      await tickFlatten(container);
      expect(container.querySelector(`.${pdfToolStyles['download-button']}`)).toBeNull();
      expect(container.querySelector(`.${styles['compression-stats']}`)).toBeNull();
      expect(container.querySelector(`.${pdfToolStyles['tool-primary-action']}`).textContent).toContain('Compress PDF');
    });
  });

  it('rejects a file that is not a PDF, JPG or PNG', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const textFile = new File(['plain text'], 'notes.txt', { type: 'text/plain' });

    await act(async () => {
      setInputFiles(input, [textFile]);
    });

    const hint = container.querySelector(`.${pdfToolStyles['hint-message']}`);
    expect(hint).not.toBeNull();
    expect(hint.textContent).toContain('notes.txt');
    expect(hint.textContent).toContain('not a PDF, JPG or PNG');

    // Rejecting doesn't load a file, so the dropzone is still showing.
    expect(container.querySelector(`.${dropzoneStyles.dropzone}`)).not.toBeNull();
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressImageLib.compressImageToTarget).not.toHaveBeenCalled();
  });

  it('records what the person did, by name only, in order', async () => {
    resetActionTrailForTests();
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });
    await act(async () => {
      setInputFiles(container.querySelector('input[type="file"]'), [makePdfFile('secret_name.pdf', 100000)]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const extremeCard = Array.from(container.querySelectorAll(`.${styles['compress-card']}`)).find((c) => c.textContent.includes('Extreme Compression'));
    await act(async () => {
      extremeCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector(`.${pdfToolStyles['tool-primary-action']}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(recentActions()).toEqual(['add_files', 'change_setting', 'export']);
  });
});
