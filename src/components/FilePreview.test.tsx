// @ts-nocheck - matches BasePdfTool.test.tsx / PdfCompressTool.test.tsx, not yet typed
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import FilePreview from './FilePreview.tsx';
import toolShellStyles from './ToolShell.module.css';
import styles from './FilePreview.module.css';
import * as thumbnailsLib from '../lib/thumbnails.js';

function makePdfFile(name = 'contract.pdf') {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function makeImageFile(name = 'photo.jpg', type = 'image/jpeg') {
  return new File(['fake-image-bytes'], name, { type });
}

// A controllable promise, so a test can assert the glyph-still-showing state
// before renderThumbnail settles, then resolve or reject on cue.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock('../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(),
}));

describe('FilePreview', () => {
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  function mount(props) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<FilePreview {...props} />, container);
    });
  }

  it('renders the glyph when no file is given', () => {
    mount({ file: null });
    const icon = container.querySelector(`.${toolShellStyles.icon}`);
    expect(icon).not.toBeNull();
    expect(icon.classList.contains(toolShellStyles['icon-loaded'])).toBe(false);
    expect(icon.querySelector('svg')).not.toBeNull();
    expect(icon.querySelector('img')).toBeNull();
  });

  it('renders an <img> at the object URL for an image file, and revokes it on unmount', () => {
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:preview-photo');
    window.URL.revokeObjectURL = vi.fn();

    const file = makeImageFile();
    mount({ file });

    const icon = container.querySelector(`.${toolShellStyles.icon}`);
    expect(icon.classList.contains(toolShellStyles['icon-loaded'])).toBe(true);
    const img = icon.querySelector(`img.${styles.thumbnail}`);
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('blob:preview-photo');
    expect(img.getAttribute('alt')).toBe('');
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();

    act(() => render(null, container));
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-photo');

    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    container = null; // already unmounted above
  });

  it('calls renderThumbnail for a PDF and swaps the glyph for the render once it resolves', async () => {
    const { promise, resolve } = deferred();
    thumbnailsLib.renderThumbnail.mockReturnValue(promise);

    const file = makePdfFile();
    mount({ file });

    expect(thumbnailsLib.renderThumbnail).toHaveBeenCalledWith(file, { width: 144 });
    // Still the glyph until the render settles.
    let icon = container.querySelector(`.${toolShellStyles.icon}`);
    expect(icon.querySelector('img')).toBeNull();
    expect(icon.querySelector('svg')).not.toBeNull();

    await act(async () => {
      resolve('data:image/png;base64,pdfpage1');
      await promise;
    });

    icon = container.querySelector(`.${toolShellStyles.icon}`);
    expect(icon.classList.contains(toolShellStyles['icon-loaded'])).toBe(true);
    const img = icon.querySelector(`img.${styles.thumbnail}`);
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('data:image/png;base64,pdfpage1');
  });

  it('keeps the glyph when the PDF render rejects (a broken or encrypted PDF)', async () => {
    const { promise, reject } = deferred();
    // The rejection is expected and swallowed - stub the handler so vitest's
    // unhandled-rejection guard doesn't flag it as a real one.
    promise.catch(() => {});
    thumbnailsLib.renderThumbnail.mockReturnValue(promise);

    const file = makePdfFile('locked.pdf');
    mount({ file });

    await act(async () => {
      reject(new Error('encrypted'));
      await promise.catch(() => {});
    });

    const icon = container.querySelector(`.${toolShellStyles.icon}`);
    expect(icon.classList.contains(toolShellStyles['icon-loaded'])).toBe(false);
    expect(icon.querySelector('img')).toBeNull();
    expect(icon.querySelector('svg')).not.toBeNull();
  });

  it('does not call renderThumbnail for a non-PDF, non-image file', () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    mount({ file });

    expect(thumbnailsLib.renderThumbnail).not.toHaveBeenCalled();
    const icon = container.querySelector(`.${toolShellStyles.icon}`);
    expect(icon.classList.contains(toolShellStyles['icon-loaded'])).toBe(false);
    expect(icon.querySelector('img')).toBeNull();
  });
});
