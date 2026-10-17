// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import * as pdfjsMock from 'pdfjs-dist';
import PdfToImageTool from './PdfToImageTool.tsx';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import styles from './PdfToImageTool.module.css';
import { mockNativeFileShare } from '../../test/mockFileShare.js';
import { setInputFiles } from '../../test/setInputFiles.js';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';
import { parsePageSelector } from '../../lib/pageSelector.js';
import { hebrewShellMessages, hebrewToImageMessages } from '../../i18n/toolMessages';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

const { mockState } = vi.hoisted(() => ({ mockState: { numPages: 1 } }));

// Counts every conversion and lets a test swap in a slow or failing one. The
// default builds one fake blob per selected page (or one for a tall image),
// sized by scale so a different setting is a different result.
const { convertCalls, convertOverride } = vi.hoisted(() => ({
  convertCalls: { n: 0, last: null as any },
  convertOverride: { fn: null as any },
}));
vi.mock('./toImage.js', () => ({
  convertPdfToImages: (...args: any[]) => {
    convertCalls.n += 1;
    convertCalls.last = args[1];
    return (convertOverride.fn ?? defaultConvert)(...args);
  },
}));


async function defaultConvert(file: File, opts: any) {
  const numbers = parsePageSelector(opts.pages, mockState.numPages);
  const ext = opts.format === 'image/jpeg' ? 'jpg' : 'png';
  const bytes = 'x'.repeat(1000 * opts.scale);
  if (opts.layout === 'concatenated' && numbers.length > 1) {
    return [{ pageNumber: numbers[0], blob: new Blob([bytes], { type: opts.format }), filename: `report.${ext}` }];
  }
  return numbers.map((n: number) => ({
    pageNumber: n,
    blob: new Blob([bytes], { type: opts.format }),
    filename: numbers.length === 1 ? `report.${ext}` : `report-page-${n}.${ext}`,
  }));
}

// Mock pdfjs-dist so we never spin up a real worker or canvas renderer in jsdom.
vi.mock('pdfjs-dist', () => {
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    // thumbnails.js shares one worker when the library has the class; the mock has none.
    PDFWorker: undefined,
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        get numPages() {
          return mockState.numPages;
        },
        getPage: vi.fn(() =>
          Promise.resolve({
            getViewport: () => ({ width: 612, height: 792 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        ),
      }),
      destroy: vi.fn(() => Promise.resolve()),
    })),
  };
});


const { lifecycle } = vi.hoisted(() => ({ lifecycle: vi.fn() }));
vi.mock('../../lib/productAnalytics.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  reportToolLifecycleEvent: lifecycle,
}));

const { takeHandoffMock } = vi.hoisted(() => ({ takeHandoffMock: vi.fn(() => Promise.resolve(null)) }));

// SITE-42: the home page hands picked files over through the draft store's hand-off slot.
vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  takeHandoff: takeHandoffMock,
}));

describe('PdfToImageTool', () => {
  let container;
  const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const tiles = () => Array.from(container.querySelectorAll(`.${styles.tile}`));
  const primary = () => container.querySelector(`.${styles.primary}`);
  const field = () => container.querySelector('#page-selector-input');
  const radio = (label) =>
    Array.from(container.querySelectorAll('[role="radio"]')).find((b) => b.textContent.trim() === label);
  const type = (value) =>
    act(async () => {
      field().value = value;
      field().dispatchEvent(new Event('input', { bubbles: true }));
    });

  async function open(pages = 5, props = {}) {
    mockState.numPages = pages;
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfToImageTool {...props} />, container));
    await act(async () => {
      setInputFiles(container.querySelector('input[type="file"]'), [makePdfFile('report.pdf')]);
    });
    await advance(100);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    resetActionTrailForTests();
    convertCalls.n = 0;
    lifecycle.mockClear();
    convertOverride.fn = null;
    // jsdom has no canvas backend: thumbnails.js needs a context and a data URL.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      return { fillStyle: '', fillRect: vi.fn(), canvas: this } as any;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==');
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:img-${++n}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    mockState.numPages = 1;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the initial file dropper zone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfToImageTool />, container));
    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('shows a tile per page and no Convert button', async () => {
    await open(5);
    expect(tiles().length).toBe(5);
    expect(tiles()[1].textContent).toContain('Page 2');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent.includes('Convert'))).toBe(false);
    expect(primary().textContent).toContain('Download 5 PNGs');
    expect(field().value).toBe('1-5');
  });

  it('does not convert before 1500ms of quiet, then converts once', async () => {
    await open(5);
    await advance(1400);
    expect(convertCalls.n).toBe(0);
    expect(primary().getAttribute('aria-busy')).toBeNull();
    await advance(200);
    expect(convertCalls.n).toBe(1);
    expect(convertCalls.last.pages).toBe('1-5');
    expect(primary().getAttribute('data-state')).toBe('ready');
    await advance(5000);
    expect(convertCalls.n).toBe(1);
  });

  it('keeps the ready look with the counts it knows, and the size joins when the build lands', async () => {
    await open(5);
    expect(primary().getAttribute('data-state')).toBe('ready');
    expect(primary().textContent).not.toMatch(/KB|MB|bytes/);
    await advance(1700);
    expect(primary().textContent).toContain('Download 5 PNGs');
    expect(primary().textContent).toMatch(/\d(\.\d)? KB/);
  });

  it('leaves a tile out on click, and the Pages field reads "1, 3-5"', async () => {
    await open(5);
    await act(async () => tiles()[1].click());
    expect(tiles()[1].getAttribute('aria-checked')).toBe('false');
    expect(tiles()[1].classList.contains(styles['is-out'])).toBe(true);
    expect(field().value).toBe('1, 3-5');
    expect(primary().textContent).toContain('Download 4 PNGs');
    await act(async () => tiles()[1].click());
    expect(field().value).toBe('1-5');
  });

  it('dims the other tiles when "2-3" is typed in Pages', async () => {
    await open(5);
    await type('2-3');
    expect(tiles().map((t) => t.getAttribute('aria-checked'))).toEqual(['false', 'true', 'true', 'false', 'false']);
    expect(tiles()[0].classList.contains(styles['is-out'])).toBe(true);
    expect(tiles()[1].classList.contains(styles['is-out'])).toBe(false);
    await advance(2100);
    expect(convertCalls.last.pages).toBe('2-3');
  });

  it('reruns after quiet on a format change, and a built format comes back from the cache instantly', async () => {
    await open(5);
    await advance(4000);
    expect(convertCalls.n).toBe(1);
    await act(async () => radio('JPG').click());
    expect(primary().textContent).toContain('Download 5 JPGs');
    await advance(1400);
    expect(convertCalls.n).toBe(1);
    await advance(200);
    expect(convertCalls.n).toBe(2);
    expect(convertCalls.last.format).toBe('image/jpeg');
    await advance(4000);
    await act(async () => radio('PNG').click());
    expect(primary().textContent).toContain('Download 5 PNGs');
    expect(primary().textContent).toMatch(/\d(\.\d)? KB/);
    await advance(6000);
    expect(convertCalls.n).toBe(2);
  });

  it('gives each option row radiogroup semantics and describes only the selected option', async () => {
    await open(2);
    const groups = container.querySelectorAll('[role="radiogroup"]');
    expect(groups.length).toBe(3);
    expect(radio('PNG').getAttribute('aria-checked')).toBe('true');
    expect(radio('High').getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('~144 DPI');
    expect(container.textContent).not.toContain('~72 DPI');
    await act(async () => radio('Standard').click());
    expect(container.textContent).toContain('~72 DPI');
    expect(container.textContent).not.toContain('~144 DPI');
    expect(container.querySelector(`.${styles['info-icon']}`)).toBeNull();
  });

  it('never auto-builds above 30 pages, and pointerdown on Download builds', async () => {
    await open(31);
    expect(tiles().length).toBe(31);
    await advance(10000);
    expect(convertCalls.n).toBe(0);
    expect(primary().getAttribute('data-state')).toBe('ready');
    await act(async () => { primary().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(convertCalls.n).toBe(1);
    await advance(50);
    expect(primary().textContent).toMatch(/KB|MB/);
  });

  it('still auto-builds at exactly 30 pages', async () => {
    await open(30);
    await advance(1700);
    expect(convertCalls.n).toBe(1);
  });

  it('shows converting after a tap before the build is done, and delivers when it lands', async () => {
    let finish;
    convertOverride.fn = (file, opts) => new Promise((resolve) => { finish = async () => resolve(await defaultConvert(file, opts)); });
    await open(1);
    await advance(1700);
    expect(convertCalls.n).toBe(1);
    expect(primary().getAttribute('data-state')).toBe('ready');
    await act(async () => primary().click());
    expect(primary().getAttribute('data-state')).toBe('preparing');
    expect(primary().textContent).toContain('Converting');
    await act(async () => { finish(); await vi.advanceTimersByTimeAsync(50); });
    expect(primary().getAttribute('data-state')).toBe('saved');
    expect(recentActions()).toContain('download');
  });

  it('opens "Page 2 of 5" in the preview without changing inclusion, and its toggle leaves the page out', async () => {
    await open(5);
    // The dialog is a lazy chunk: its import needs real time, not fake timers.
    vi.useRealTimers();
    await act(async () => tiles()[1].querySelector(`.${styles['preview-btn']}`).click());
    const find = () => container.querySelector('dialog:has(#page-preview-title)');
    for (let i = 0; i < 20 && !find(); i += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
    const dialog = find();
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Page 2 of 5');
    expect(tiles()[1].getAttribute('aria-checked')).toBe('true');
    const leaveOut = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Leave out');
    await act(async () => leaveOut.click());
    expect(tiles()[1].getAttribute('aria-checked')).toBe('false');
    expect(Array.from(dialog.querySelectorAll('button')).some((b) => b.textContent === 'Bring back')).toBe(true);
  });

  it('puts a download icon on each tile only once built, and one Download PNG link for a single page', async () => {
    await open(3);
    expect(container.querySelectorAll(`.${styles['tile-download']}`).length).toBe(0);
    await advance(1700);
    const icons = Array.from(container.querySelectorAll(`.${styles['tile-download']}`));
    expect(icons.map((a) => a.getAttribute('aria-label'))).toEqual(['Download page 1', 'Download page 2', 'Download page 3']);
    expect(icons[1].getAttribute('download')).toBe('report-page-2.png');
    expect(icons[1].getAttribute('href')).toMatch(/^blob:/);
    expect(container.querySelector('ul')).toBeNull();

    act(() => render(null, container));
    container.remove();
    container = null;
    await open(1);
    await advance(1700);
    const link = primary();
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('download')).toBe('report.png');
    expect(link.getAttribute('href')).toMatch(/^blob:/);
    expect(link.textContent).toMatch(/^Download PNG/);
  });

  it('shows the tall layout as one column with one caption', async () => {
    await open(3);
    await act(async () => radio('One tall image').click());
    expect(container.textContent).toContain('One image, 3 pages');
    expect(container.querySelector(`.${styles['tall-column']}`)).not.toBeNull();
    await advance(2100);
    expect(convertCalls.last.layout).toBe('concatenated');
    expect(primary().textContent).toContain('Download PNG');
    expect(primary().getAttribute('download')).toBe('report.png');
  });

  it('shows a validation error for an out-of-range page selector, and keeps the selection', async () => {
    await open(5);
    await type('99');
    expect(container.querySelector(`.${pdfToolStyles['page-selector-error']}`).textContent).toContain('99');
    expect(tiles().every((t) => t.getAttribute('aria-checked') === 'true')).toBe(true);
  });

  it('drops a conversion whose file was replaced while it ran', async () => {
    let finish;
    convertOverride.fn = (file, opts) => new Promise((resolve) => { finish = async () => resolve(await defaultConvert(file, opts)); });
    await open(2);
    await advance(1700);
    expect(convertCalls.n).toBe(1);
    const first = finish;
    await act(async () => {
      setInputFiles(container.querySelector('input[type="file"]'), [makePdfFile('second.pdf')]);
    });
    // Replacing a loaded file is confirmed first (MEM-03, BasePdfTool).
    const confirmReplace = Array.from(container.querySelectorAll('dialog button'))
      .find((b) => b.textContent.trim() === 'Replace file');
    await act(async () => confirmReplace.click());
    await advance(100);
    await act(async () => { first(); await vi.advanceTimersByTimeAsync(50); });
    expect(container.textContent).toContain('second.pdf');
    expect(container.querySelector(`.${styles['tile-download']}`)).toBeNull();
    expect(container.querySelector(`.${pdfToolStyles['pdf-share-button']}`)).toBeNull();
  });

  it('counts the operation on the Download tap, not on the build', async () => {
    await open(1);
    await act(async () => radio('JPG').click());
    await advance(1700);
    expect(recentActions()).toEqual(['add_files', 'change_setting']);
    await act(async () => primary().click());
    expect(recentActions()).toEqual(['add_files', 'change_setting', 'download']);
  });

  it('offers Share once built', async () => {
    const nativeShare = mockNativeFileShare();
    await open(1);
    await advance(1700);
    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('report.png');
    nativeShare.restore();
  });

  it('revokes every image URL on unmount', async () => {
    await open(2);
    await advance(1700);
    const created = URL.createObjectURL.mock.results.map((r) => r.value);
    expect(created.length).toBeGreaterThanOrEqual(2);
    URL.revokeObjectURL.mockClear();
    act(() => render(null, container));
    const revoked = URL.revokeObjectURL.mock.calls.map((c) => c[0]);
    for (const url of created) expect(revoked).toContain(url);
  });

  it('reports a failed conversion and offers no download', async () => {
    convertOverride.fn = async () => { throw new Error('boom'); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await open(2);
    await advance(1700);
    expect(container.textContent).toContain('Could not make the images. Tap to try again.');
    expect(container.textContent).not.toContain('damaged or password-protected');
    expect(primary().getAttribute('data-state')).toBe('error');
  });

  it('retries a failed build on a tap on the primary, showing preparing and then the result', async () => {
    let fail = true;
    convertOverride.fn = async (file, opts) => {
      if (fail) throw new Error('boom');
      return defaultConvert(file, opts);
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await open(2);
    await advance(1700);
    expect(primary().getAttribute('data-state')).toBe('error');
    fail = false;
    let finish;
    convertOverride.fn = (file, opts) => new Promise((resolve) => { finish = async () => resolve(await defaultConvert(file, opts)); });
    await act(async () => primary().click());
    expect(primary().getAttribute('data-state')).toBe('preparing');
    expect(container.textContent).not.toContain('Tap to try again');
    expect(convertCalls.n).toBe(2);
    await act(async () => { finish(); await vi.advanceTimersByTimeAsync(50); });
    expect(primary().getAttribute('data-state')).toBe('saved');
  });

  it('shows the load error when the PDF cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = pdfjsMock.getDocument.getMockImplementation();
    pdfjsMock.getDocument.mockImplementation(() => ({
      promise: Promise.reject(new Error('bad pdf')),
      destroy: vi.fn(() => Promise.resolve()),
    }));
    try {
      await open(3);
      await advance(100);
    } finally {
      pdfjsMock.getDocument.mockImplementation(original);
    }
    expect(container.textContent).toContain('damaged or password-protected');
    expect(primary().getAttribute('data-state')).toBe('error');
  });

  it('a Download tap after a no-op selector edit still lands the images', async () => {
    await open(5);
    await advance(1700);
    expect(primary().textContent).toMatch(/KB/);
    await type('1-5,');
    await type('1-5');
    await act(async () => primary().click());
    await advance(100);
    expect(primary().getAttribute('data-state')).toBe('saved');
    expect(primary().textContent).toMatch(/KB/);
  });

  it('keeps the built images when the typed selection parses to the same pages', async () => {
    await open(5);
    await advance(1700);
    URL.revokeObjectURL.mockClear();
    await type('1,2,3,4,5');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(primary().textContent).toMatch(/KB/);
  });

  it('does not reset the build progress when the primary is tapped mid-build', async () => {
    let report;
    convertOverride.fn = (file, opts) => new Promise((resolve) => {
      report = opts.onProgress;
      void resolve;
    });
    await open(3);
    await advance(1700);
    await act(async () => { report(0.6); });
    await act(async () => primary().click());
    expect(primary().textContent).toContain('60%');
  });

  it('counts a per-tile download like a Download tap', async () => {
    await open(3);
    await advance(1700);
    const link = container.querySelector(`.${styles['tile-download']}`);
    link.addEventListener('click', (e) => e.preventDefault());
    await act(async () => link.click());
    expect(recentActions()).toContain('download');
    const events = lifecycle.mock.calls.map((c) => c[0]);
    expect(events).toContain('tool_operation_started');
    expect(events).toContain('tool_result_ready');
  });

  it('hides the Pages field and the leave-out hint for a single-page PDF', async () => {
    await open(1);
    expect(field()).toBeNull();
    expect(container.querySelector(`.${styles['result-hint']}`)).toBeNull();
    expect(container.querySelector(`.${styles.grid}`).getAttribute('data-single')).toBe('true');
  });

  it('words the hint for taps and clicks alike', async () => {
    await open(3);
    expect(container.textContent).toContain('Select a page to leave it out.');
    expect(container.textContent).not.toContain('Click a page');
  });

  it('loads a PDF handed off from the home page as if picked', async () => {
    takeHandoffMock.mockResolvedValueOnce({
      fileName: 'handed.pdf',
      fileType: 'application/pdf',
      fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfToImageTool />, container));
    await advance(50);
    expect(takeHandoffMock).toHaveBeenCalledWith('pdf-to-image');
    expect(container.textContent).toContain('handed.pdf');
  });

  // LOC: /he/pdf-to-image/ passes the Hebrew catalogue; nothing the island
  // renders stays English, and the page-range field keeps digits readable.
  it('renders Hebrew controls, results and page-range errors from the messages prop', async () => {
    await open(2, { messages: hebrewToImageMessages, shellMessages: hebrewShellMessages });
    await advance(1700);
    const text = container.textContent;
    for (const word of ['פורמט', 'איכות', 'רגילה', 'גבוהה', 'מקסימלית', 'תמונה לכל עמוד', 'עמודים']) {
      expect(text).toContain(word);
    }
    for (const english of ['Format', 'Quality', 'Standard', 'Maximum', 'One image per page', 'Pages', 'Download']) {
      expect(text).not.toContain(english);
    }
    const selector = field();
    expect(selector.getAttribute('dir')).toBe('ltr');
    expect(selector.classList.contains(styles['page-selector-rtl'])).toBe(true);
    expect(selector.getAttribute('placeholder')).toBe(hebrewToImageMessages.pageSelectorPlaceholder);
    // The size must not flip to "KB 8" in an RTL page: isolated as one LTR run.
    expect(primary().textContent).toMatch(/⁦[^⁩]*B⁩/);
    await type('9');
    expect(container.querySelector(`.${pdfToolStyles['page-selector-error']}`).textContent).toBe('עמוד 9 מחוץ לטווח (1-2)');
  });
});
