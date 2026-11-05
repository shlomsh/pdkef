// @ts-nocheck - island test with loose DOM helpers
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { rotateQuad } from '#lib/pageEnhance/quad.ts';
import { turnedQuad } from './lib/quad.ts';
import { playFlatten } from './lib/flattenAnimation.ts';
import { canUseCamera } from './lib/camera/canUseCamera.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { loadDraft, readRecentFiles } from '#lib/drafts/draftStore.ts';

// EDGE: the flatten animation paints the photo into a 2d canvas context, which jsdom does not have.
// Analytics and draftStore run for real over the harness.
vi.mock('./lib/flattenAnimation.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  playFlatten: vi.fn(() => () => {}),
}));

// EDGE: the pipeline decodes photos and draws and encodes canvases (createImageBitmap, 2d context, toBlob), none of which jsdom has.
vi.mock('./lib/scanPipeline.ts', () => ({
  guessPage: vi.fn(),
  inspectPhoto: vi.fn(),
  processPage: vi.fn(),
  buildScanPdf: vi.fn(),
  turnImage: vi.fn(),
}));

// The live camera: whether it is usable is the test's call, and the viewfinder is a stub that exposes its props.
vi.mock('./lib/camera/canUseCamera.ts', () => ({ canUseCamera: vi.fn(() => false) }));
const finder = vi.hoisted(() => ({ props: null as any }));
vi.mock('./lib/camera/loadCamera.ts', () => ({
  loadViewfinder: () => Promise.resolve({
    default: (props: any) => {
      finder.props = props;
      return (
        <div data-viewfinder data-mode={props.mode} data-count={props.count}>
          <button type="button" onClick={() => props.onTaken(new File(['x'], 'shot.jpg', { type: 'image/jpeg' }))}>stub-take</button>
          <button type="button" onClick={props.onClose}>stub-close</button>
          <button type="button" onClick={props.onReview}>stub-review</button>
          <button type="button" onClick={() => props.onFallbackFiles([new File(['x'], 'f1.jpg', { type: 'image/jpeg' }), new File(['x'], 'f2.jpg', { type: 'image/jpeg' })])}>stub-fallback</button>
        </div>
      );
    },
  }),
}));

const QUIET = { baseMs: 100, stepMs: 50, maxMs: 300, burstWindowMs: 1000 };
const GUESS = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.12 }, { x: 0.88, y: 0.9 }, { x: 0.12, y: 0.88 }];
const seen = (quad) => ({ quad, width: 1000, height: 1333, preview: new Blob(['p'], { type: 'image/jpeg' }) });
const jpeg = (name) => new File(['x'], name, { type: 'image/jpeg' });
const heic = (name) => new File(['x'], name, { type: 'image/heic' });

describe('PdfScanTool', () => {
  let container;
  let harness: ToolHarness;

  beforeEach(() => {
    harness = installToolHarness();
    // setImmediate stays real: fake-indexeddb answers on it, and the draft store (SCAN-18) runs for real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.mocked(pipeline.guessPage).mockReset().mockImplementation(() => Promise.resolve(GUESS));
    vi.mocked(pipeline.inspectPhoto).mockReset().mockImplementation(() => Promise.resolve(seen(GUESS)));
    vi.mocked(pipeline.processPage).mockReset().mockImplementation(() => Promise.resolve({
      blob: new Blob(['x'], { type: 'image/jpeg' }), width: 100, height: 140, thumb: new Blob(['t'], { type: 'image/jpeg' }),
    }));
    vi.mocked(pipeline.turnImage).mockReset().mockImplementation(() => Promise.resolve(new Blob(['r'], { type: 'image/jpeg' })));
    vi.mocked(pipeline.buildScanPdf).mockReset().mockImplementation(() => Promise.resolve({
      blob: new Blob(['%PDF'], { type: 'application/pdf' }), metTarget: true, scale: 1, quality: 0.82,
      pages: [{ blob: new Blob(['j'], { type: 'image/jpeg' }), place: { pageWidth: 595.28, pageHeight: 841.89, x: 0, y: 0, width: 595.28, height: 841.89 } }],
    }));
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.useRealTimers();
    harness.restore();
  });

  function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfScanTool quietPolicy={QUIET} />, container); });
  }

  const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const mainInput = () => container.querySelector('input[type="file"]:not([capture])');
  async function pick(files) {
    await act(async () => { setInputFiles(mainInput(), files); });
    await settle();
  }
  /** The table's page tiles, and the strip's tiles beside the one-page view. */
  const tableTiles = () => Array.from(container.querySelectorAll('[data-table-page]'));
  const tileLabels = () => tableTiles().map((el) => el.getAttribute('aria-label'));
  const onTable = () => container.querySelector('[data-add-pages]') !== null;
  const openPage = async (n) => { await act(async () => { tableTiles()[n - 1].click(); }); await settle(); };
  const adjustCorners = async () => { await act(async () => { byText('Corners')[0].click(); }); await settle(); };
  const openCorners = async (n) => { await openPage(n); await adjustCorners(); };
  const useCorners = () => act(async () => { byText('Use these corners')[0].click(); });
  const done = () => act(async () => { byText('Done')[0].click(); });
  const handles = () => Array.from(container.querySelectorAll('[role="group"] button'));
  const byText = (text) => Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === text);
  const radioGroup = (label) => Array.from(container.querySelectorAll('[role="radiogroup"]'))
    .find((g) => (g.getAttribute('aria-label') ?? container.querySelector(`#${g.getAttribute('aria-labelledby')}`)?.textContent) === label);
  const checked = (label) => radioGroup(label).querySelector('[aria-checked="true"]').textContent.trim();

  it('offers Start scanning on the empty state as an equal of Choose photos, wired to the rear camera', () => {
    mount();
    const take = Array.from(container.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Start scanning');
    const choose = Array.from(container.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Choose photos');
    expect(take.className.split(' ')).toContain(choose.className);
    const input = container.querySelector('input[capture]');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png');
  });

  describe('the live camera', () => {
    const viewfinder = () => container.querySelector('[data-viewfinder]');
    const startScanning = () => Array.from(container.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Start scanning');
    const stub = (text) => byText(text)[0];
    async function openCamera() {
      mount();
      await act(async () => { startScanning().click(); });
      await settle();
    }

    beforeEach(() => { vi.mocked(canUseCamera).mockReturnValue(true); });
    afterEach(() => { vi.mocked(canUseCamera).mockReturnValue(false); });

    it('opens the viewfinder from Start scanning, without opening the input', async () => {
      mount();
      const input = startScanning().querySelector('input');
      const opened = vi.fn();
      input.addEventListener('click', opened);
      await act(async () => { startScanning().click(); });
      await settle();
      expect(viewfinder().getAttribute('data-mode')).toBe('many');
      expect(viewfinder().getAttribute('data-count')).toBe('0');
      expect(opened).not.toHaveBeenCalled();
    });

    it('adds a page for each photo taken and closes on Done', async () => {
      await openCamera();
      await act(async () => { stub('stub-take').click(); });
      await settle();
      expect(viewfinder().getAttribute('data-count')).toBe('1');
      await act(async () => { stub('stub-close').click(); });
      expect(viewfinder()).toBeNull();
      expect(tableTiles()).toHaveLength(1);
    });

    it('adds the photos of the native input when the camera falls back', async () => {
      await openCamera();
      await act(async () => { stub('stub-fallback').click(); });
      await settle();
      expect(viewfinder()).toBeNull();
      expect(tableTiles()).toHaveLength(2);
    });

    it('replaces the page in place from its page view, in mode one, and closes', async () => {
      mount();
      await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
      await openPage(1);
      await act(async () => { byText('Retake')[0].click(); });
      await settle();
      expect(viewfinder().getAttribute('data-mode')).toBe('one');
      await act(async () => { stub('stub-take').click(); });
      await settle();
      expect(viewfinder()).toBeNull();
      expect(container.querySelector('[data-page-heading]').textContent).toContain('Page 1 of 2');
      expect(vi.mocked(pipeline.inspectPhoto).mock.calls.some(([file]) => file.name === 'shot.jpg')).toBe(true);
    });

    it('is a plain native input when the camera is not usable', async () => {
      vi.mocked(canUseCamera).mockReturnValue(false);
      mount();
      const input = startScanning().querySelector('input');
      const opened = vi.fn((e) => e.preventDefault());
      input.addEventListener('click', opened);
      await act(async () => { startScanning().click(); });
      await settle();
      expect(opened).toHaveBeenCalled();
      expect(viewfinder()).toBeNull();
    });
  });

  it('adds one page per JPEG and names the skipped HEIC', async () => {
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg'), heic('c.heic')]);
    expect(tileLabels().map((l) => l.split(',')[0])).toEqual(['Page 1 of 2', 'Page 2 of 2']);
    expect(container.textContent).toContain('c.heic was skipped');
    // The photos land on the table, not on a page's corners.
    expect(onTable()).toBe(true);
    expect(handles()).toHaveLength(0);
  });

  it('puts the corner handles on the guessed quad', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openCorners(1);
    expect(handles()).toHaveLength(4);
    handles().forEach((h, i) => {
      expect(h.style.left).toBe(`${GUESS[i].x * 100}%`);
      expect(h.style.top).toBe(`${GUESS[i].y * 100}%`);
    });
  });

  it('holds the photo\'s place while its preview is made, with no corners to drag yet', async () => {
    let resolveInspect;
    vi.mocked(pipeline.inspectPhoto).mockImplementation(() => new Promise((r) => { resolveInspect = r; }));
    mount();
    await pick([jpeg('a.jpg')]);
    await openCorners(1);
    expect(handles()).toHaveLength(0);
    expect(container.textContent).toContain('Finding the page edges');
    await act(async () => { resolveInspect(seen(GUESS)); });
    await settle();
    expect(handles()[0].style.left).toBe(`${GUESS[0].x * 100}%`);
  });

  it('removes pages and returns to the empty state after the last', async () => {
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    // Remove sits in the one-page view and returns to the table.
    await openPage(1);
    await act(async () => { byText('Remove')[0].click(); });
    await settle();
    expect(onTable()).toBe(true);
    expect(tableTiles()).toHaveLength(1);
    await openPage(1);
    await act(async () => { byText('Remove')[0].click(); });
    await settle();
    expect(tableTiles()).toHaveLength(0);
    expect(container.querySelector('[data-empty-state]')).not.toBeNull();
  });

  it('shows Look, Page size and Size limit with their defaults, and A4 can be chosen', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openPage(1);
    await act(async () => { byText('Look')[0].click(); });
    expect(checked('Look')).toBe('Document');
    expect(checked('Page size')).toBe('Fit');
    expect(checked('Size limit')).toBe('Full');
    const a4 = Array.from(radioGroup('Page size').querySelectorAll('button')).find((b) => b.textContent === 'A4');
    await act(async () => { a4.click(); });
    await settle();
    expect(checked('Page size')).toBe('A4');
  });

  it('offers Sign, Highlight, Redact, Compress in the rail once the PDF is ready, on the table and beside a page', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle(1000);
    expect(container.querySelector('[data-scan-ready]')).not.toBeNull();
    const pinned = () => Array.from(container.querySelectorAll('[data-rail-pinned] button')).map((b) => b.textContent.trim());
    expect(pinned()).toEqual(expect.arrayContaining(['Sign', 'Highlight', 'Redact', 'Compress']));
    await openPage(1);
    await settle();
    expect(pinned()).toEqual(expect.arrayContaining(['Sign', 'Highlight', 'Redact', 'Compress']));
  });

  it('says so when a size limit cannot be met', async () => {
    vi.mocked(pipeline.buildScanPdf).mockImplementation(() => Promise.resolve({
      blob: new Blob(['%PDF'], { type: 'application/pdf' }), metTarget: false, scale: 0.5, quality: 0.4,
    }));
    mount();
    await pick([jpeg('a.jpg')]);
    const mb = Array.from(radioGroup('Size limit').querySelectorAll('button')).find((b) => b.textContent === '1 MB');
    await act(async () => { mb.click(); });
    await settle(1000);
    expect(container.textContent).toContain('as small as these pages go');
  });

  it('names a page that could not be read, and holds Download back until it is removed', async () => {
    vi.mocked(pipeline.processPage).mockImplementation((file) => (file.name === 'b.jpg'
      ? Promise.reject(new Error('decode failed'))
      : Promise.resolve({ blob: new Blob(['x'], { type: 'image/jpeg' }), width: 100, height: 140 })));
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle(50);
    expect(container.textContent).toContain('Page 2 could not be read.');
    expect(pipeline.buildScanPdf).not.toHaveBeenCalled();
    // Download says what holds it back, instead of preparing for good.
    expect(container.textContent).toContain('Remove page 2 to make the PDF');
    expect(container.textContent).not.toMatch(/Preparing \d+ pages/);
    await openPage(2);
    await act(async () => { byText('Remove')[0].click(); });
    await settle(1000);
    expect(container.textContent).not.toContain('could not be read');
    expect(pipeline.buildScanPdf).toHaveBeenCalled();
  });

  it('skips work a newer corner made stale before its turn came', async () => {
    let release;
    vi.mocked(pipeline.processPage).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openCorners(1);
    // The first run is in flight; two corner moves queue two more, and only the last is still wanted.
    await act(async () => { handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    await act(async () => { handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    await act(async () => { release({ blob: new Blob(['x'], { type: 'image/jpeg' }), width: 100, height: 140, thumb: new Blob(['t']) }); });
    await settle(50);
    expect(pipeline.processPage).toHaveBeenCalledTimes(2);
  });

  it('shows the page as it will download when it opens, and corners again on request', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openPage(1);
    expect(handles()).toHaveLength(0);
    await settle(1000);
    const paper = container.querySelector('[data-paper]');
    expect(paper.hasAttribute('data-exact')).toBe(true);
    expect(container.textContent).toContain('Exactly as it will download');
    await adjustCorners();
    expect(handles()).toHaveLength(4);
    await useCorners();
    expect(handles()).toHaveLength(0);
    // A new choice: the old pages stay on screen, marked as updating, until the new build lands.
    await act(async () => { radioGroup('Page size').querySelectorAll('[role="radio"]')[1].click(); });
    expect(container.querySelector('[data-paper]').hasAttribute('data-exact')).toBe(false);
    expect(container.textContent).toContain('Updating');
  });

  it('returns to the table with Done and with the back control, keeping the pages', async () => {
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle();
    await openPage(2);
    expect(onTable()).toBe(false);
    expect(container.querySelector('[data-page-heading]').textContent).toContain('Page 2 of 2');
    await done();
    expect(onTable()).toBe(true);
    expect(tableTiles()).toHaveLength(2);
    await openPage(1);
    await act(async () => { container.querySelector('[data-back]').click(); });
    expect(onTable()).toBe(true);
    expect(tableTiles()).toHaveLength(2);
  });

  it('retakes a page in place: the new photo takes its position, and the table comes back with Done', async () => {
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle();
    await openPage(1);
    const input = container.querySelector('[data-page-actions] input[type="file"]');
    await act(async () => { setInputFiles(input, [jpeg('again.jpg')]); });
    await settle();
    // Still the one-page view, still page 1 of 2, now with the new photo.
    expect(container.querySelector('[data-page-heading]').textContent).toContain('Page 1 of 2');
    expect(vi.mocked(pipeline.inspectPhoto).mock.calls.some(([file]) => file.name === 'again.jpg')).toBe(true);
    await done();
    expect(tableTiles()).toHaveLength(2);
  });

  it('says so when no page edges were found, on the corners and then on the result', async () => {
    vi.mocked(pipeline.inspectPhoto).mockImplementation(() => Promise.resolve(seen(null)));
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openCorners(1);
    expect(container.textContent).toContain('No page edges were found in this photo');
    await useCorners();
    expect(container.textContent).toContain('so the whole photo is used');
  });

  it('finds the page on request from the corners view', async () => {
    vi.mocked(pipeline.inspectPhoto).mockImplementation(() => Promise.resolve(seen(null)));
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openCorners(1);
    expect(handles()[0].style.left).toBe('0%');
    vi.mocked(pipeline.guessPage).mockImplementationOnce(() => Promise.resolve(GUESS));
    await act(async () => { byText('Auto-detect')[0].click(); });
    await settle();
    expect(handles()[0].style.left).toBe(`${GUESS[0].x * 100}%`);
    expect(container.textContent).not.toContain('No page edges were found');
  });

  it('says so when Auto-detect finds nothing either', async () => {
    vi.mocked(pipeline.inspectPhoto).mockImplementation(() => Promise.resolve(seen(null)));
    vi.mocked(pipeline.guessPage).mockImplementation(() => Promise.resolve(null));
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openCorners(1);
    await act(async () => { byText('Auto-detect')[0].click(); });
    await settle();
    expect(container.textContent).toContain('Drag the corners onto the corners of the page');
  });

  it('opens a new photo in the corners view, on its small preview sized to the photo, never the full photo', async () => {
    const preview = new Blob(['p'], { type: 'image/jpeg' });
    vi.mocked(pipeline.inspectPhoto).mockImplementation(() => Promise.resolve({ quad: GUESS, width: 3000, height: 4000, preview }));
    window.URL.createObjectURL = vi.fn((blob) => (blob === preview ? 'blob:preview' : 'blob:other'));
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openCorners(1);
    const img = container.querySelector('[data-corner-frame] img');
    expect(img.getAttribute('src')).toBe('blob:preview');
    expect(container.querySelector('[data-corner-frame]').style.aspectRatio).toMatch(/^0\.75/);
    expect(handles()[0].style.left).toBe(`${GUESS[0].x * 100}%`);
  });

  it('gives each page its own look, and a new photo the look last chosen', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    const openLook = () => act(async () => { byText('Look')[0].click(); });
    await openPage(1);
    await openLook();
    const original = Array.from(radioGroup('Look').querySelectorAll('button')).find((b) => b.textContent === 'Original');
    await act(async () => { original.click(); });
    await settle();
    expect(checked('Look')).toBe('Original');
    await done();
    await pick([jpeg('b.jpg')]);
    await settle();
    await openPage(2);
    await openLook();
    expect(checked('Look')).toBe('Original');
    await done();
    await openPage(1);
    await openLook();
    expect(checked('Look')).toBe('Original');
    expect(vi.mocked(pipeline.processPage).mock.calls.some(([, , look]) => look === 'original')).toBe(true);
  });

  it('shows the exact page again when a setting goes back to one already built (a cached PDF)', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openPage(1);
    await settle(1000);
    const exact = () => container.querySelector('[data-paper]').hasAttribute('data-exact');
    expect(exact()).toBe(true);
    const size = (label) => Array.from(radioGroup('Page size').querySelectorAll('button')).find((b) => b.textContent === label);
    await act(async () => { size('A4').click(); });
    await settle(1000);
    expect(exact()).toBe(true);
    const builds = vi.mocked(pipeline.buildScanPdf).mock.calls.length;
    await act(async () => { size('Fit').click(); });
    await settle(1000);
    // Fit was built before: no new build, and the view is the PDF's own page again.
    expect(vi.mocked(pipeline.buildScanPdf).mock.calls.length).toBe(builds);
    expect(exact()).toBe(true);
  });

  it('says a photo could not be read, instead of finding edges forever, and offers no corners to use', async () => {
    vi.mocked(pipeline.inspectPhoto).mockImplementation(() => Promise.reject(new Error('decode failed')));
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    // The table says so on the tile; the corners view offers only taking it out.
    expect(container.textContent).toContain('Could not read this photo');
    await openCorners(1);
    expect(container.textContent).not.toContain('Finding the page edges');
    expect(container.textContent).toContain('Could not read this photo');
    // Nothing to straighten: the one thing offered is taking it out.
    expect(byText('Use these corners')).toHaveLength(0);
    expect(byText('Auto-detect')).toHaveLength(0);
    await act(async () => { byText('Remove this photo')[0].click(); });
    await settle();
    expect(container.querySelector('[data-empty-state]')).not.toBeNull();
  });

  it('moves focus to the page heading when a page opens, so a keyboard is not dropped on the body', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    tableTiles()[0].focus();
    await openPage(1);
    expect(document.activeElement?.hasAttribute('data-page-heading')).toBe(true);
  });

  it('drops an Auto-detect result for a page removed while it waited', async () => {
    let resolveFind;
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle();
    await openCorners(1);
    vi.mocked(pipeline.guessPage).mockImplementationOnce(() => new Promise((r) => { resolveFind = r; }));
    await act(async () => { byText('Auto-detect')[0].click(); });
    await act(async () => { container.querySelector('[aria-label="Remove page 1"]').click(); });
    await act(async () => { resolveFind?.(GUESS); });
    await settle();
    expect(container.textContent).not.toContain('Page edges found');
  });

  it('opens the corners full screen, as a full-page layer where the browser has no element full screen, and leaves it for the result', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openCorners(1);
    const editor = () => container.querySelector('[data-page-heading]').closest('section');
    // jsdom has no requestFullscreen: the full-page layer.
    await act(async () => { byText('Full screen')[0].click(); });
    expect(editor().hasAttribute('data-full')).toBe(true);
    await act(async () => { byText('Exit full screen')[0].click(); });
    expect(editor().hasAttribute('data-full')).toBe(false);
    await act(async () => { byText('Full screen')[0].click(); });
    await useCorners();
    expect(editor().hasAttribute('data-full')).toBe(false);
    expect(byText('Exit full screen')).toHaveLength(0);
  });

  describe('the page at full screen on desktop (SCAN-50)', () => {
    const editor = () => container.querySelector('[data-page-heading]').closest('section');
    const heading = () => container.querySelector('[data-page-heading]').textContent;
    const press = (key) => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
    const step = (label) => container.querySelector(`button[aria-label="${label}"]`);
    const openFull = async () => {
      mount();
      await pick([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')]);
      await settle();
      await openPage(2);
      await act(async () => { container.querySelector('[data-paper]').click(); });
    };

    it('a click on the page opens it, with only the page and the way through the scan', async () => {
      await openFull();
      expect(editor().hasAttribute('data-full')).toBe(true);
      expect(heading()).toBe('Page 2 of 3');
      expect(byText('Done')).toHaveLength(0);
      expect(byText('Pages')).toHaveLength(0);
      expect(byText('Exit full screen')).toHaveLength(1);
    });

    it('the arrow keys browse the pages and stop at the ends', async () => {
      await openFull();
      await press('ArrowRight');
      expect(heading()).toBe('Page 3 of 3');
      await press('ArrowRight');
      expect(heading()).toBe('Page 3 of 3');
      await press('ArrowLeft');
      await press('ArrowLeft');
      await press('ArrowLeft');
      expect(heading()).toBe('Page 1 of 3');
      expect(editor().hasAttribute('data-full')).toBe(true);
    });

    it('the arrows leave the browser\'s own shortcuts and a key already handled alone', async () => {
      await openFull();
      await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })); });
      await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', metaKey: true, bubbles: true })); });
      expect(heading()).toBe('Page 2 of 3');
      const handled = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      handled.preventDefault();
      await act(async () => { document.dispatchEvent(handled); });
      expect(heading()).toBe('Page 2 of 3');
    });

    it('Previous and Next browse the pages and rest at the ends', async () => {
      await openFull();
      await act(async () => { step('Next page').click(); });
      expect(heading()).toBe('Page 3 of 3');
      // aria-disabled, not disabled: the button keeps the focus it was just pressed with.
      expect(step('Next page').getAttribute('aria-disabled')).toBe('true');
      expect(step('Next page').disabled).toBe(false);
      await act(async () => { step('Previous page').click(); });
      await act(async () => { step('Previous page').click(); });
      expect(heading()).toBe('Page 1 of 3');
      expect(step('Previous page').getAttribute('aria-disabled')).toBe('true');
    });

    it('Esc returns to the card on the page last shown, where the arrows are the page\'s own again', async () => {
      await openFull();
      await press('ArrowRight');
      await press('Escape');
      expect(editor().hasAttribute('data-full')).toBe(false);
      expect(heading()).toBe('Page 3 of 3');
      expect(byText('Done')).toHaveLength(1);
      await press('ArrowLeft');
      expect(heading()).toBe('Page 3 of 3');
    });

    it('the head\'s Full screen opens it for the keyboard', async () => {
      mount();
      await pick([jpeg('a.jpg')]);
      await settle();
      await openPage(1);
      await act(async () => { byText('Full screen')[0].click(); });
      expect(editor().hasAttribute('data-full')).toBe(true);
    });
  });

  // The flatten starts from the photo where the card shows it: measured full screen, the page flew
  // in from the full-screen coordinates once the card was back (2026-10-27).
  describe('approved full screen', () => {
    const CARD = { left: 100, top: 200, width: 300, height: 400 };
    const FULL = { left: 0, top: 0, width: 2000, height: 1300 };
    let originalRect;
    beforeEach(() => {
      vi.mocked(playFlatten).mockClear();
      originalRect = Element.prototype.getBoundingClientRect;
      // The editor fills the screen while full; its photo frame sits inside it at 0,0.
      Element.prototype.getBoundingClientRect = function () {
        const editor = this.closest('[data-page-heading]')?.closest('section') ?? this.closest('section');
        const full = editor?.hasAttribute('data-full') || document.fullscreenElement === editor;
        if (this.matches('[data-corner-frame]')) return full ? FULL : { ...CARD, left: CARD.left + 20, top: CARD.top + 20 };
        return full ? FULL : CARD;
      };
    });
    afterEach(() => {
      Element.prototype.getBoundingClientRect = originalRect;
      delete HTMLElement.prototype.requestFullscreen;
      delete document.exitFullscreen;
      delete document.fullscreenElement;
    });

    const approveFull = async () => {
      mount();
      await pick([jpeg('a.jpg')]);
      await settle();
      await openCorners(1);
      await act(async () => { byText('Full screen')[0].click(); });
      await settle();
      await useCorners();
      await settle();
    };
    const fromFrame = () => vi.mocked(playFlatten).mock.calls.at(-1)?.[1].frame;

    it('as the full-page layer', async () => {
      await approveFull();
      expect(fromFrame()).toEqual({ left: 20, top: 20, width: 300, height: 400 });
    });

    it('in the browser\'s own full screen, once the browser has left it', async () => {
      HTMLElement.prototype.requestFullscreen = function () {
        Object.defineProperty(document, 'fullscreenElement', { value: this, configurable: true });
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      };
      document.exitFullscreen = () => new Promise((resolve) => {
        // The browser leaves a moment later, as a real one does.
        setTimeout(() => {
          Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
          document.dispatchEvent(new Event('fullscreenchange'));
          resolve();
        }, 50);
      });
      await approveFull();
      expect(playFlatten).not.toHaveBeenCalled();
      await settle(100);
      expect(fromFrame()).toEqual({ left: 20, top: 20, width: 300, height: 400 });
      expect(container.querySelector('[data-paper]')).not.toBeNull();
    });
  });

  it('turns the photo with Rotate while setting corners, and keeps the corners in the photo as photographed', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openCorners(1);
    await act(async () => { byText('Rotate')[0].click(); });
    await settle();
    expect(pipeline.turnImage).toHaveBeenCalledWith(expect.any(Blob), 1);
    // The handles sit on the turned photo, the page's top-left first.
    const shown = turnedQuad(GUESS, 1);
    expect(handles()[0].style.left).toBe(`${shown[0].x * 100}%`);
    expect(handles()[0].style.top).toBe(`${shown[0].y * 100}%`);
    // Nudge the shown top-left right: on the photo as photographed that corner (its bottom-left) moves up.
    await act(async () => { handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    await useCorners();
    const moved = GUESS.map((p, i) => (i === 3 ? { x: p.x, y: p.y - 0.005 } : p));
    const sent = vi.mocked(pipeline.processPage).mock.calls.at(-1)?.[1];
    rotateQuad(moved, 1).forEach((p, i) => {
      expect(sent[i].x).toBeCloseTo(p.x, 10);
      expect(sent[i].y).toBeCloseTo(p.y, 10);
    });
  });

  it('turns a page a quarter clockwise with Rotate, by handing the warp its corners one place on', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await openPage(1);
    const lastQuad = () => vi.mocked(pipeline.processPage).mock.calls.at(-1)?.[1];
    await act(async () => { byText('Rotate')[0].click(); });
    await settle();
    expect(lastQuad()).toEqual([GUESS[3], GUESS[0], GUESS[1], GUESS[2]]);
    await act(async () => { byText('Rotate')[0].click(); });
    await settle();
    expect(lastQuad()).toEqual([GUESS[2], GUESS[3], GUESS[0], GUESS[1]]);
    // Adjust corners shows the photo turned with the page, its corners turned with it.
    await adjustCorners();
    await settle();
    expect(handles()[0].style.left).toBe(`${turnedQuad(GUESS, 2)[0].x * 100}%`);
  });

  it('goes back to the default name when the file name is emptied', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    const nameEl = () => container.querySelector('h2 [contenteditable]') as HTMLElement;
    const rename = async (text: string) => {
      await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
      await act(async () => { nameEl().textContent = text; });
      await act(async () => { nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    };
    await rename('Contract');
    expect(nameEl().textContent).toBe('Contract');
    await rename('');
    expect(nameEl().textContent).toMatch(/^Scan \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });

  it('takes a tap on the held-back Download to the photo that could not be read', async () => {
    vi.mocked(pipeline.inspectPhoto).mockImplementation((file) => (file.name === 'b.jpg'
      ? Promise.reject(new Error('decode failed'))
      : Promise.resolve(seen(GUESS))));
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle();
    const blocked = Array.from(container.querySelectorAll('a, button')).find((el) => el.textContent.includes('Remove page 2 to make the PDF'));
    await act(async () => { blocked.click(); });
    await settle();
    expect(container.querySelector('[data-page-heading]').textContent).toContain('Page 2 of 2');
    expect(container.textContent).toContain('Could not read this photo');
  });

  it('brings a newly added photo into view, also when photos were already there: on desktop the page top, where the card is the first screen', async () => {
    // The setup's matchMedia matches every query: the desktop path.
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      mount();
      await pick([jpeg('a.jpg')]);
      await settle();
      scrollTo.mockClear();
      await pick([jpeg('b.jpg')]);
      await settle();
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    } finally {
      scrollTo.mockRestore();
    }
  });

  describe('on a phone (SCAN-13)', () => {
    const viewer = () => container.querySelector('[data-page-viewer]');
    const viewfinder = () => container.querySelector('[data-viewfinder]');
    let realMatchMedia;
    let realShowModal;
    let realClose;

    beforeEach(() => {
      realMatchMedia = window.matchMedia;
      window.matchMedia = (query) => ({ matches: !query.includes('min-width'), media: query, addEventListener() {}, removeEventListener() {} });
      realShowModal = HTMLDialogElement.prototype.showModal;
      realClose = HTMLDialogElement.prototype.close;
      HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
      HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
    });
    afterEach(() => {
      // Unmounted here: an open viewer closes its dialog on the way out, while the stub is still in place.
      if (container) { act(() => render(null, container)); container.remove(); container = null; }
      window.matchMedia = realMatchMedia;
      HTMLDialogElement.prototype.showModal = realShowModal;
      HTMLDialogElement.prototype.close = realClose;
      vi.mocked(canUseCamera).mockReturnValue(false);
    });

    it('renders the phone table and none of the workspace', async () => {
      mount();
      await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
      await settle(400);
      expect(tableTiles()).toHaveLength(2);
      expect(container.querySelector('[data-clear-all]')).not.toBeNull();
      expect(container.querySelector('[data-rail]')).toBeNull();
    });

    it('a tile opens the viewer over the table, and Done closes it', async () => {
      mount();
      await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
      await openPage(2);
      expect(viewer().querySelector('[data-page-heading]').textContent).toContain('Page 2 of 2');
      expect(tableTiles()).toHaveLength(2);
      expect(container.querySelector('[data-rail]')).toBeNull();
      await act(async () => { viewer().querySelector('[data-page-done]').click(); });
      await settle();
      expect(viewer()).toBeNull();
    });

    it('Use these corners lands the flatten on the current page, not its neighbour', async () => {
      mount();
      await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
      await settle(400);
      await openCorners(2);
      vi.mocked(playFlatten).mockClear();
      await useCorners();
      await settle();
      const target = vi.mocked(playFlatten).mock.calls.at(-1)?.[2];
      expect(target?.closest('[data-current]')).not.toBeNull();
    });

    it('the stack opens the viewer over the paused camera; Done goes back to the camera', async () => {
      vi.mocked(canUseCamera).mockReturnValue(true);
      mount();
      await act(async () => { Array.from(container.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Start scanning').click(); });
      await settle();
      await act(async () => { byText('stub-take')[0].click(); });
      await settle();
      await act(async () => { byText('stub-review')[0].click(); });
      await settle();
      expect(viewer()).not.toBeNull();
      expect(finder.props.paused).toBe(true);
      await act(async () => { viewer().querySelector('[data-page-done]').click(); });
      await settle();
      expect(viewer()).toBeNull();
      expect(viewfinder().getAttribute('data-mode')).toBe('many');
      expect(finder.props.paused).toBe(false);
    });

    it('Retake from the stack takes that page again and goes back to taking pages', async () => {
      vi.mocked(canUseCamera).mockReturnValue(true);
      mount();
      await act(async () => { Array.from(container.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Start scanning').click(); });
      await settle();
      await act(async () => { byText('stub-take')[0].click(); });
      await settle();
      await act(async () => { byText('stub-review')[0].click(); });
      await settle();
      await act(async () => { byText('Retake')[0].click(); });
      await settle();
      expect(viewer()).toBeNull();
      expect(viewfinder().getAttribute('data-mode')).toBe('one');
      await act(async () => { byText('stub-take')[0].click(); });
      await settle();
      expect(viewfinder().getAttribute('data-mode')).toBe('many');
      expect(viewfinder().getAttribute('data-count')).toBe('1');
    });

    it('binds hold and drag again when the width crosses to the desktop grid', async () => {
      const changes = new Set();
      let wide = false;
      window.matchMedia = (query) => ({
        get matches() { return query.includes('min-width') ? wide : true; },
        media: query,
        addEventListener(_type, listener) { if (query.includes('min-width')) changes.add(listener); },
        removeEventListener(_type, listener) { changes.delete(listener); },
      });
      const create = vi.spyOn(Sortable, 'create');
      mount();
      await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
      await settle();
      const phoneList = tableTiles()[0].closest('ul');
      wide = true;
      act(() => changes.forEach((listener) => listener()));
      await settle();
      expect(tableTiles()[0].closest('ul')).not.toBe(phoneList);
      expect(create.mock.calls.at(-1)?.[0]).toBe(tableTiles()[0].closest('ul'));
      create.mockRestore();
    });

    it('binds hold and drag to the grid on screen', async () => {
      const create = vi.spyOn(Sortable, 'create');
      mount();
      await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
      await settle();
      expect(create.mock.calls.at(-1)?.[0]).toBe(tableTiles()[0].closest('ul'));
      create.mockRestore();
    });
  });

  it('binds hold and drag to the table on desktop, and to the strip beside a page', async () => {
    const create = vi.spyOn(Sortable, 'create');
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle();
    expect(create.mock.calls.at(-1)?.[0]).toBe(tableTiles()[0].closest('ul'));
    await openPage(1);
    expect(create.mock.calls.at(-1)?.[0]).toBe(container.querySelector('[data-selected]').closest('ul'));
    create.mockRestore();
  });

  describe('remembering the scan (SCAN-18)', () => {
    const photo = (name, body) => new File([body], name, { type: 'image/jpeg' });
    const remount = async () => {
      act(() => render(null, container));
      container.remove();
      mount();
      await until(() => container.querySelector('[data-empty-state], [data-table-page]') !== null);
      await settle(100);
    };
    const draftLine = () => container.querySelector('[data-draft-status]')?.textContent;
    const until = async (cond, timeout = 8000) => {
      const start = Date.now();
      while (!cond()) {
        if (Date.now() - start > timeout) throw new Error(`condition not met within ${timeout}ms: ${cond}`);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10);
          await new Promise((resolve) => setImmediate(resolve));
        });
      }
    };
    const saved = () => until(() => draftLine() === 'Draft saved');

    it('saves the pages and settings, and brings them back on the next visit', async () => {
      mount();
      await settle(100);
      await pick([photo('a.jpg', 'photo a'), photo('b.jpg', 'photo b')]);
      await openPage(2);
      await act(async () => { byText('Look')[0].click(); });
      const original = Array.from(radioGroup('Look').querySelectorAll('button')).find((b) => b.textContent === 'Original');
      await act(async () => { original.click(); });
      const a4 = Array.from(radioGroup('Page size').querySelectorAll('button')).find((b) => b.textContent === 'A4');
      await act(async () => { a4.click(); });
      await saved();
      const record = await loadDraft('scan-to-pdf');
      expect(record.files.map((f) => f.fileName)).toEqual(['a.jpg', 'b.jpg']);
      expect(record.pages.map((p) => p.filter)).toEqual(['document', 'original']);
      expect(record.pageSize).toBe('a4');

      // The pre-paint script marks a restore that may land; once it has, the mark goes, or the empty
      // state would stay hidden after a Clear all (Dropzone.module.css).
      document.documentElement.setAttribute('data-draft-hint', '1');
      await remount();
      expect(tableTiles()).toHaveLength(2);
      expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
      // Nothing changed since: the restored scan is not written straight back.
      expect(draftLine()).toBeUndefined();
      await openPage(2);
      await act(async () => { byText('Look')[0].click(); });
      expect(checked('Look')).toBe('Original');
      expect(checked('Page size')).toBe('A4');
    });

    it('keeps one Recents row for a scan that grows a page at a time', async () => {
      mount();
      await settle(100);
      await pick([photo('a.jpg', 'photo a')]);
      await saved();
      await pick([photo('b.jpg', 'photo b')]);
      await saved();
      await pick([photo('c.jpg', 'photo c')]);
      await saved();
      const rows = readRecentFiles();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ tool: 'scan-to-pdf', pageCount: 3 });
    });

    it('lets photos handed over from Image to PDF start a new scan, not join the remembered one', async () => {
      mount();
      await settle(100);
      await pick([photo('a.jpg', 'photo a')]);
      await saved();
      act(() => render(null, container));
      container.remove();
      document.documentElement.setAttribute('data-handoff-pending', '1');
      try {
        mount();
        await settle(100);
        await until(() => container.querySelector('[data-empty-state]') !== null);
        expect(tableTiles()).toHaveLength(0);
      } finally {
        document.documentElement.removeAttribute('data-handoff-pending');
      }
    });

    it('forgets the scan once the last page is removed', async () => {
      mount();
      await settle(100);
      await pick([photo('a.jpg', 'photo a')]);
      await saved();
      await openPage(1);
      await act(async () => { byText('Remove')[0].click(); });
      await until(() => !(readRecentFiles()[0]?.hasWork ?? []).includes('scan-to-pdf'));
      await remount();
      expect(tableTiles()).toHaveLength(0);
      expect(container.querySelector('[data-empty-state]')).not.toBeNull();
    });
  });
});
