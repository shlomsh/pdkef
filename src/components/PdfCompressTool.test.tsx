// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfCompressTool from './PdfCompressTool.tsx';
import * as compressLib from '../lib/compress.js';
import * as compressImageLib from '../lib/compressImage.js';
import * as thumbnailsLib from '../lib/thumbnails.js';
import styles from './PdfCompressTool.module.css';
import dropzoneStyles from './Dropzone.module.css';
import toolShellStyles from './ToolShell.module.css';
import pdfToolStyles from './PdfTool.module.css';
import { mockNativeFileShare } from '../test/mockFileShare.js';
import { setInputFiles } from '../test/setInputFiles.js';

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

vi.mock('../lib/compress.js', () => {
  return {
    compressPdf: vi.fn(() => Promise.resolve(new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' }))),
    compressPdfToTarget: vi.fn(() =>
      Promise.resolve({
        blob: new Blob(['%PDF-1.4-target'], { type: 'application/pdf' }),
        metTarget: true,
      }),
    ),
  };
});

// The interface this tool is built against (see compressImage.js's own
// tests): mocked here so this suite never depends on its implementation,
// only the shape it promises to return.
vi.mock('../lib/compressImage.js', () => ({
  compressImageToTarget: vi.fn(() => Promise.resolve(makeImageResult())),
}));

vi.mock('../lib/thumbnails.js', () => {
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
    // Restored explicitly, not left to vi.restoreAllMocks(): a test further
    // down that overrides these with a deferred implementation (to hold a run
    // in flight) would otherwise leave every later test's compress/preview
    // calls returning undefined instead of a Blob/data URL.
    compressLib.compressPdf.mockImplementation(() => Promise.resolve(new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' })));
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
    const thumbnails = await import('../lib/thumbnails.js');

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
      resolveA(new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' }));
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
    const thumbnails = await import('../lib/thumbnails.js');
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
    // compressPdfToTarget's own passthrough rule (src/lib/compress.js,
    // "Already under target" near line 147) returns the input File itself as
    // `blob` when the file is already under the target size - the PDF-side
    // mirror of compressImageToTarget's rule exercised above.
    compressLib.compressPdfToTarget.mockImplementation((passthroughFile) =>
      Promise.resolve({ blob: passthroughFile, metTarget: true }),
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
});
