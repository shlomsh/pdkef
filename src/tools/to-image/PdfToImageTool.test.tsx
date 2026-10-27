// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfToImageTool from './PdfToImageTool.tsx';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import toolShellStyles from '../../shell/ToolShell.module.css';
import { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { recentActions } from '../../lib/actionTrail.ts';
import { saveHandoff } from '../../lib/drafts/draftStore.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
// The same object as harness.pdfjs.source: the conversion fake below sits outside any test and reads the page count.
import { pdfjsEdges } from '../../test/harness/pdfjsEdges.ts';
import { parsePageSelector } from '../../lib/pageSelector.js';
import { hebrewToImageMessages } from './messages';
import { hebrewShellMessages } from '../../shell/shellMessages';

// The pdf.js edge (the encryption probe, the thumbnail source with its page count) is the harness's:
// harness.pdfjs. Everything else (analytics, error reports, draftStore, action trail) runs for real over it.

// EDGE: the conversion renders every page through pdf.js onto a canvas, neither of which jsdom has.
// Counts every conversion and lets a test swap in a slow or failing one. The default makes one fake
// blob per included page (or one for a tall image), sized by scale so a different setting is a different result.
const { convertCalls, convertOverride } = vi.hoisted(() => ({
  convertCalls: { n: 0, last: null as any },
  convertOverride: { fn: null as any },
}));
vi.mock('./lib/toImage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  convertPdfToImages: (...args: any[]) => {
    convertCalls.n += 1;
    convertCalls.last = args[1];
    return (convertOverride.fn ?? defaultConvert)(...args);
  },
}));

async function defaultConvert(file: File, opts: any) {
  const numbers = parsePageSelector(opts.pages, pdfjsEdges.source.pageCount);
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

// Tests that are not about timing build after 5ms instead of the real 1500ms.
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const SLOW_QUIET = { baseMs: 400, stepMs: 0, maxMs: 400, burstWindowMs: 1 };
const wait = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const makePdfFile = (name = 'report.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

describe('PdfToImageTool', () => {
  let container;
  let harness: ToolHarness;

  beforeEach(() => {
    harness = installToolHarness();
    convertCalls.n = 0;
    convertOverride.fn = null;
    harness.pdfjs.source.pageCount = 5;
    // jsdom's Blob has no arrayBuffer().
    if (!Blob.prototype.arrayBuffer) {
      Blob.prototype.arrayBuffer = function arrayBuffer() {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      };
    }
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    harness.restore();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    // jsdom cannot follow a download link.
    container.addEventListener('click', (e) => { if (e.target.closest?.('a[download]')) e.preventDefault(); });
    act(() => render(<PdfToImageTool quietPolicy={FAST_QUIET} {...props} />, container));
  }
  const pick = async (file) => {
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [file]); });
    await wait(50);
    await harness.flush();
  };
  const replaceWith = async (file) => {
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [file]); });
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    await act(async () => Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file').click());
    const stem = file.name.replace(/\.pdf$/, '');
    await until(() => heading()?.textContent.includes(stem) && downloadElement()?.getAttribute('data-state') !== 'preparing');
  };
  // Mounts, picks a file and waits for the quiet build.
  async function open(pages = 5, props = {}) {
    harness.pdfjs.source.pageCount = pages;
    mount(props);
    await pick(makePdfFile());
    // A slow quiet policy and a long document do not build on their own; otherwise wait for the result or the failure.
    const buildsAlone = !props.quietPolicy && pages <= 30;
    await until(() => cells().length > 0 && downloadElement()
      && (!buildsAlone || (convertOverride.fn ? convertCalls.n > 0 : /\d(\.\d)? ?(KB|MB)|B⁩/.test(downloadElement().textContent) || downloadElement().getAttribute('data-state') === 'error')));
    await harness.flush();
  }

  const rail = () => container.querySelector(`.${workspaceStyles.rail}`);
  const cells = () => Array.from(container.querySelectorAll('ul[data-page-grid] > li[data-key]'));
  const button = (label) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
  const heading = () => container.querySelector('#page-grid-heading');
  const field = () => container.querySelector('#page-selector-input');
  const downloadElement = () => container.querySelector('a[data-state]');
  const saveLinks = () => Array.from(container.querySelectorAll('ul[data-page-grid] a[download]'));
  const skipButton = (n) => cells()[n - 1].querySelector('[aria-label^="Skip page"], [aria-label^="Include page"]');
  const isSkipped = (n) => skipButton(n).getAttribute('aria-label').startsWith('Include');
  const click = async (el) => {
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await harness.flush();
  };
  const radio = (label) => Array.from(rail().querySelectorAll('[role="radio"]')).find((r) => r.textContent === label);
  const type = async (value) => {
    await act(async () => {
      field().value = value;
      field().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await harness.flush();
  };
  const undo = () => click(container.querySelector('[aria-label="Undo last change"]'));
  const events = (name) => harness.usageEvents(name).length;

  it('renders the initial file dropper zone', () => {
    mount();
    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('loads the file into the shared grid under a heading that names the images, and lets go of the document', async () => {
    await open();
    expect(cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4']);
    expect(heading().textContent).toContain('report-page-N.png');
    expect(heading().textContent).toContain('5 images');
    expect(container.querySelector(`.${toolShellStyles.identity}`)).toBeNull();
    expect(field().value).toBe('1-5');
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(downloadElement().textContent).toContain('Download 5 PNGs');
    expect(convertCalls.last.pages).toBe('1-5');
    // The tool's own document is let go; the grid keeps the one it read the page sizes from until it unmounts.
    expect(harness.pdfjs.source.opened - harness.pdfjs.source.destroyed).toBe(1);
    expect(button('Convert')).toBeUndefined();
  });

  // UX guideline 20: what the images are, then which pages, then Download, Replace file last.
  it('runs the rail in order of consequence, with Replace file last and no hand-offs', async () => {
    await open();
    const order = Array.from(rail().querySelectorAll('[role="radiogroup"], input, button, a[data-state]'))
      .filter((el) => !el.closest('[role="radiogroup"]') || el.getAttribute('role') === 'radiogroup')
      .map((el) => (el.hasAttribute('data-state') ? 'download' : el.getAttribute('role') || el.id || el.textContent.trim()));
    expect(order).toEqual(['radiogroup', 'radiogroup', 'radiogroup', 'page-selector-input', 'Include all', 'Skip all', 'Invert', 'download', 'Replace file']);
    expect(button('Compress')).toBeUndefined();
    expect(button('Sign')).toBeUndefined();
  });

  it('offers Replace file once, as the shared quiet last line, at every width', async () => {
    await open();
    const replaces = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim().startsWith('Replace'));
    expect(replaces).toHaveLength(1);
    expect(replaces[0].closest('[data-replace-line]')).not.toBeNull();
  });

  it('does not convert before the quiet wait, then converts once', async () => {
    await open(5, { quietPolicy: SLOW_QUIET });
    await wait(150);
    expect(convertCalls.n).toBe(0);
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(downloadElement().getAttribute('aria-busy')).toBeNull();
    await until(() => convertCalls.n === 1);
    expect(convertCalls.n).toBe(1);
    await wait(600);
    expect(convertCalls.n).toBe(1);
  });

  it('keeps the ready look with no size, and the size joins when the build lands', async () => {
    await open(5, { quietPolicy: SLOW_QUIET });
    expect(downloadElement().textContent).not.toMatch(/KB|MB|bytes/);
    await until(() => /\d(\.\d)? KB/.test(downloadElement().textContent));
    expect(downloadElement().textContent).toMatch(/\d(\.\d)? KB/);
  });

  it('gives each option row radiogroup semantics and describes only the selected option', async () => {
    await open(2);
    expect(rail().querySelectorAll('[role="radiogroup"]').length).toBe(3);
    expect(radio('PNG').getAttribute('aria-checked')).toBe('true');
    expect(radio('High').getAttribute('aria-checked')).toBe('true');
    expect(rail().textContent).toContain('~144 DPI');
    expect(rail().textContent).not.toContain('~72 DPI');
    await click(radio('Standard'));
    expect(rail().textContent).toContain('~72 DPI');
    expect(rail().textContent).not.toContain('~144 DPI');
  });

  it('a skipped tile stays in place, the range follows, and the heading counts it', async () => {
    await open();
    await click(skipButton(2));
    expect(cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4']);
    expect(isSkipped(2)).toBe(true);
    expect(field().value).toBe('1, 3-5');
    expect(heading().textContent).toContain('4 images');
    expect(heading().textContent).toContain('1 page skipped');
    await until(() => downloadElement().textContent.includes('Download 4 PNGs'));
    expect(downloadElement().textContent).toContain('Download 4 PNGs');
    await click(skipButton(2));
    expect(field().value).toBe('1-5');
  });

  it('typing a range skips the other pages, as one Undo step, and builds those pages', async () => {
    await open();
    await type('2-3');
    expect([1, 2, 3, 4, 5].map(isSkipped)).toEqual([true, false, false, true, true]);
    await until(() => convertCalls.last?.pages === '2-3');
    expect(convertCalls.last.pages).toBe('2-3');
    await undo();
    expect(field().value).toBe('1-5');
    expect(recentActions()).toEqual(['add_files', 'select_pages', 'undo']);
  });

  it('keeps the selection and shows the error for an out-of-range page', async () => {
    await open();
    await click(skipButton(1));
    await type('99');
    expect(container.querySelector('[role="alert"]').textContent).toContain('99');
    expect(isSkipped(1)).toBe(true);
    expect(isSkipped(2)).toBe(false);
  });

  it('Include all, Skip all and Invert are one step each, and none when nothing changes', async () => {
    await open();
    await click(button('Include all'));
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(true);
    await click(button('Skip all'));
    expect(downloadElement().getAttribute('data-state')).toBe('nothing');
    await click(button('Invert'));
    expect(field().value).toBe('1-5');
    await undo();
    expect(downloadElement().getAttribute('data-state')).toBe('nothing');
  });

  it('rotating a page is a step and reaches the build as a rotation of that page number', async () => {
    await open();
    await click(container.querySelector('[aria-label="Rotate page 2"]'));
    await until(() => convertCalls.last?.rotations?.[2] === 90);
    expect(convertCalls.last.rotations).toEqual({ 2: 90 });
    expect(recentActions()).toEqual(['add_files', 'rotate']);
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(false);
  });

  it('rebuilds on a format change, and a built format comes back from the cache', async () => {
    await open();
    expect(convertCalls.n).toBe(1);
    await click(radio('JPG'));
    expect(downloadElement().textContent).toContain('Download 5 JPGs');
    await until(() => convertCalls.n === 2);
    expect(convertCalls.n).toBe(2);
    expect(convertCalls.last.format).toBe('image/jpeg');
    await click(radio('PNG'));
    expect(downloadElement().textContent).toContain('Download 5 PNGs');
    expect(downloadElement().textContent).toMatch(/\d(\.\d)? KB/);
    await wait(150);
    expect(convertCalls.n).toBe(2);
    expect(harness.usageEvents('tool_first_edit').map((event) => event.properties.tool)).toEqual(['pdf-to-image']);
  });

  it('never auto-builds above 30 pages, says it is made on tap, and builds when Download is approached', async () => {
    await open(31);
    await wait(200);
    expect(convertCalls.n).toBe(0);
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(downloadElement().textContent).toContain('Made when you tap');
    await act(async () => { downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await until(() => convertCalls.n === 1 && /KB|MB/.test(downloadElement().textContent));
    expect(convertCalls.n).toBe(1);
    expect(downloadElement().textContent).toMatch(/KB|MB/);
    expect(downloadElement().textContent).not.toContain('Made when you tap');
  });

  it('builds on its own at exactly 30 pages', async () => {
    await open(30);
    expect(convertCalls.n).toBe(1);
    expect(downloadElement().textContent).not.toContain('Made when you tap');
  });

  it('a tap that beats the build shows preparing and delivers when it lands', async () => {
    let finish;
    convertOverride.fn = (file, opts) => new Promise((resolve) => { finish = async () => resolve(await defaultConvert(file, opts)); });
    await open(1);
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    await click(downloadElement());
    expect(downloadElement().getAttribute('data-state')).toBe('preparing');
    expect(events('tool_operation_started')).toBe(1);
    await act(async () => { finish(); });
    await until(() => downloadElement().getAttribute('data-state') === 'saved');
    expect(downloadElement().getAttribute('data-state')).toBe('saved');
    expect(events('tool_result_ready')).toBe(1);
  });

  it('reports no start for the background build, only for the Download tap', async () => {
    await open();
    expect(events('tool_operation_started')).toBe(0);
    await click(downloadElement());
    await until(() => events('tool_result_ready') === 1);
    expect(events('tool_operation_started')).toBe(1);
    expect(events('tool_result_ready')).toBe(1);
  });

  describe('saving one page', () => {
    it('appears on each included page only once the images are built, and is not there for a skipped page', async () => {
      harness.pdfjs.source.pageCount = 3;
      mount({ quietPolicy: SLOW_QUIET });
      await pick(makePdfFile());
      expect(saveLinks()).toHaveLength(0);
      await until(() => saveLinks().length === 3);
      expect(saveLinks().map((a) => a.getAttribute('aria-label'))).toEqual(['Download page 1', 'Download page 2', 'Download page 3']);
      expect(saveLinks().map((a) => a.getAttribute('download'))).toEqual(['report-page-1.png', 'report-page-2.png', 'report-page-3.png']);
      expect(saveLinks()[1].getAttribute('href')).toMatch(/^blob:/);
      await click(skipButton(2));
      expect(saveLinks()).toHaveLength(0);
      await until(() => saveLinks().length === 2);
      expect(saveLinks().map((a) => a.getAttribute('download'))).toEqual(['report-page-1.png', 'report-page-3.png']);
      expect(saveLinks().map((a) => a.getAttribute('aria-label'))).toEqual(['Download page 1', 'Download page 2']);
    });

    it('counts as a Download tap without turning the Download element to Saved', async () => {
      await open(3);
      await click(saveLinks()[0]);
      expect(recentActions()).toContain('download');
      expect(events('tool_operation_started')).toBe(1);
      expect(downloadElement().getAttribute('data-state')).toBe('ready');
    });

    it('is not offered for the tall image or for a single image', async () => {
      await open(3);
      await click(radio('One tall image'));
      await until(() => convertCalls.last?.layout === 'concatenated' && /KB/.test(downloadElement().textContent));
      expect(saveLinks()).toHaveLength(0);
      act(() => render(null, container));
      container.remove();
      container = null;
      await open(1);
      expect(saveLinks()).toHaveLength(0);
    });
  });

  it('a one-page PDF has one Download link and neither the range field nor the bulk row', async () => {
    await open(1);
    expect(field()).toBeNull();
    expect(button('Include all')).toBeUndefined();
    const link = downloadElement();
    expect(link.getAttribute('download')).toBe('report.png');
    expect(link.getAttribute('href')).toMatch(/^blob:/);
    expect(link.textContent).toContain('Download PNG');
    expect(heading().textContent).toContain('report.png');
    expect(heading().textContent).toContain('1 image');
  });

  it('One tall image names one file, builds the stacked layout, and counts one image', async () => {
    await open(3);
    await click(radio('One tall image'));
    await until(() => convertCalls.last?.layout === 'concatenated' && downloadElement().getAttribute('download') === 'report.png');
    expect(convertCalls.last.layout).toBe('concatenated');
    expect(heading().textContent).toContain('report.png');
    expect(heading().textContent).toContain('1 image');
    expect(downloadElement().textContent).toContain('Download PNG');
    expect(downloadElement().getAttribute('download')).toBe('report.png');
  });

  it('Download in one-per-page output saves every image, once each', async () => {
    await open(3);
    const saved = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function save() { if (this.download) saved.push(this.download); });
    await click(downloadElement());
    await until(() => saved.length === 3 && downloadElement().getAttribute('data-state') === 'saved');
    expect(saved).toEqual(['report-page-1.png', 'report-page-2.png', 'report-page-3.png']);
    expect(downloadElement().getAttribute('data-state')).toBe('saved');
    expect(downloadElement().textContent).toContain('Saved 3 PNGs');
  });

  it('shares every image as a native file once built', async () => {
    const nativeShare = mockNativeFileShare();
    await open(3);
    await click(button('Share'));
    const files = nativeShare.share.mock.calls[0][0].files;
    expect(files.map((f) => f.name)).toEqual(['report-page-1.png', 'report-page-2.png', 'report-page-3.png']);
    expect(files.every((f) => f.type === 'image/png')).toBe(true);
    nativeShare.restore();
  });

  it('a replaced file keeps the format, quality and output, and starts a fresh plan and history', async () => {
    await open();
    await click(radio('JPG'));
    await click(radio('One tall image'));
    await click(skipButton(1));
    await replaceWith(makePdfFile('next.pdf'));
    expect(radio('JPG').getAttribute('aria-checked')).toBe('true');
    expect(radio('One tall image').getAttribute('aria-checked')).toBe('true');
    expect(field().value).toBe('1-5');
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(true);
  });

  it('the done strip names the pattern for several images and the real name for one', async () => {
    const stripName = () => container.querySelector('section[aria-label] p')?.textContent ?? '';
    const original = window.matchMedia;
    window.matchMedia = (query) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await open(3);
    const quiet = () => container.querySelector('[data-quiet-download]');
    await click(quiet());
    await until(() => stripName().includes('report-page-N.png'));
    expect(stripName()).toContain('report-page-N.png');
    await click(radio('One tall image'));
    await until(() => convertCalls.last?.layout === 'concatenated' && /KB/.test(downloadElement().textContent));
    await click(quiet());
    await until(() => stripName().includes('report.png'));
    expect(stripName()).toContain('report.png');
    expect(stripName()).not.toContain('page-N');
    window.matchMedia = original;
  });

  it('drops a conversion whose file was replaced while it ran', async () => {
    let finish;
    convertOverride.fn = (file, opts) => new Promise((resolve) => { finish = async () => resolve(await defaultConvert(file, opts)); });
    await open(2);
    const first = finish;
    convertOverride.fn = null;
    await replaceWith(makePdfFile('second.pdf'));
    await act(async () => { first(); await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(heading().textContent).toContain('second-page-N.png');
    expect(saveLinks().every((a) => a.getAttribute('download').startsWith('report-page'))).toBe(true);
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
  });

  it('a build that fails says so on the Download element, counts as a failed operation, and a tap tries again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    convertOverride.fn = async (file, opts) => {
      if (fail) throw new Error('boom');
      return defaultConvert(file, opts);
    };
    await open(2);
    expect(downloadElement().getAttribute('data-state')).toBe('error');
    expect(downloadElement().textContent).toContain('Could not make the images. Tap to try again.');
    await harness.flush();
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'convert', type: 'Error' }]);
    expect(events('tool_operation_failed')).toBe(1);
    fail = false;
    await act(async () => { downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await until(() => downloadElement().getAttribute('data-state') === 'ready' && /KB/.test(downloadElement().textContent));
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(downloadElement().textContent).toMatch(/KB/);
  });

  it('a document that cannot be read says so, still offers Replace file, and counts as a failed operation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.pdfjs.source.failOpen = true;
    mount();
    await pick(makePdfFile());
    await until(() => container.textContent.includes('The file may be damaged. Try another PDF.'));
    expect(container.textContent).toContain('The file may be damaged. Try another PDF.');
    expect(cells()).toHaveLength(0);
    await click(button('Replace file'));
    expect(container.querySelector('dialog[aria-labelledby="confirm-replace-title"]').open).toBe(true);
    expect(events('tool_operation_failed')).toBe(1);
  });

  it('a password-locked PDF shows NeedsUnlock, never opens in pdf.js or builds, and is not a failed operation', async () => {
    harness.pdfjs.probeAs('needs-password');
    mount();
    await pick(makePdfFile('locked.pdf'));
    await until(() => button('Unlock it'));
    expect(container.textContent).toContain('This PDF has a password');
    expect(container.textContent).toContain('then you can turn it into images');
    expect(button('Unlock it')).toBeDefined();
    expect(harness.pdfjs.source.opened).toBe(0);
    expect(convertCalls.n).toBe(0);
    expect(downloadElement()).toBeNull();
    await harness.flush();
    expect(harness.reports()).toEqual([]);
    expect(events('tool_operation_failed')).toBe(0);
  });

  it('an owner-restricted PDF still renders and converts as it is', async () => {
    harness.pdfjs.probeAs('owner-restricted');
    await open(2);
    expect(container.textContent).not.toContain('This PDF is protected');
    expect(cells()).toHaveLength(2);
    expect(convertCalls.n).toBe(1);
  });

  it('loads a PDF handed off from the home page as if picked', async () => {
    await saveHandoff('pdf-to-image', {
      fileName: 'handed.pdf',
      fileType: 'application/pdf',
      fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
    });
    mount();
    await until(() => heading()?.textContent.includes('handed-page-N.png'));
    // The island collected it: nothing is left parked under its key.
    expect(await harness.takeHandoff('pdf-to-image')).toBeNull();
    expect(heading().textContent).toContain('handed-page-N.png');
  });

  it('revokes every image URL on unmount', async () => {
    // Wraps the harness's recording URL functions to keep the URLs handed out and the URLs given back.
    const created: string[] = [];
    const revoked: string[] = [];
    const recordingCreate = URL.createObjectURL;
    URL.createObjectURL = (blob) => { const url = recordingCreate(blob); created.push(url); return url; };
    URL.revokeObjectURL = (url) => { revoked.push(url); };
    await open(2);
    expect(created.length).toBeGreaterThanOrEqual(2);
    revoked.length = 0;
    act(() => render(null, container));
    for (const url of created) expect(revoked).toContain(url);
  });

  // LOC: /he/pdf-to-image/ passes the Hebrew catalogue; nothing the island renders stays English.
  describe('Hebrew', () => {
    const hebrew = { messages: hebrewToImageMessages, shellMessages: hebrewShellMessages };

    it('renders every control from the messages prop, and keeps the digits and the size readable', async () => {
      await open(2, hebrew);
      const text = container.textContent;
      for (const word of ['פורמט', 'איכות', 'רגילה', 'גבוהה', 'מקסימלית', 'תמונה לכל עמוד', 'עמודים']) {
        expect(text).toContain(word);
      }
      for (const english of ['Format', 'Quality', 'Standard', 'Maximum', 'One image per page', 'Pages', 'Download', 'Include all']) {
        expect(text).not.toContain(english);
      }
      expect(field().getAttribute('dir')).toBe('ltr');
      expect(field().getAttribute('placeholder')).toBe(hebrewToImageMessages.pageSelectorPlaceholder);
      expect(downloadElement().textContent).toMatch(/⁦[^⁩]*B⁩/);
      expect(Array.from(heading().querySelectorAll('bdi[dir="ltr"]')).some((b) => b.textContent === 'report-page-N.png')).toBe(true);
      expect(heading().textContent).toContain('2 תמונות');
      await type('9');
      expect(container.querySelector('[role="alert"]').textContent).toBe('עמוד 9 מחוץ לטווח (1-2)');
    });

    it('counts the images and the saved files with the catalogue\'s own words', async () => {
      await open(3, hebrew);
      expect(downloadElement().textContent).toContain('הורדת 3 קובצי PNG');
      await click(downloadElement());
      await until(() => downloadElement().textContent.includes('נשמרו 3 קובצי PNG'));
      expect(downloadElement().textContent).toContain('נשמרו 3 קובצי PNG');
    });

    it('shows the Hebrew protected-file copy', async () => {
      harness.pdfjs.probeAs('needs-password');
      mount(hebrew);
      await pick(makePdfFile('locked.pdf'));
      await until(() => container.textContent.includes(hebrewToImageMessages.protectedUnlockIt));
      expect(container.textContent).toContain(hebrewToImageMessages.protectedNeedsPasswordTitle);
      expect(container.textContent).toContain(hebrewToImageMessages.protectedUnlockIt);
      expect(container.textContent).not.toContain('This PDF');
    });
  });
});
