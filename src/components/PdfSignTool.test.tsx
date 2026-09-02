// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import PdfSignTool from './PdfSignTool.tsx';
import * as signModule from '../editor/adapters/pdf/sign.js';
import toolbarStyles from './SignTool/SignToolbar.module.css';
import workspaceStyles from './SignTool/Workspace.module.css';
import { widthPercentToHeightPercent, pxToPercent, pxDeltaToPercent } from '../editor/geometry/coords.js';
import dropzoneStyles from './Dropzone.module.css';
import toolShellStyles from './ToolShell.module.css';
import { setInputFiles } from '../test/setInputFiles.js';

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
    document.body.innerHTML = '';
    restoreFetch();
    vi.restoreAllMocks();
  });

  it('renders the initial file dropper zone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
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
      setInputFiles(input, [file]);
    });

    // Wait for chained async operations (getPdfjs -> arrayBuffer -> getDocument) to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // The dropzone should now be replaced by the loaded-state identity line.
    const fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar).not.toBeNull();
    expect(fileBar.textContent).toContain('test_agreement.pdf');
  });

  it.each([
    ['download', 'Save your changes and download the signed PDF', () => new signModule.UnrepresentableTextError(['\u{1F600}'], [1]), '\u{1F600}', 'Initial text'],
    ['share preparation', 'Save your changes to share the signed PDF', () => new Error('Export failed'), 'Your edits are still here', 'Initial text']
  ])('keeps the editor usable after a %s failure and allows a corrected retry', async (mode, title, makeError, errorText, initialText) => {
    const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    const originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn(async () => {}) });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    const signedBlob = new Blob(['signed test result'], { type: 'application/pdf' });
    const sign = vi.spyOn(signModule, 'signPdf')
      .mockRejectedValueOnce(makeError())
      .mockResolvedValueOnce(signedBlob);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:signed-test');

    try {
      container = document.createElement('div');
      document.body.appendChild(container);
      await act(async () => { render(<PdfSignTool />, container); });
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [makePdfFile('retry.pdf')]);
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      const pageRect = { left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON() {} };
      const wrapper = container.querySelector(`.${workspaceStyles['page-wrapper']}`);
      const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
      wrapper.getBoundingClientRect = () => pageRect;
      overlay.getBoundingClientRect = () => pageRect;
      await act(async () => {
        Array.from(container.querySelectorAll(`.${toolbarStyles.button}`))
          .find(button => button.textContent.includes('Text')).click();
      });
      await act(async () => {
        overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
      });
      const textInput = container.querySelector('[data-editor-text-input]');
      await act(async () => {
        // Export is intentionally disabled for text that the bundled fonts
        // cannot represent. Keep this flow's input exportable so the mocked
        // signPdf rejection exercises recovery rather than the preflight.
        textInput.value = initialText;
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => { container.querySelector(`button[title="${title}"]`).click(); });

      // Export code is loaded on demand, so the click starts an async module
      // fetch before it reaches the mocked serializer.
      await vi.waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
      expect(container.querySelector(`.${workspaceStyles['page-wrapper']}`)).toBe(wrapper);
      expect(container.querySelector('[data-editor-text-input]')).toBe(textInput);
      expect(textInput.value).toBe(initialText);
      expect(container.querySelector('[role="alert"]').textContent).toContain(errorText);

      await act(async () => {
        textInput.value = 'Corrected text';
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => { container.querySelector(`button[title="${title}"]`).click(); });
      await vi.waitFor(() => expect(sign).toHaveBeenCalledTimes(2));
      expect(sign.mock.calls[1][1][0].text).toBe('Corrected text');
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('[data-editor-text-input]').value).toBe('Corrected text');
      if (mode === 'download') expect(createUrl).toHaveBeenCalledWith(signedBlob);
      else expect(container.querySelector('button[title="Share the signed PDF"]')).not.toBeNull();
    } finally {
      if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
      else delete navigator.share;
      if (originalCanShare) Object.defineProperty(navigator, 'canShare', originalCanShare);
      else delete navigator.canShare;
    }
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
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Locate the signature tool button in the toolbar
    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Sign') && !btn.textContent.includes('Download'));
    expect(sigBtn).not.toBeNull();

    // Clicking signature button when saved signatures exist should toggle the dropdown
    await act(async () => {
      sigBtn.click();
    });

    const dropdown = document.body.querySelector('[data-editor-signature-popover]');
    expect(dropdown).not.toBeNull();

    const dropdownItems = document.body.querySelectorAll('[data-editor-signature-item]');
    expect(dropdownItems.length).toBe(1);

    // Clicking the item should close dropdown and select tool
    await act(async () => {
      dropdownItems[0].click();
    });

    const dropdownAfter = document.body.querySelector('[data-editor-signature-popover]');
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
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Clicking Signature when local storage is empty opens the dialog directly
    localStorage.removeItem('pdf-toolkit:signatures');
    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Sign') && !btn.textContent.includes('Download'));
    
    await act(async () => {
      sigBtn.click();
    });

    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();

    // Verify Draw, Type, Upload tabs are present
    const tabBtns = container.querySelectorAll('[data-editor-dialog-tab]');
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

    const dropzone = container.querySelector('[data-editor-upload-dropzone]');
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
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select text tool
    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const textBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });

    // Click on page overlay to place text element
    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });

    // Verify element is placed
    let elements = container.querySelectorAll('[data-editor-element]');
    expect(elements.length).toBe(1);

    // Blur textarea to select the wrapper element instead for copy/paste
    await act(async () => {
      container.querySelector('[data-editor-text-input]')?.blur();
    });

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
    elements = container.querySelectorAll('[data-editor-element]');
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
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select symbol tool
    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const symbolBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Symbol') || btn.querySelector('svg'));
    
    await act(async () => {
      // Index 0 is Text, Index 1 is Symbol
      toolbarButtons[1].click();
    });

    // Click on page overlay to place symbol element
    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 200, clientY: 200, bubbles: true }));
    });

    // Verify element is placed
    const elements = container.querySelectorAll('[data-editor-element]');
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
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select text tool
    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const textBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });

    // Click on page overlay to place text element
    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });

    let elements = container.querySelectorAll('[data-editor-element]');
    expect(elements.length).toBe(1);

    // Blur textarea to select the wrapper element instead for deletion
    await act(async () => {
      container.querySelector('[data-editor-text-input]')?.blur();
    });

    // Press Delete key
    const deleteEvent = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true });
    await act(async () => {
      window.dispatchEvent(deleteEvent);
    });

    // Verify element is deleted
    elements = container.querySelectorAll('[data-editor-element]');
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
      setInputFiles(input, [file]);
    });
    
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    
    // Select text tool
    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const textBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });

    // Click on page overlay to place text element
    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    overlay.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => {}
    });
    
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });
    
    // Set text element content
    const inputField = container.querySelector('[data-editor-text-input]');
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
      // Poll instead of a fixed delay: signPdf's duration isn't bounded, and a
      // fixed 100ms wait flaked under CI's slower/contended runners.
      const deadline = Date.now() + 5000;
      while (savedBlob === null && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
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
    // Join with '' rather than a literal space: W6's per-run
    // /Span <</ActualText>> BDC...EMC wrapper (text.ts's drawShapedRun) is a
    // marked-content boundary, so pdf.js now reports "John" and "Doe" as
    // separate items around their own already-present " " item (rather than
    // merging the whole run into one "John Doe" item as it did before) -
    // joining with an extra space would double it up. Collapse whitespace
    // afterwards so the assertion stays robust to pdf.js's own item
    // granularity, which this test isn't asserting on.
    const extractedText = textContent.items.map(item => item.str).join('').replace(/\s+/g, ' ');

    expect(extractedText).toContain('1');
    expect(extractedText).toContain('John Doe');
    
    await loadingTask.destroy();
    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('prepares and shares a valid signed PDF from the real num-1.pdf fixture', async () => {
    const originalShare = navigator.share;
    const originalCanShare = navigator.canShare;
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });

    try {
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => render(<PdfSignTool />, container));

      const fixturePath = path.resolve(__dirname, '../lib/__fixtures__/num-1.pdf');
      const file = new File([fs.readFileSync(fixturePath)], 'num-1.pdf', { type: 'application/pdf' });
      const input = container.querySelector('input[type="file"]');
      await act(async () => {
        setInputFiles(input, [file]);
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      const prepareButton = container.querySelector('button[title="Save your changes to share the signed PDF"]');
      expect(prepareButton).not.toBeNull();
      await act(async () => {
        prepareButton.click();
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const shareButton = container.querySelector('button[title="Share the signed PDF"]');
      expect(shareButton).not.toBeNull();
      expect(shareButton.textContent).toContain('Share now');
      await act(async () => {
        shareButton.click();
      });

      expect(share).toHaveBeenCalledOnce();
      const sharedFile = share.mock.calls[0][0].files[0];
      expect(sharedFile).toBeInstanceOf(File);
      expect(sharedFile.name).toBe('signed_num-1.pdf');

      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = getDocument({ data: new Uint8Array(await sharedFile.arrayBuffer()) });
      const pdf = await loadingTask.promise;
      expect(pdf.numPages).toBe(1);
      await loadingTask.destroy();
    } finally {
      if (originalShare === undefined) delete navigator.share;
      else Object.defineProperty(navigator, 'share', { configurable: true, value: originalShare });
      if (originalCanShare === undefined) delete navigator.canShare;
      else Object.defineProperty(navigator, 'canShare', { configurable: true, value: originalCanShare });
    }
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
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select text tool and place an element
    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const textBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });

    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });

    const textInput = container.querySelector('[data-editor-text-input]');
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

  it('uses edited text size, color, and typed direction when creating the next text element', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const wrapper = container.querySelector(`.${workspaceStyles['page-wrapper']}`);
    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    const pageRect = {
      left: 0,
      top: 0,
      width: 600,
      height: 800,
      right: 600,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => {}
    };
    wrapper.getBoundingClientRect = () => pageRect;
    overlay.getBoundingClientRect = () => pageRect;

    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const textBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });

    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });

    const firstTextInput = container.querySelector('[data-editor-text-input]');
    expect(firstTextInput).not.toBeNull();

    const increaseFont = container.querySelector('button[title="Increase font size"]');
    expect(increaseFont).not.toBeNull();
    await act(async () => {
      increaseFont.click();
    });

    const colorTrigger = container.querySelector('button[title="Text color"]');
    expect(colorTrigger).not.toBeNull();
    await act(async () => {
      colorTrigger.click();
    });

    const colorMenu = document.body.querySelector('[data-editor-color-menu]');
    expect(colorMenu).not.toBeNull();
    const redSwatch = colorMenu.querySelector('[data-editor-color-swatch][title="#d8342b"]');
    expect(redSwatch).not.toBeNull();
    await act(async () => {
      redSwatch.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(localStorage.getItem('pdf-toolkit:lastColor')).toBe('#d8342b');
    expect(localStorage.getItem('pdf-toolkit:lastFontSize')).toBe('13');
    expect(container.querySelector('[data-editor-text-input]').style.color).toBe('rgb(216, 52, 43)');

    await act(async () => {
      firstTextInput.value = 'שלום';
      firstTextInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // The text tool places one box per arming, so re-arm it for the second.
    await act(async () => {
      textBtn.click();
    });

    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 260, clientY: 220, bubbles: true }));
    });

    const textInputs = container.querySelectorAll('[data-editor-text-input]');
    expect(textInputs.length).toBe(2);
    const editedTextInput = textInputs[0];
    const nextTextInput = textInputs[1];

    // A new field has no typed language yet, so it uses the product's
    // English/LTR default rather than inheriting the previous Hebrew field.
    expect(nextTextInput.getAttribute('dir')).toBe('ltr');
    expect(nextTextInput.style.textAlign).toBe('left');
    expect(nextTextInput.style.color).toBe('rgb(216, 52, 43)');
    expect(nextTextInput.style.fontSize).toBe(editedTextInput.style.fontSize);

    await act(async () => {
      nextTextInput.value = '27/05/2008';
      nextTextInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(nextTextInput.getAttribute('dir')).toBe('ltr');
    expect(nextTextInput.style.textAlign).toBe('left');
  });

  // The reported bug: a text box could not be removed from the keyboard at all,
  // because clicking it put the caret inside, and the delete shortcut steps
  // aside for a focused input. Escape now ends the edit session and leaves the
  // box selected, which is the state Backspace acts on.
  it('deletes a text box with Backspace once Escape has closed its edit session', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const wrapper = container.querySelector(`.${workspaceStyles['page-wrapper']}`);
    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    const pageRect = {
      left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => {}
    };
    wrapper.getBoundingClientRect = () => pageRect;
    overlay.getBoundingClientRect = () => pageRect;

    const textBtn = Array.from(container.querySelectorAll(`.${toolbarStyles.button}`))
      .find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });

    const textInput = container.querySelector('[data-editor-text-input]');
    expect(textInput).not.toBeNull();
    // Placed boxes open ready to type, so Backspace still belongs to the text.
    expect(textInput.readOnly).toBe(false);
    expect(document.activeElement).toBe(textInput);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    });
    expect(container.querySelectorAll('[data-editor-text-input]').length).toBe(1);

    // Escape steps out of the text and leaves the box selected, not deselected.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    const selected = container.querySelector('[data-editor-element][data-editor-active]');
    expect(selected).not.toBeNull();
    expect(container.querySelector('[data-editor-text-input]').readOnly).toBe(true);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    });
    expect(container.querySelectorAll('[data-editor-text-input]').length).toBe(0);
  });

  it('reopens an edit session with Enter on a selected text box', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSignTool />, container);
    });

    const file = makePdfFile('test.pdf');
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const wrapper = container.querySelector(`.${workspaceStyles['page-wrapper']}`);
    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    const pageRect = {
      left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => {}
    };
    wrapper.getBoundingClientRect = () => pageRect;
    overlay.getBoundingClientRect = () => pageRect;

    const textBtn = Array.from(container.querySelectorAll(`.${toolbarStyles.button}`))
      .find(btn => btn.textContent.includes('Text'));
    await act(async () => {
      textBtn.click();
    });
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 100, clientY: 100, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[data-editor-text-input]').readOnly).toBe(true);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    const textInput = container.querySelector('[data-editor-text-input]');
    expect(textInput.readOnly).toBe(false);
    expect(document.activeElement).toBe(textInput);
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
        setInputFiles(input, [file]);
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      localStorage.removeItem('pdf-toolkit:signatures');
      const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
      const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Sign') && !btn.textContent.includes('Download'));
      
      await act(async () => {
        sigBtn.click();
      });

      // Switch to Type mode
      const tabBtns = container.querySelectorAll('[data-editor-dialog-tab]');
      await act(async () => {
        tabBtns[1].click(); // Type tab
      });

      // The Caveat font should be active by default
      const fontBtns = Array.from(container.querySelectorAll('[data-editor-signature-font]'));
      const caveatBtn = fontBtns.find(btn => btn.textContent === 'Caveat');
      expect(caveatBtn.hasAttribute('data-editor-active')).toBe(true);

      // Select Pacifico
      const pacificoBtn = fontBtns.find(btn => btn.textContent === 'Pacifico');
      await act(async () => {
        pacificoBtn.click();
      });

      // Pacifico should now be active, Caveat should not
      expect(pacificoBtn.hasAttribute('data-editor-active')).toBe(true);
      expect(caveatBtn.hasAttribute('data-editor-active')).toBe(false);

      // Save button should be disabled initially
      const saveSigBtn = container.querySelector('button[data-editor-signature-save]');
      expect(saveSigBtn.disabled).toBe(true);

      // Type a name
      const typeInput = container.querySelector('[data-editor-signature-input]');
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
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Select the saved signature from the dropdown, arming `activeSignature`.
    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const sigBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Sign') && !btn.textContent.includes('Download'));
    await act(async () => { sigBtn.click(); });
    const dropdownItem = document.body.querySelector('[data-editor-signature-item]');
    await act(async () => { dropdownItem.click(); });

    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    const wrapper = container.querySelector(`.${workspaceStyles['page-wrapper']}`);
    overlay.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => {}
    });
    wrapper.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 600, height: 900, right: 600, bottom: 900, x: 0, y: 0, toJSON: () => {}
    });

    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('click', { clientX: 120, clientY: 160, bubbles: true }));
    });

    const placed = container.querySelector('[data-editor-element]');
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
      setInputFiles(input, [file]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const toolbarButtons = container.querySelectorAll(`.${toolbarStyles.button}`);
    const whiteoutBtn = Array.from(toolbarButtons).find(btn => btn.textContent.includes('Whiteout'));
    await act(async () => { whiteoutBtn.click(); });

    const overlay = container.querySelector(`.${workspaceStyles['page-overlay']}`);
    overlay.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => {}
    });

    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 400 })); // dx=100 dy=300
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const box = container.querySelector('[data-editor-element]');
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
