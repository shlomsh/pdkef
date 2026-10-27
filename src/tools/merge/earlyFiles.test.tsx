// @ts-nocheck - test file, mirrors PdfMergeTool.test.tsx's loose fixtures
import { hydrate } from 'preact';
import { act } from 'preact/test-utils';
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfMergeTool from './PdfMergeTool.tsx';
import { setInputFiles } from '../../test/support/setInputFiles.js';

vi.mock('./merge.js', () => {
  class MergeFileError extends Error {}
  return {
    MergeFileError,
    mergePdfs: vi.fn(() => Promise.resolve(new Blob(['x'], { type: 'application/pdf' }))),
    inspectPdf: vi.fn(() => Promise.resolve({ pageCount: 2, encrypted: false, creationDate: null })),
  };
});
vi.mock('../../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(() => Promise.resolve('data:image/png;base64,mock')),
  renderThumbnailWithMeta: vi.fn(),
  renderPdfThumbnails: vi.fn(() => Promise.resolve(0)),
  openThumbnailSource: vi.fn(),
}));

const flush = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const pdf = (name) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

/* Files offered the moment the island hydrates, before the lazy draft module and
   the grid have loaded, land as entries. (A change event fired BEFORE hydration has
   no handler to hear it, in 959e940f's island exactly as now: that is a timing
   race for a caller to wait out, like the astro-island wait in the e2e specs.) */
describe('files offered right after hydration', () => {
  const Island = PdfMergeTool;
  let container;
  afterEach(() => { container?.remove(); container = null; });

  it('lands them as entries when offered straight after hydration starts', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(<Island />);
    await act(async () => { hydrate(<Island />, container); });
    // No flush: the draft module and the grid have not loaded yet.
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [pdf('one.pdf'), pdf('two.pdf'), pdf('three.pdf')]);
      await flush(10);
    });
    expect(container.querySelectorAll('[data-link-row]').length).toBe(3);
  });
});
