// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { drainPromises } from '../../test/support/drainPromises.ts';
import PdfToImageTool from './PdfToImageTool.tsx';
import { convertPdfToImages } from './lib/toImage.js';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { openThumbnailSource } from '#lib/pdf/thumbnails.js';
import needsPasswordUrl from '../../lib/__fixtures__/encrypted/needs-password.pdf?url';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';
import { hebrewToImageMessages } from './messages';
import { hebrewShellMessages } from '#shell/shellMessages.ts';

answerNetwork();

// The conversion runs for real over real pdf.js; the spy counts every conversion and shows the options it got.
// `forceConversion` (below) is the one forced line that holds or fails a build, which a real file cannot do.
vi.mock('./lib/toImage.js', { spy: true });
vi.mock('#lib/pdf/thumbnails.js', { spy: true });
let overridden = false;
const forceConversion = (fn: (file: File, opts: any) => Promise<any>) => {
  overridden = true;
  vi.mocked(convertPdfToImages).mockImplementation(fn as never);
};
const resetConversion = () => {
  overridden = false;
  vi.mocked(convertPdfToImages).mockReset();
};
const lastConversion = () => vi.mocked(convertPdfToImages).mock.lastCall?.[1] as any;
const conversions = () => vi.mocked(convertPdfToImages).mock.calls.length;
const realConvert = async (file: File, opts: any) => (await vi.importActual<typeof import('./lib/toImage.js')>('./lib/toImage.js')).convertPdfToImages(file, opts);

// Tests that are not about timing build after 5ms instead of the real 1500ms.
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const SLOW_QUIET = { baseMs: 400, stepMs: 0, maxMs: 400, burstWindowMs: 1 };
// Lets the promise work already queued reach the component, before an assertion that something did NOT happen.
const drain = () => act(async () => { await drainPromises(); });
async function makePdfFile(name = 'report.pdf', pages = 5) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 300]);
  return new File([await doc.save()], name, { type: 'application/pdf' });
}
const fixtureAt = async (url: string, name: string) => new File([await (await fetch(url)).arrayBuffer()], name, { type: 'application/pdf' });

describe('PdfToImageTool', () => {
  let container;
  let harness: BrowserToolHarness;

  const saved: string[] = [];
  const recordDownload = (event: Event) => {
    const link = (event.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
    if (link) saved.push(link.download);
  };

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    resetConversion();
    vi.mocked(openThumbnailSource).mockReset();
    saved.length = 0;
    document.addEventListener('click', recordDownload, { capture: true });
  });

  afterEach(async () => {
    document.removeEventListener('click', recordDownload, { capture: true });
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    await harness.restore();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfToImageTool quietPolicy={FAST_QUIET} {...props} />, container));
  }
  const pick = async (file) => {
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [file]); });
    await waitUntil(() => container.querySelector('ul[data-page-grid]') || container.querySelector('[role="alert"]') || container.querySelector('[data-needs-unlock]'));
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
  async function open(pages = 5, props = {}, file?: File) {
    mount(props);
    await pick(file ?? await makePdfFile('report.pdf', pages));
    // A slow quiet policy and a long document do not build on their own; otherwise wait for the result or the failure.
    const buildsAlone = !props.quietPolicy && pages <= 30;
    await until(() => cells().length > 0 && downloadElement()
      && (!buildsAlone || (overridden ? conversions() > 0 : /\d(\.\d)? ?(KB|MB)|B⁩/.test(downloadElement().textContent) || downloadElement().getAttribute('data-state') === 'error')));
    await harness.flush();
  }

  const rail = () => container.querySelector('[data-rail]');
  const cells = () => Array.from(container.querySelectorAll('ul[data-page-grid] > li[data-key]'));
  const button = (label) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
  const heading = () => container.querySelector('#page-grid-heading');
  const field = () => container.querySelector('#page-selector-input');
  const downloadElement = () => container.querySelector('a[data-state]');
  const saveLinks = () => Array.from(container.querySelectorAll('ul[data-page-grid] a[download]'));
  const skipButton = (n) => cells()[n - 1].querySelector('[aria-label^="Skip page"], [aria-label^="Include page"]');
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
  const events = async (name) => { await harness.flush(); return harness.usageEvents(name).length; };

  it('loads the file into the shared grid under a heading that names the images, and lets go of the document', async () => {
    await open();
    expect(cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4']);
    expect(heading().textContent).toContain('report-page-N.png');
    expect(heading().textContent).toContain('5 images');
    expect(container.querySelector('[data-file-identity]')).toBeNull();
    expect(field().value).toBe('1-5');
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(downloadElement().textContent).toContain('Download 5 PNGs');
    expect(lastConversion().pages).toBe('1-5');
    // The tool's own document is let go; the grid keeps the one it read the page sizes from until it unmounts.
    const sources = await Promise.all(vi.mocked(openThumbnailSource).mock.results.map((result) => result.value));
    const states = await Promise.all(sources.map((source) => source.render(0).then(() => 'open', () => 'destroyed')));
    expect(states.filter((state) => state === 'open')).toHaveLength(1);
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

  it('does not convert before the quiet wait, then converts once', async () => {
    // SLOW_QUIET waits 400 ms. The clock only moves when the test moves it; the waits below run
    // timers already due (pdf-lib's 0 ms yields) without moving it.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const file = await makePdfFile();
      mount({ quietPolicy: SLOW_QUIET });
      await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [file]); });
      await waitUntil(() => cells().length > 0 && downloadElement(), { dueFakeTimers: true });
      await act(async () => { await vi.advanceTimersByTimeAsync(399); });
      expect(conversions()).toBe(0);
      expect(downloadElement().getAttribute('data-state')).toBe('ready');
      expect(downloadElement().getAttribute('aria-busy')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      await waitUntil(() => /\d(\.\d)? KB/.test(downloadElement().textContent), { dueFakeTimers: true });
      expect(conversions()).toBe(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(conversions()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
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

  it('skipping a page changes what the Download element says it converts', async () => {
    await open();
    await click(skipButton(2));
    await until(() => downloadElement().textContent.includes('Download 4 PNGs'));
    expect(downloadElement().textContent).toContain('Download 4 PNGs');
  });

  it('typing a range builds those pages, as one recorded step', async () => {
    await open();
    await type('2-3');
    await until(() => lastConversion()?.pages === '2-3');
    expect(lastConversion().pages).toBe('2-3');
    await undo();
    expect(recentActions()).toEqual(['add_files', 'select_pages', 'undo']);
  });

  it('rotating a page is a step and reaches the build as a rotation of that page number', async () => {
    await open();
    await click(container.querySelector('[aria-label="Rotate page 2"]'));
    await until(() => lastConversion()?.rotations?.[2] === 90);
    expect(lastConversion().rotations).toEqual({ 2: 90 });
    expect(recentActions()).toEqual(['add_files', 'rotate']);
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(false);
  });

  it('rebuilds on a format change, and a built format comes back from the cache', async () => {
    await open();
    expect(conversions()).toBe(1);
    await click(radio('JPG'));
    expect(downloadElement().textContent).toContain('Download 5 JPGs');
    await until(() => conversions() === 2);
    expect(conversions()).toBe(2);
    expect(lastConversion().format).toBe('image/jpeg');
    await click(radio('PNG'));
    expect(downloadElement().textContent).toContain('Download 5 PNGs');
    expect(downloadElement().textContent).toMatch(/\d(\.\d)? KB/);
    await drain();
    expect(conversions()).toBe(2);
    expect(harness.usageEvents('tool_first_edit').map((event) => event.properties.tool)).toEqual(['pdf-to-image']);
  });

  it('never auto-builds above 30 pages, says it is made on tap, and builds when Download is approached', async () => {
    await open(31);
    await drain();
    expect(conversions()).toBe(0);
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(downloadElement().textContent).toContain('Made when you tap');
    await act(async () => { downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await until(() => conversions() === 1 && /KB|MB/.test(downloadElement().textContent));
    expect(conversions()).toBe(1);
    expect(downloadElement().textContent).toMatch(/KB|MB/);
    expect(downloadElement().textContent).not.toContain('Made when you tap');
  });

  it('builds on its own at exactly 30 pages', async () => {
    await open(30);
    expect(conversions()).toBe(1);
    expect(downloadElement().textContent).not.toContain('Made when you tap');
  });

  it('a tap that beats the build shows preparing and delivers when it lands', async () => {
    let finish;
    // forced: the build is held until the test lets it finish.
    forceConversion((file, opts) => new Promise((resolve) => { finish = async () => resolve(await realConvert(file, opts)); }));
    await open(1);
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    await click(downloadElement());
    expect(downloadElement().getAttribute('data-state')).toBe('preparing');
    expect(await events('tool_operation_started')).toBe(1);
    await act(async () => { finish(); });
    await until(() => downloadElement().getAttribute('data-state') === 'saved');
    expect(downloadElement().getAttribute('data-state')).toBe('saved');
    expect(await events('tool_result_ready')).toBe(1);
  });

  it('reports no start for the background build, only for the Download tap', async () => {
    await open();
    expect(await events('tool_operation_started')).toBe(0);
    await click(downloadElement());
    await until(() => harness.usageEvents('tool_result_ready').length === 1);
    expect(await events('tool_operation_started')).toBe(1);
    expect(await events('tool_result_ready')).toBe(1);
  });

  describe('saving one page', () => {
    it('appears on each included page only once the images are built, and is not there for a skipped page', async () => {
      mount({ quietPolicy: SLOW_QUIET });
      await pick(await makePdfFile('report.pdf', 3));
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
      expect(await events('tool_operation_started')).toBe(1);
      expect(downloadElement().getAttribute('data-state')).toBe('ready');
    });

    it('is not offered for the tall image or for a single image', async () => {
      await open(3);
      await click(radio('One tall image'));
      await until(() => lastConversion()?.layout === 'concatenated' && /KB/.test(downloadElement().textContent));
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
    await until(() => lastConversion()?.layout === 'concatenated' && downloadElement().getAttribute('download') === 'report.png');
    expect(lastConversion().layout).toBe('concatenated');
    expect(heading().textContent).toContain('report.png');
    expect(heading().textContent).toContain('1 image');
    expect(downloadElement().textContent).toContain('Download PNG');
    expect(downloadElement().getAttribute('download')).toBe('report.png');
  });

  it('Download in one-per-page output saves every image, once each', async () => {
    await open(3);
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
    await replaceWith(await makePdfFile('next.pdf'));
    expect(radio('JPG').getAttribute('aria-checked')).toBe('true');
    expect(radio('One tall image').getAttribute('aria-checked')).toBe('true');
    expect(field().value).toBe('1-5');
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(true);
  });

  it('the done strip names the pattern for several images and the real name for one', async () => {
    const stripName = () => container.querySelector('section[aria-label] p')?.textContent ?? '';
    await open(3);
    const quiet = () => container.querySelector('[data-quiet-download]');
    // Three images are saved PART_GAP_MS (200) apart in useDownloadFlow.ts: run those gaps here so they
    // cannot fire inside a later test.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      await click(quiet());
      await vi.advanceTimersByTimeAsync(2 * 200 + 1);
    } finally {
      vi.useRealTimers();
    }
    await until(() => stripName().includes('report-page-N.png'));
    expect(stripName()).toContain('report-page-N.png');
    await click(radio('One tall image'));
    await until(() => lastConversion()?.layout === 'concatenated' && /KB/.test(downloadElement().textContent));
    await click(quiet());
    await until(() => stripName().includes('report.png'));
    expect(stripName()).toContain('report.png');
    expect(stripName()).not.toContain('page-N');
  });

  it('drops a conversion whose file was replaced while it ran', async () => {
    let finish;
    const converted = Promise.withResolvers<void>();
    // forced: the first file's build is held until the test lets it finish, after the file was replaced.
    forceConversion((file, opts) => new Promise((resolve, reject) => {
      finish = () => realConvert(file, opts).then(resolve, reject).finally(() => converted.resolve());
    }));
    await open(2);
    const first = finish;
    resetConversion();
    await replaceWith(await makePdfFile('second.pdf', 2));
    await act(async () => {
      first();
      await converted.promise;
      await drainPromises(); // the tool's continuation after the replaced file's conversion
    });
    // The second file's own build has landed: its size is on the element.
    await until(() => /KB/.test(downloadElement().textContent));
    expect(heading().textContent).toContain('second-page-N.png');
    expect(saveLinks().every((a) => a.getAttribute('download').startsWith('second-page'))).toBe(true);
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
  });

  it('a build that fails says so on the Download element, counts as a failed operation, and a tap tries again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    // forced: the first build fails, which no real file makes the conversion do.
    forceConversion(async (file, opts) => {
      if (fail) throw new Error('boom');
      return realConvert(file, opts);
    });
    await open(2);
    expect(downloadElement().getAttribute('data-state')).toBe('error');
    expect(downloadElement().textContent).toContain('Could not make the images. Tap to try again.');
    await harness.flush();
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'convert', type: 'Error' }]);
    expect(await events('tool_operation_failed')).toBe(1);
    fail = false;
    await act(async () => { downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await until(() => downloadElement().getAttribute('data-state') === 'ready' && /KB/.test(downloadElement().textContent));
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(downloadElement().textContent).toMatch(/KB/);
  });

  it('a document that cannot be read says so, still offers Replace file, and counts as a failed operation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    await pick(new File(['this is not a PDF'], 'report.pdf', { type: 'application/pdf' }));
    await until(() => container.textContent.includes('The file may be damaged. Try another PDF.'));
    expect(container.textContent).toContain('The file may be damaged. Try another PDF.');
    expect(cells()).toHaveLength(0);
    await click(button('Replace file'));
    expect(container.querySelector('dialog[aria-labelledby="confirm-replace-title"]').open).toBe(true);
    expect(await events('tool_operation_failed')).toBe(1);
  });

  it('a password-locked PDF shows NeedsUnlock, never opens in pdf.js or builds, and is not a failed operation', async () => {
    mount();
    await pick(await fixtureAt(needsPasswordUrl, 'locked.pdf'));
    await until(() => button('Unlock it'));
    expect(container.textContent).toContain('This PDF has a password');
    expect(container.textContent).toContain('then you can turn it into images');
    expect(button('Unlock it')).toBeDefined();
    expect(openThumbnailSource).not.toHaveBeenCalled();
    expect(conversions()).toBe(0);
    expect(downloadElement()).toBeNull();
    await harness.flush();
    expect(harness.reports()).toEqual([]);
    expect(await events('tool_operation_failed')).toBe(0);
  });

  it('an owner-restricted PDF still renders and converts as it is', async () => {
    await open(3, {}, await fixtureAt(ownerOnlyUrl, 'report.pdf'));
    expect(container.textContent).not.toContain('This PDF is protected');
    expect(cells()).toHaveLength(3);
    expect(conversions()).toBe(1);
  });

  it('revokes every image URL on unmount', async () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await open(2);
    const created = create.mock.results.map((result) => result.value as string);
    expect(created.length).toBeGreaterThanOrEqual(2);
    revoke.mockClear();
    act(() => render(null, container));
    const revoked = revoke.mock.calls.map(([url]) => url);
    for (const url of created) expect(revoked).toContain(url);
  });


  describe('files that are not PDFs', () => {
    const noteFor = async (messages, files) => {
      mount(messages ? { messages } : {});
      await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), files); });
      return container.querySelector('[role="status"]')?.textContent;
    };
    const txt = (name) => new File(['x'], name, { type: 'text/plain' });

    it('speaks Hebrew with the name isolated', async () => {
      expect(await noteFor(hebrewToImageMessages, [txt('2025-notes.txt')])).toBe('דילגנו על "⁨' + '2025-notes.txt⁩" - זה לא קובץ PDF.');
    });
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
      mount(hebrew);
      await pick(await fixtureAt(needsPasswordUrl, 'locked.pdf'));
      await until(() => container.textContent.includes(hebrewToImageMessages.protectedUnlockIt));
      expect(container.textContent).toContain(hebrewToImageMessages.protectedNeedsPasswordTitle);
      expect(container.textContent).toContain(hebrewToImageMessages.protectedUnlockIt);
      expect(container.textContent).not.toContain('This PDF');
    });
  });
});
