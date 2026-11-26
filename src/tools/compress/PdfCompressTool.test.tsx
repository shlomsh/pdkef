import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfCompressTool from './PdfCompressTool.tsx';
import type { PdfCompressToolProps } from './hooks/useCompressTool.ts';
import { englishCompressMessages } from './messages';
import { ANALYSIS_SHAPES, buildAnalysisPdf, type AnalysisShape } from '../../test/support/analysisPdfFixtures.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { HeldFile } from '../../test/support/heldFile.ts';
import '../../test/support/realPdfjs.ts';
import { compressPdfImages } from './lib/compressImages.js';
import { formatBytes } from './lib/resultView.ts';

vi.mock('./lib/compressImages.js', { spy: true });

const BYTES = {} as Record<AnalysisShape, Uint8Array<ArrayBuffer>>;
beforeAll(async () => {
  for (const [shape, spec] of Object.entries(ANALYSIS_SHAPES)) BYTES[shape as AnalysisShape] = new Uint8Array(await buildAnalysisPdf(spec));
});

let container: HTMLElement | null = null;
beforeEach(() => { vi.mocked(compressPdfImages).mockReset(); });
afterEach(() => {
  if (container) {
    act(() => render(null, container as HTMLElement));
    container.remove();
    container = null;
  }
});

async function pickPdf(shape: AnalysisShape, props: PdfCompressToolProps = {}, picked?: File) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<PdfCompressTool {...props} />, container as HTMLElement));
  const file = picked ?? new File([BYTES[shape]], 'doc.pdf', { type: 'application/pdf' });
  act(() => setInputFiles(container!.querySelector('input[type="file"]'), [file]));
  return file;
}
const note = () => container!.querySelector('[data-compress-note]')?.textContent;

describe('PdfCompressTool strip', () => {
  it('shows the share note of a read PDF', async () => {
    await pickPdf('pictures');
    await waitUntil(() => note() === 'Images are 90% of this PDF, the part that gets smaller.');
  });

  it('shows the title when the PDF has no images', async () => {
    await pickPdf('textOnly');
    await waitUntil(() => note() === englishCompressMessages.noImagesTitle);
    expect(container!.querySelector('[data-compress-note] strong')?.textContent).toBe(englishCompressMessages.noImagesTitle);
  });

  it('shows the original size in the strip', async () => {
    const file = await pickPdf('pictures');
    await waitUntil(() => expect(container!.querySelector('[data-compress-sizes]')?.textContent).toMatch(new RegExp(`^${formatBytes(file.size)}`)));
  });
});

const HOUR = 3_600_000;
// A quiet time no test reaches: only a press can start the build.
const NEVER_QUIET = { baseMs: HOUR, stepMs: 0, maxMs: HOUR, burstWindowMs: HOUR };

describe('PdfCompressTool build', () => {
  const live = () => container!.querySelector('[role="status"].sr-only')!.textContent;
  const download = () => container!.querySelector('[data-result-action] [data-state]');

  it('tells a screen reader how the build ended', async () => {
    await pickPdf('textOnly');
    await waitUntil(() => container!.querySelector('[data-stats-title]') !== null);
    expect(live()).toBe(englishCompressMessages.alreadySmallComplete);
  });

  it('a press on Download starts the build at once, without waiting for the quiet time', async () => {
    // A pick reads its file three times: the encryption probe and the analysis start at once, then the build and the
    // original preview. The first two pass and the next waits, so the first build, which starts by itself, is held and
    // Download is on screen with nothing built.
    const held = new HeldFile(BYTES.textOnly, 'doc.pdf', { passReads: 2 });
    await pickPdf('textOnly', { quietPolicy: NEVER_QUIET }, held);
    await act(() => held.started);
    await act(async () => { await drainPromises(); });
    expect(compressPdfImages).toHaveBeenCalledTimes(1);
    const smallest = Array.from(container!.querySelectorAll<HTMLElement>('[role="radio"]')).find((el) => el.textContent!.includes('Smallest'));
    act(() => smallest!.click());
    await act(async () => { await drainPromises(); });
    expect(compressPdfImages).toHaveBeenCalledTimes(1);
    act(() => { download()!.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await act(async () => { await drainPromises(); });
    expect(compressPdfImages).toHaveBeenCalledTimes(2);
    held.release();
    await waitUntil(() => container!.querySelector('[data-stats-title]') !== null);
  });
});
