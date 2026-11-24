import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { drainPromises } from '../../test/support/drainPromises.ts';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { noPagesKey, ORIGINAL_WIDTHS } from '../../test/support/pdfPageTreeFixtures.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { openThumbnailSource } from '#lib/pdf/thumbnails.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { waitUntil } from '../../test/support/waitUntil.ts';

// DEBT-54: a file whose page list was lost is repaired once on open; the
// grid (pdf.js) and the export must both read the repaired bytes while the
// person's file keeps its identity.

answerNetwork();

vi.mock('#lib/pdf/thumbnails.js', { spy: true });

// The page widths of a PDF's bytes: its pages are told apart by width (200, 300, 400).
async function widthsOf(blob: Blob) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  return doc.getPages().map((p) => p.getWidth());
}

describe('PdfEditPagesTool working file after a repair', () => {
  let container: HTMLElement;
  let harness: BrowserToolHarness;
  // The file whose page list was lost, so opening it repairs it.
  let original: File;
  const grid = () => container.querySelectorAll('ul[data-page-grid] > li[data-key]');
  const downloadElement = () => container.querySelector('a[data-state]') as HTMLAnchorElement;

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    original = new File([new Uint8Array(noPagesKey())], 'document.pdf', { type: 'application/pdf', lastModified: 1234 });
    vi.mocked(openThumbnailSource).mockClear();
  });

  afterEach(async () => {
    act(() => render(null, container));
    container.remove();
    vi.restoreAllMocks();
    await harness.restore();
  });

  const thumbnailsDrawn = () => waitUntil(() => {
    const drawn = container.querySelectorAll('ul[data-page-grid] img[src]').length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBe(grid().length);
  });

  async function open() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [original]); });
    await until(() => container.querySelector('ul[data-page-grid]') || container.querySelector('[role="alert"]'));
    if (container.querySelector('ul[data-page-grid]')) await thumbnailsDrawn();
  }

  async function build() {
    await act(async () => {
      downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    await until(() => downloadElement().getAttribute('href'));
    // The tests assert exactly one export: drain so a second one would show.
    await act(async () => { await drainPromises(); });
  }

  it('hands the repaired bytes, under the original name, to the grid and the export', async () => {
    await open();

    const gridFile = vi.mocked(openThumbnailSource).mock.calls[0][0] as File;
    expect(gridFile).not.toBe(original);
    expect(gridFile.name).toBe('document.pdf');
    expect(gridFile.type).toBe('application/pdf');
    expect(gridFile.lastModified).toBe(1234);
    // The grid reads the repaired copy: all three pages, which the lost page list left unreachable.
    expect(await widthsOf(gridFile)).toEqual(ORIGINAL_WIDTHS);
    expect(grid().length).toBe(3);
    expect(container.textContent).toContain('document_modified.pdf');

    await build();
    // The export read the repaired copy too: all three pages came out, in order, under the original name.
    expect(harness.createdBlobs()).toHaveLength(1);
    expect(await widthsOf(harness.createdBlobs()[0])).toEqual(ORIGINAL_WIDTHS);
    expect(downloadElement().getAttribute('download')).toBe('document_modified.pdf');
  });
});
