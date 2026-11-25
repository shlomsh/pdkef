import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import FilePreview from './FilePreview.tsx';
import { waitUntil } from '../test/support/waitUntil.ts';
import { HeldFile } from '../test/support/heldFile.ts';
import '../test/support/realPdfjs.ts';
// Asserts the icon-loaded state class (the thumbnail swap is the behaviour).
import * as thumbnailsLib from '#lib/pdf/thumbnails.js';

function makePdfFile(name = 'contract.pdf') {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function makeImageFile(name = 'photo.jpg', type = 'image/jpeg') {
  return new File(['fake-image-bytes'], name, { type });
}

// The real renderer runs on real PDFs (pdf.js legacy paints into jsdom's canvas); the spy only shows the call
// and hands the test the render's own promise to await.
vi.mock('#lib/pdf/thumbnails.js', { spy: true });

async function realPdf(name: string, height = 200) {
  const doc = await PDFDocument.create();
  doc.addPage([200, height]);
  return new File([await doc.save()], name, { type: 'application/pdf' });
}
const renderOf = (n: number) => vi.mocked(thumbnailsLib.renderThumbnail).mock.results[n].value as Promise<string>;
const settled = (promise: Promise<unknown>) => act(async () => { await promise.catch(() => {}); });

describe('FilePreview', () => {
  let container: HTMLElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container!));
      container.remove();
      container = null;
    }
  });

  function mount(props: Record<string, unknown>) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<FilePreview {...props} />, container!);
    });
  }

  it('renders the glyph when no file is given', () => {
    mount({ file: null });
    const icon = container!.querySelector('span[aria-hidden="true"]');
    expect(icon).not.toBeNull();
    expect(icon.hasAttribute('data-loaded')).toBe(false);
    expect(icon.querySelector('svg')).not.toBeNull();
    expect(icon.querySelector('img')).toBeNull();
  });

  it('renders an <img> at the object URL for an image file, and revokes it on unmount', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    try {
      const file = makeImageFile();
      mount({ file });

      const icon = container!.querySelector('span[aria-hidden="true"]');
      expect(icon.hasAttribute('data-loaded')).toBe(true);
      const img = icon.querySelector('img');
      expect(img).not.toBeNull();
      const src = img.getAttribute('src')!;
      expect(src.startsWith('blob:')).toBe(true);
      expect(src).toBe(createSpy.mock.results[0].value);
      expect(img.getAttribute('alt')).toBe('');
      expect(createSpy).toHaveBeenCalledWith(file);
      expect(revokeSpy).not.toHaveBeenCalled();

      act(() => render(null, container!));
      expect(revokeSpy).toHaveBeenCalledWith(src);
    } finally {
      createSpy.mockRestore();
      revokeSpy.mockRestore();
    }
    container = null; // already unmounted above
  });

  it('renders an <img> for an image file with no MIME type, via the filename extension fallback', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL');

    try {
      const file = makeImageFile('photo.png', '');
      mount({ file });

      const icon = container!.querySelector('span[aria-hidden="true"]');
      expect(icon.hasAttribute('data-loaded')).toBe(true);
      const img = icon.querySelector('img');
      expect(img).not.toBeNull();
      expect(img.getAttribute('src')!.startsWith('blob:')).toBe(true);
      expect(img.getAttribute('src')).toBe(createSpy.mock.results[0].value);
      expect(createSpy).toHaveBeenCalledWith(file);
    } finally {
      createSpy.mockRestore();
    }
  });

  it('calls renderThumbnail for a PDF with no MIME type, via the filename extension fallback', async () => {
    const file = await realPdf('contract.pdf');
    Object.defineProperty(file, 'type', { value: '' });
    mount({ file });

    expect(thumbnailsLib.renderThumbnail).toHaveBeenCalledWith(file, { width: 192 });
    await settled(renderOf(0));
  });

  it('calls renderThumbnail for a PDF and swaps the glyph for the render once it resolves', async () => {
    const file = await realPdf('contract.pdf');
    mount({ file });

    expect(thumbnailsLib.renderThumbnail).toHaveBeenCalledWith(file, { width: 192 });
    // Still the glyph until the render settles.
    let icon = container!.querySelector('span[aria-hidden="true"]');
    expect(icon.querySelector('img')).toBeNull();
    expect(icon.querySelector('svg')).not.toBeNull();

    const rendered = await renderOf(0);
    await waitUntil(() => container!.querySelector('img'));

    icon = container!.querySelector('span[aria-hidden="true"]');
    expect(icon.hasAttribute('data-loaded')).toBe(true);
    const img = icon.querySelector('img');
    expect(img).not.toBeNull();
    expect(rendered.startsWith('data:image/png;base64,')).toBe(true);
    expect(img.getAttribute('src')).toBe(rendered);
  });

  it('keeps the glyph when the PDF render rejects (a broken or encrypted PDF)', async () => {
    const file = makePdfFile('locked.pdf'); // bytes pdf.js cannot open
    mount({ file });

    await expect(renderOf(0)).rejects.toBeInstanceOf(Error);
    await settled(renderOf(0));

    const icon = container!.querySelector('span[aria-hidden="true"]');
    expect(icon.hasAttribute('data-loaded')).toBe(false);
    expect(icon.querySelector('img')).toBeNull();
    expect(icon.querySelector('svg')).not.toBeNull();
  });

  it('ignores a PDF render that resolves after the file changed', async () => {
    const first = new HeldFile(new Uint8Array(await (await realPdf('a.pdf', 200)).arrayBuffer()), 'a.pdf');
    const second = await realPdf('b.pdf', 300);
    mount({ file: first });
    await first.started; // the first render is waiting on its bytes
    act(() => render(<FilePreview file={second} />, container!));

    const secondRender = await renderOf(1);
    await waitUntil(() => container!.querySelector('img'));
    expect(container!.querySelector('img')!.getAttribute('src')).toBe(secondRender);

    first.release();
    const firstRender = await renderOf(0);
    await settled(renderOf(0));
    // The first render really finished with a different picture, and the slot still shows the second.
    expect(firstRender.startsWith('data:image/png;base64,')).toBe(true);
    expect(firstRender).not.toBe(secondRender);
    expect(container!.querySelector('img')!.getAttribute('src')).toBe(secondRender);
  });

  it('revokes the previous image object URL when the file changes', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    try {
      mount({ file: makeImageFile('a.jpg') });
      const first = container!.querySelector('img')!.getAttribute('src')!;
      expect(first.startsWith('blob:')).toBe(true);
      expect(revokeSpy).not.toHaveBeenCalled();
      act(() => render(<FilePreview file={makeImageFile('b.jpg')} />, container!));
      const second = container!.querySelector('img')!.getAttribute('src')!;
      expect(second.startsWith('blob:')).toBe(true);
      expect(second).not.toBe(first);
      expect(revokeSpy).toHaveBeenCalledWith(first);
      expect(revokeSpy).not.toHaveBeenCalledWith(second);
    } finally {
      revokeSpy.mockRestore();
    }
  });

  it('does not call renderThumbnail for a non-PDF, non-image file', () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    mount({ file });

    expect(thumbnailsLib.renderThumbnail).not.toHaveBeenCalled();
    const icon = container!.querySelector('span[aria-hidden="true"]');
    expect(icon.hasAttribute('data-loaded')).toBe(false);
    expect(icon.querySelector('img')).toBeNull();
  });
});
