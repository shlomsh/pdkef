import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
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
    const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Signature'));
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
    const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Signature'));
    
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

  it('supports placing a checkmark element', async () => {
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

    // Select checkmark tool
    const toolbarButtons = container.querySelectorAll('.sign-tool-btn');
    const checkmarkBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Checkmark') || btn.querySelector('svg'));
    // Fallback logic if the text is hidden: the checkmark button sets the tool to 'checkmark'
    // Let's just find the button that has onClick setting 'checkmark' or has class active when we click it.
    // Actually we can just find it by finding the second button in the toolbar (index 1 is Checkmark based on grep)
    
    await act(async () => {
      // Index 0 is Text, Index 1 is Checkmark
      toolbarButtons[1].click();
    });

    // Click on page overlay to place checkmark element
    const overlay = container.querySelector('.sign-page-overlay');
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 200, clientY: 200, bubbles: true }));
    });

    // Verify element is placed
    const elements = container.querySelectorAll('.sign-element');
    expect(elements.length).toBe(1);
    
    // Check if it's a checkmark (contains an SVG or checkmark character)
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
});

