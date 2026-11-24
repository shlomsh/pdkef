// forced: a Chrome 108 user agent, which a real browser cannot be told to report; it only matters to the old-browser notice
// @vitest-environment-options {"userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"}
import { render, type ComponentProps } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import PdfCompressTool from './PdfCompressTool.tsx';
import * as compressLib from './lib/compress.js';
import * as compressImageLib from './lib/compressImage.js';
import * as imagesLib from './lib/compressImages.js';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';

vi.mock('./lib/compressImages.js', { spy: true });
vi.mock('./lib/compress.js', { spy: true });
vi.mock('./lib/compressImage.js', { spy: true });

const NEWER_NOTICE = 'or newer to open PDFs';

describe('PdfCompressTool with nothing picked, and with a pick that needs no engine', () => {
  let container: HTMLDivElement;
  let harness: ToolHarness;

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    act(() => render(null, container));
    container.remove();
    await harness.settle();
    harness.restore();
  });

  // The dropzone's input, kept for the whole test: a second pick through it takes the no-confirm path a window drop takes.
  let fileInput: HTMLInputElement;
  const mount = (props: ComponentProps<typeof PdfCompressTool> = {}) => {
    act(() => {
      render(<PdfCompressTool {...props} />, container);
    });
    fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  };
  const pick = async (...files: File[]) => {
    await act(async () => {
      setInputFiles(fileInput, files);
    });
    await act(async () => { await drainPromises(); });
  };
  const loaded = () => container.querySelector('[data-compress-status]');
  const photo = (name: string) => new File([new Uint8Array(3000)], name, { type: 'image/jpeg' });
  async function textPdf(name: string) {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]).drawText('Quarterly report', { x: 50, y: 700, size: 12 });
    return new File([await doc.save()], name, { type: 'application/pdf' });
  }

  it('renders the initial file dropper zone', () => {
    mount();

    const dropzone = container.querySelector('[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone!.textContent).toContain('Drop a PDF or image here');
  });

  it('shows no loaded layout until a file is loaded', () => {
    mount();
    expect(container.querySelector('[data-compress-status]')).toBeNull();
  });

  it('the loaded state is the shell strip, then the result, the controls and the sheet, in that order, with the run counter', async () => {
    mount();
    await pick(await textPdf('order.pdf'));
    await waitUntil(() => expect(loaded()?.getAttribute('data-compress-status')).toBe('done'));
    const layout = container.querySelector('[data-compress-run]')!;
    const kids = Array.from(layout.children);
    expect(kids).toHaveLength(4);
    expect(kids[0].hasAttribute('data-strip')).toBe(true);
    expect(kids[0].querySelector('[data-tool-shell]')).not.toBeNull();
    expect(container.querySelectorAll('[data-tool-shell]')).toHaveLength(1);
    expect(kids[1].hasAttribute('data-result')).toBe(true);
    expect(kids[2].hasAttribute('data-controls')).toBe(true);
    expect(kids[3].hasAttribute('data-result-action')).toBe(true);
    expect(layout.getAttribute('data-compress-run')).toBe('1');
    expect(layout.getAttribute('data-compress-status')).toBe('done');
  });

  describe('the old browser notice', () => {
    it('stays off a photo, which never loads pdf.js', async () => {
      mount();
      await pick(photo('photo.jpg'));
      expect(loaded()).not.toBeNull();
      expect(container.textContent).not.toContain(NEWER_NOTICE);
    });

    it('still names the version for a PDF', async () => {
      mount();
      await pick(await textPdf('doc.pdf'));
      expect(loaded()).not.toBeNull();
      expect(container.textContent).toContain('needs Chrome 109 or newer');
    });
  });

  it('an image has no note, and reserves no lines for one', async () => {
    mount();
    await pick(photo('photo.jpg'));
    expect(loaded()).not.toBeNull();
    expect(container.querySelector('[data-compress-note]')).toBeNull();
    expect(container.querySelector('[data-tool-shell] [data-note]')).toBeNull();
  });

  it('rejects a file that is not a PDF, JPG or PNG', async () => {
    mount();
    await pick(new File(['plain text'], 'notes.txt', { type: 'text/plain' }));

    const hint = container.querySelector('[role="status"]');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain('notes.txt');
    expect(hint!.textContent).toContain('not a PDF, JPG or PNG');

    // Rejecting doesn't load a file, so the dropzone is still showing.
    expect(container.querySelector('[data-dropzone]')).not.toBeNull();
    expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressImageLib.compressImageToTarget).not.toHaveBeenCalled();
  });

  it('a single photo after a batch goes back to the single-photo view', async () => {
    mount();
    await pick(photo('a.jpg'), photo('b.jpg'));
    expect(container.querySelector('[data-compress-batch]')).not.toBeNull();
    await pick(photo('solo.jpg'));
    expect(container.querySelector('[data-compress-batch]')).toBeNull();
    expect(container.querySelector('[data-result]')).not.toBeNull();
  });
});
