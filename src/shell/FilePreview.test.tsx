import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import FilePreview from './FilePreview.tsx';
// Asserts the icon-loaded state class (the thumbnail swap is the behaviour).
import * as thumbnailsLib from '#lib/pdf/thumbnails.js';

function makePdfFile(name = 'contract.pdf') {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function makeImageFile(name = 'photo.jpg', type = 'image/jpeg') {
  return new File(['fake-image-bytes'], name, { type });
}

// A controllable promise, so a test can assert the glyph-still-showing state
// before renderThumbnail settles, then resolve or reject on cue.
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// jsdom has no canvas to paint a page on, so the real renderer stays in place as a spy and each PDF test
// forces only its answer (`mockReturnValue`), on cue.
vi.mock('#lib/pdf/thumbnails.js', { spy: true });

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

  it('calls renderThumbnail for a PDF with no MIME type, via the filename extension fallback', () => {
    const { promise } = deferred();
    vi.mocked(thumbnailsLib.renderThumbnail).mockReturnValue(promise);

    const file = makePdfFile('contract.pdf');
    Object.defineProperty(file, 'type', { value: '' });
    mount({ file });

    expect(thumbnailsLib.renderThumbnail).toHaveBeenCalledWith(file, { width: 192 });
  });

  it('calls renderThumbnail for a PDF and swaps the glyph for the render once it resolves', async () => {
    const { promise, resolve } = deferred();
    vi.mocked(thumbnailsLib.renderThumbnail).mockReturnValue(promise);

    const file = makePdfFile();
    mount({ file });

    expect(thumbnailsLib.renderThumbnail).toHaveBeenCalledWith(file, { width: 192 });
    // Still the glyph until the render settles.
    let icon = container!.querySelector('span[aria-hidden="true"]');
    expect(icon.querySelector('img')).toBeNull();
    expect(icon.querySelector('svg')).not.toBeNull();

    await act(async () => {
      resolve('data:image/png;base64,pdfpage1');
      await promise;
    });

    icon = container!.querySelector('span[aria-hidden="true"]');
    expect(icon.hasAttribute('data-loaded')).toBe(true);
    const img = icon.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('data:image/png;base64,pdfpage1');
  });

  it('keeps the glyph when the PDF render rejects (a broken or encrypted PDF)', async () => {
    const { promise, reject } = deferred();
    // The rejection is expected and swallowed - stub the handler so vitest's
    // unhandled-rejection guard doesn't flag it as a real one.
    promise.catch(() => {});
    vi.mocked(thumbnailsLib.renderThumbnail).mockReturnValue(promise);

    const file = makePdfFile('locked.pdf');
    mount({ file });

    await act(async () => {
      reject(new Error('encrypted'));
      await promise.catch(() => {});
    });

    const icon = container!.querySelector('span[aria-hidden="true"]');
    expect(icon.hasAttribute('data-loaded')).toBe(false);
    expect(icon.querySelector('img')).toBeNull();
    expect(icon.querySelector('svg')).not.toBeNull();
  });

  it('ignores a PDF render that resolves after the file changed', async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(thumbnailsLib.renderThumbnail).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    mount({ file: makePdfFile('a.pdf') });
    act(() => render(<FilePreview file={makePdfFile('b.pdf')} />, container!));

    await act(async () => {
      first.resolve('data:image/png;base64,old');
      await first.promise;
    });
    expect(container!.querySelector('img')).toBeNull();

    await act(async () => {
      second.resolve('data:image/png;base64,new');
      await second.promise;
    });
    expect(container!.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,new');
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
