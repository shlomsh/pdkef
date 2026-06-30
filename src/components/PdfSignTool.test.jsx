import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfSignTool from './PdfSignTool.jsx';

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

describe('PdfSignTool UI flow', () => {
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
      render(<PdfSignTool />, container);
    });

    const dropzone = container.querySelector('.dropzone');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('transitions to loading and editing state when a file is selected', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('test_agreement.pdf');

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait for chained async operations (getPdfjs -> arrayBuffer -> getDocument) to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // It should now show "Signing: test_agreement.pdf"
    const header = container.querySelector('.list-count');
    expect(header).not.toBeNull();
    expect(header.textContent).toContain('Signing: test_agreement.pdf');
  });
});
