import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfRedactTool from './PdfRedactTool.jsx';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

// Mock getDocument because we don't want to load actual pdf.js workers in jsdom environment
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

describe('PdfRedactTool UI flow', () => {
  let container;

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
      render(<PdfRedactTool />, container);
    });

    const dropzone = container.querySelector('.dropzone');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF');
  });

  it('transitions to editing state when a file is selected', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('test_secret.pdf');

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait for async file loading
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Verify hint message appears indicating editing mode
    const header = container.querySelector('.hint-message');
    expect(header).not.toBeNull();
    expect(header.textContent).toContain('hide sensitive text');
    
    // Verify toolbar modes exist
    const toolbar = container.querySelector('.sign-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar.textContent).toContain('Blackout');
    expect(toolbar.textContent).toContain('Blur');
  });
});
