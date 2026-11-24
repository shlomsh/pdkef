import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfToImageTool from './PdfToImageTool.tsx';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { openThumbnailSource } from '#lib/pdf/thumbnails.js';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil } from '../../test/support/waitUntil.ts';

answerNetwork();

vi.mock('#lib/pdf/thumbnails.js', { spy: true });

const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const NAMES = ['report-page-1.png', 'report-page-2.png', 'report-page-3.png'];

async function threePages() {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i += 1) doc.addPage([200, 300]);
  return new File([new Uint8Array(await doc.save())], 'report.pdf', { type: 'application/pdf' });
}

describe('PdfToImageTool on the real canvas', () => {
  let container: HTMLElement;
  let harness: BrowserToolHarness;
  let nativeShare: ReturnType<typeof mockNativeFileShare>;
  const saved: string[] = [];
  const recordDownload = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[download]') : null;
    if (link) saved.push(link.download);
  };

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    nativeShare = mockNativeFileShare();
    vi.mocked(openThumbnailSource).mockClear();
    saved.length = 0;
    document.addEventListener('click', recordDownload, { capture: true });
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(async () => {
    document.removeEventListener('click', recordDownload, { capture: true });
    act(() => { render(null, container); });
    container.remove();
    nativeShare.restore();
    vi.restoreAllMocks();
    await harness.restore();
  });

  const downloadElement = () => container.querySelector('a[data-state]') as HTMLAnchorElement;
  const cells = () => container.querySelectorAll('ul[data-page-grid] > li[data-key]');

  const radio = (label: string) => Array.from(container.querySelectorAll<HTMLElement>('[data-rail] [role="radio"]')).find((r) => r.textContent === label) as HTMLElement;
  const click = (el: HTMLElement) => act(async () => { el.click(); });

  async function open() {
    act(() => { render(<PdfToImageTool quietPolicy={FAST_QUIET} />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [await threePages()]); });
    await waitUntil(() => {
      expect(cells()).toHaveLength(3);
      expect(downloadElement().textContent).toMatch(/\d(\.\d)? ?(KB|MB)|B⁩/);
    });
    await harness.flush();
  }

  it('lets go of its own document, saves every image once, and shares each as a native PNG file', async () => {
    await open();

    // The tool's own document is let go; the grid keeps the one it read the page sizes from until it unmounts.
    const sources = await Promise.all(vi.mocked(openThumbnailSource).mock.results.map((result) => result.value));
    const states = await Promise.all(sources.map((source) => source.render(0).then(
      () => 'open',
      (error: Error) => (error.message === 'openThumbnailSource: render() called after destroy()' ? 'destroyed' : `failed: ${error.message}`),
    )));
    expect(states.filter((state) => state === 'open')).toHaveLength(1);
    expect(states.filter((state) => state !== 'open' && state !== 'destroyed')).toEqual([]);

    const share = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Share') as HTMLButtonElement;
    await act(async () => { share.click(); });
    await waitUntil(() => expect(nativeShare.share).toHaveBeenCalledTimes(1));
    const [shared] = nativeShare.share.mock.calls[0] as unknown as [ShareData];
    expect(shared.files?.map((file) => [file.name, file.type])).toEqual(NAMES.map((name) => [name, 'image/png']));
    const signatures = await Promise.all((shared.files ?? []).map(async (file) => Array.from(new Uint8Array(await file.slice(0, 4).arrayBuffer()))));
    expect(signatures).toEqual(NAMES.map(() => [0x89, 0x50, 0x4e, 0x47]));

    await act(async () => { downloadElement().click(); });
    await waitUntil(() => {
      expect(saved).toEqual(NAMES);
      expect(downloadElement().dataset.state).toBe('saved');
    });
    expect(downloadElement().textContent).toContain('Saved 3 PNGs');
  });

  it('builds JPGs and one tall image on the real canvas', async () => {
    await open();
    await click(radio('JPG'));
    await waitUntil(() => {
      expect(downloadElement().textContent).toContain('Download 3 JPGs');
      expect(downloadElement().textContent).toMatch(/KB/);
    });
    await click(radio('One tall image'));
    await waitUntil(() => {
      expect(downloadElement().getAttribute('download')).toBe('report.jpg');
      expect(downloadElement().textContent).toMatch(/KB/);
      expect(downloadElement().getAttribute('href')).toMatch(/^blob:/);
    });
    const tall = await harness.blobForUrl(downloadElement().getAttribute('href'));
    expect(tall?.type).toBe('image/jpeg');
    const image = await createImageBitmap(tall as Blob);
    expect(image.height / image.width).toBeCloseTo(4.5, 1);
  });
});
