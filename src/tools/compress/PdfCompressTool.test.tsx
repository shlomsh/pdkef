import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import PdfCompressTool from './PdfCompressTool.tsx';
import { englishCompressMessages } from './messages';
import { ANALYSIS_SHAPES, buildAnalysisPdf, type AnalysisShape } from '../../test/support/analysisPdfFixtures.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { formatBytes } from './lib/resultView.ts';

const BYTES = {} as Record<AnalysisShape, Uint8Array<ArrayBuffer>>;
beforeAll(async () => {
  for (const [shape, spec] of Object.entries(ANALYSIS_SHAPES)) BYTES[shape as AnalysisShape] = new Uint8Array(await buildAnalysisPdf(spec));
});

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) {
    act(() => render(null, container as HTMLElement));
    container.remove();
    container = null;
  }
});

async function pickPdf(shape: AnalysisShape, name = 'doc.pdf') {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<PdfCompressTool />, container as HTMLElement));
  const file = new File([BYTES[shape]], name, { type: 'application/pdf' });
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
