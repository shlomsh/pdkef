import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import PdfSignTool from './PdfSignTool.jsx';
import { widthPercentToHeightPercent, pxToPercent, pxDeltaToPercent } from '../lib/coords.js';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

// signPdf fetches bundled fonts from same-origin `/fonts/<name>.ttf` at runtime
// (every text-element font, including the default Arimo, is an embedded TTF —
// see sign.js). jsdom has no server, so serve the real files straight off disk,
// same approach as sign.test.js's mockFontFetch.
function mockFontFetch() {
  const originalFetch = global.fetch;
  global.fetch = vi.fn(async (url) => {
    const match = /\/fonts\/(.+)$/.exec(String(url));
    if (!match) return originalFetch ? originalFetch(url) : Promise.reject(new Error('unexpected fetch'));
    const filePath = path.resolve(__dirname, '../../public/fonts', match[1]);
    if (!fs.existsSync(filePath)) {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const buffer = fs.readFileSync(filePath);
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(buffer).buffer };
  });
  return () => { global.fetch = originalFetch; };
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
  let restoreFetch;

  beforeEach(() => {
    restoreFetch = mockFontFetch();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    restoreFetch();
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

  it('loads saved signatures from localStorage on mount', async () => {
    const mockSignature = {
      id: 'sig-test-123',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      aspectRatio: 1
    };
    localStorage.setItem('pdf-toolkit:signatures', JSON.stringify([mockSignature]));

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Locate the signature tool button in the toolbar
    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Sign') && !btn.textContent.includes('Download'));
    expect(sigBtn).not.toBeNull();

    // Clicking signature button when saved signatures exist should toggle the dropdown
    await act(async () => {
      sigBtn.click();
    });

    const dropdown = container.querySelector('.sign-dropdown-menu');
    expect(dropdown).not.toBeNull();

    const dropdownItems = container.querySelectorAll('.sign-dropdown-item');
    expect(dropdownItems.length).toBe(1);

    // Clicking the item should close dropdown and select tool
    await act(async () => {
      dropdownItems[0].click();
    });

    const dropdownAfter = container.querySelector('.sign-dropdown-menu');
    expect(dropdownAfter).toBeNull();
  });

  it('allows opening the signature dialog and changing modes', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Clicking Signature when local storage is empty opens the dialog directly
    localStorage.removeItem('pdf-toolkit:signatures');
    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Sign') && !btn.textContent.includes('Download'));
    
    await act(async () => {
      sigBtn.click();
    });

    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();

    // Verify Draw, Type, Upload tabs are present
    const tabBtns = container.querySelectorAll('.sig-tab-btn');
    expect(tabBtns.length).toBe(3);
    expect(tabBtns[0].textContent).toBe('Draw');
    expect(tabBtns[1].textContent).toBe('Type');
    expect(tabBtns[2].textContent).toBe('Upload');

    // Switch to Type mode
    await act(async () => {
      tabBtns[1].click();
    });
    
    // Switch to Upload mode
    await act(async () => {
      tabBtns[2].click();
    });

    const dropzone = container.querySelector('.sig-upload-dropzone');
    expect(dropzone).not.toBeNull();
  });

  it('supports copying and pasting an element to clone it', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select text tool
    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const textBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });

    // Click on page overlay to place text element
    const overlay = container.querySelector('.sign-page-overlay');
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });

    // Verify element is placed
    let elements = container.querySelectorAll('.sign-element');
    expect(elements.length).toBe(1);

    // Mock copy event
    const copyEvent = new Event('copy', { bubbles: true });
    copyEvent.clipboardData = {
      setData: vi.fn()
    };
    await act(async () => {
      window.dispatchEvent(copyEvent);
    });

    // Mock paste event
    const pasteEvent = new Event('paste', { bubbles: true });
    pasteEvent.preventDefault = vi.fn();
    await act(async () => {
      window.dispatchEvent(pasteEvent);
    });

    // Verify element is cloned (now should be 2 elements)
    elements = container.querySelectorAll('.sign-element');
    expect(elements.length).toBe(2);
  });

  it('supports placing a symbol element', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select symbol tool
    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const symbolBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Symbol') || btn.querySelector('svg'));
    
    await act(async () => {
      // Index 0 is Text, Index 1 is Symbol
      toolbarButtons[1].click();
    });

    // Click on page overlay to place symbol element
    const overlay = container.querySelector('.sign-page-overlay');
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 200, clientY: 200, bubbles: true }));
    });

    // Verify element is placed
    const elements = container.querySelectorAll('.sign-element');
    expect(elements.length).toBe(1);
    
    // Check if it's a symbol (contains an SVG or symbol character)
    expect(elements[0].innerHTML).toContain('svg');
  });

  it('supports deleting an element with the Delete key', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select text tool
    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const textBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });

    // Click on page overlay to place text element
    const overlay = container.querySelector('.sign-page-overlay');
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });

    let elements = container.querySelectorAll('.sign-element');
    expect(elements.length).toBe(1);

    // Press Delete key
    const deleteEvent = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true });
    await act(async () => {
      window.dispatchEvent(deleteEvent);
    });

    // Verify element is deleted
    elements = container.querySelectorAll('.sign-element');
    expect(elements.length).toBe(0);
  });

  it('applies text annotations to num-1.pdf and exports a valid signed PDF', async () => {
    // Stub URL methods
    let savedBlob = null;
    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn((blob) => {
      savedBlob = blob;
      return 'blob:signed-pdf-url';
    });
    
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });
    
    // Load num-1.pdf
    const fixturePath = path.resolve(__dirname, '../lib/__fixtures__/num-1.pdf');
    const bytes = fs.readFileSync(fixturePath);
    const file = new File([bytes], 'num-1.pdf', { type: 'application/pdf' });
    
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    
    // Select text tool
    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const textBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });

    // Click on page overlay to place text element
    const overlay = container.querySelector('.sign-page-overlay');
    overlay.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => {}
    });
    
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });
    
    // Set text element content
    const inputField = container.querySelector('.sign-text-input');
    expect(inputField).not.toBeNull();
    await act(async () => {
      inputField.value = 'John Doe';
      inputField.dispatchEvent(new Event('input', { bubbles: true }));
      inputField.dispatchEvent(new Event('blur', { bubbles: true }));
    });

    // Click the save/download button to trigger handleSavePdf
    const saveButton = container.querySelector('button[title*="Save"]');
    expect(saveButton).not.toBeNull();
    
    await act(async () => {
      saveButton.click();
      await new Promise(resolve => setTimeout(resolve, 100)); // wait for saving to resolve
    });
    
    expect(savedBlob).not.toBeNull();
    
    // Assert on the resulting PDF
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({
      data: new Uint8Array(await savedBlob.arrayBuffer()),
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    expect(pdf.numPages).toBe(1);
    
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const extractedText = textContent.items.map(item => item.str).join(' ');
    
    expect(extractedText).toContain('1');
    expect(extractedText).toContain('John Doe');
    
    await loadingTask.destroy();
    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('auto-detects RTL content in a text element and aligns it right, reverting when content becomes LTR again', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select text tool and place an element
    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const textBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });

    const overlay = container.querySelector('.sign-page-overlay');
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });

    const textInput = container.querySelector('.sign-text-input');
    expect(textInput).not.toBeNull();

    // A fresh, empty element defaults to LTR
    expect(textInput.getAttribute('dir')).toBe('ltr');
    expect(textInput.style.textAlign).toBe('left');

    // Typing Hebrew flips the element to RTL
    await act(async () => {
      textInput.value = 'שלום עולם';
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(textInput.getAttribute('dir')).toBe('rtl');
    expect(textInput.style.textAlign).toBe('right');

    // Clearing the Hebrew and typing English text flips it back to LTR
    await act(async () => {
      textInput.value = 'Hello world';
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(textInput.getAttribute('dir')).toBe('ltr');
    expect(textInput.style.textAlign).toBe('left');
  });

  it('updates font selection and enables Save button when typing a signature', async () => {
    // Safely mock canvas context to prevent the live-preview useEffect from throwing
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => ({
      scale: vi.fn(), clearRect: vi.fn(), fillText: vi.fn(), 
      measureText: vi.fn(() => ({ width: 100 }))
    });

    try {
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(<PdfSignTool />, container);
      });

      const file = makePdfFile('test.pdf');
      const input = container.querySelector('input[type="file"]');
      await act(async () => {
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      localStorage.removeItem('pdf-toolkit:signatures');
      const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
      const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Sign') && !btn.textContent.includes('Download'));
      
      await act(async () => {
        sigBtn.click();
      });

      // Switch to Type mode
      const tabBtns = container.querySelectorAll('.sig-tab-btn');
      await act(async () => {
        tabBtns[1].click(); // Type tab
      });

      // The Caveat font should be active by default
      const fontBtns = Array.from(container.querySelectorAll('.sig-font-btn'));
      const caveatBtn = fontBtns.find(btn => btn.textContent === 'Caveat');
      expect(caveatBtn.classList.contains('active')).toBe(true);

      // Select Pacifico
      const pacificoBtn = fontBtns.find(btn => btn.textContent === 'Pacifico');
      await act(async () => {
        pacificoBtn.click();
      });

      // Pacifico should now be active, Caveat should not
      expect(pacificoBtn.classList.contains('active')).toBe(true);
      expect(caveatBtn.classList.contains('active')).toBe(false);

      // Save button should be disabled initially
      const saveSigBtn = container.querySelector('button.sig-btn-primary');
      expect(saveSigBtn.disabled).toBe(true);

      // Type a name
      const typeInput = container.querySelector('.sig-type-input');
      await act(async () => {
        typeInput.value = 'Test Signature';
        typeInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Save button should now be enabled
      expect(saveSigBtn.disabled).toBe(false);

    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  it('placeSignatureAt sizes/positions a placed signature using widthPercentToHeightPercent against the page wrapper (not the overlay)', async () => {
    // aspectRatio: 1 comes from the saved signature record; the page wrapper is
    // deliberately given a non-square rect (600x900) so a bug that used the overlay's
    // rect instead, or dropped the wrapper's own aspect ratio, would produce a
    // different height% than this test's independently-computed expectation.
    const mockSignature = {
      id: 'sig-geom',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      aspectRatio: 1
    };
    localStorage.setItem('pdf-toolkit:signatures', JSON.stringify([mockSignature]));

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select the saved signature from the dropdown, arming `activeSignature`.
    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Sign') && !btn.textContent.includes('Download'));
    await act(async () => { sigBtn.click(); });
    const dropdownItem = container.querySelector('.sign-dropdown-item');
    await act(async () => { dropdownItem.click(); });

    const overlay = container.querySelector('.sign-page-overlay');
    const wrapper = container.querySelector('.sign-page-wrapper');
    overlay.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => {}
    });
    wrapper.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 600, height: 900, right: 600, bottom: 900, x: 0, y: 0, toJSON: () => {}
    });

    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 120, clientY: 160, bubbles: true }));
    });

    const placed = container.querySelector('.sign-element');
    expect(placed).not.toBeNull();

    // Independently-derived expectation (mirrors placeSignatureAt's own math, but
    // computed here rather than copy-pasted from the component).
    const clickLeftPercent = pxToPercent(120, 600); // handlePageClick's own math, out of scope for this refactor
    const clickTopPercent = pxToPercent(160, 800);
    const widthPercent = 20; // placeSignatureAt's fixed default
    const heightPercent = widthPercentToHeightPercent(widthPercent, 1, 600, 900);
    const expectedLeft = clickLeftPercent - widthPercent / 2;
    const expectedTop = clickTopPercent - heightPercent / 2;

    expect(parseFloat(placed.style.left)).toBeCloseTo(expectedLeft);
    expect(parseFloat(placed.style.top)).toBeCloseTo(expectedTop);
    expect(parseFloat(placed.style.width)).toBeCloseTo(widthPercent);
    expect(parseFloat(placed.style.height)).toBeCloseTo(heightPercent);
    // Sanity: the 600x900 wrapper is not square, so height% must differ from width%
    // — otherwise this test wouldn't actually exercise widthPercentToHeightPercent.
    expect(heightPercent).not.toBeCloseTo(widthPercent);
  });

  it('whiteout draw converts pointer deltas to width/height percent via pxToPercent/pxDeltaToPercent', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const whiteoutBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Whiteout'));
    await act(async () => { whiteoutBtn.click(); });

    const overlay = container.querySelector('.sign-page-overlay');
    overlay.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => {}
    });

    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 400 })); // dx=100 dy=300
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const box = container.querySelector('.sign-element');
    expect(box).not.toBeNull();

    const startLeftPercent = pxToPercent(100, 500);
    const startTopPercent = pxToPercent(100, 1000);
    const widthPercent = pxDeltaToPercent(100, 500); // dragged right -> width grows from the start point
    const heightPercent = pxDeltaToPercent(300, 1000);

    expect(parseFloat(box.style.left)).toBeCloseTo(startLeftPercent);
    expect(parseFloat(box.style.top)).toBeCloseTo(startTopPercent);
    expect(parseFloat(box.style.width)).toBeCloseTo(widthPercent);
    expect(parseFloat(box.style.height)).toBeCloseTo(heightPercent);
  });
});

