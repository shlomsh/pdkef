// @ts-nocheck - island test with loose DOM helpers
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { rotateQuad, turnedQuad } from './lib/quad.ts';
import { playFlatten } from './lib/flattenAnimation.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';

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
    vi.useFakeTimers();
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
  const tiles = () => Array.from(container.querySelectorAll('[data-page]'));
  const tileLabels = () => tiles().map((el) => el.getAttribute('aria-label'));
  const adjustCorners = () => act(async () => { byText('Adjust corners')[0].click(); });
  const useCorners = () => act(async () => { byText('Use these corners')[0].click(); });
  const handles = () => Array.from(container.querySelectorAll('[role="group"] button'));
  const byText = (text) => Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === text);
  const radioGroup = (label) => Array.from(container.querySelectorAll('[role="radiogroup"]'))
    .find((g) => (g.getAttribute('aria-label') ?? container.querySelector(`#${g.getAttribute('aria-labelledby')}`)?.textContent) === label);
  const checked = (label) => radioGroup(label).querySelector('[aria-checked="true"]').textContent.trim();

  it('offers Take a photo on the empty state as an equal of Choose files, wired to the rear camera', () => {
    mount();
    const take = Array.from(container.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Take a photo');
    const choose = Array.from(container.querySelectorAll('label')).find((l) => l.textContent.trim() === 'Choose files');
    expect(take.className.split(' ')).toContain(choose.className);
    const input = container.querySelector('input[capture]');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png');
  });

  it('adds one page per JPEG and names the skipped HEIC', async () => {
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg'), heic('c.heic')]);
    expect(tileLabels().map((l) => l.split(',')[0])).toEqual(['Page 1 of 2', 'Page 2 of 2']);
    expect(container.textContent).toContain('c.heic was skipped');
  });

  it('puts the corner handles on the guessed quad', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
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
    expect(handles()).toHaveLength(0);
    expect(container.textContent).toContain('Finding the page edges');
    await act(async () => { resolveInspect(seen(GUESS)); });
    await settle();
    expect(handles()[0].style.left).toBe(`${GUESS[0].x * 100}%`);
  });

  it('removes pages and returns to the empty state after the last', async () => {
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    const remove = () => Array.from(container.querySelectorAll('button[aria-label^="Remove page"]'));
    await act(async () => { remove()[0].click(); });
    await settle();
    expect(tiles()).toHaveLength(1);
    await act(async () => { remove()[0].click(); });
    await settle();
    expect(tiles()).toHaveLength(0);
    expect(container.querySelector('[data-empty-state]')).not.toBeNull();
  });

  it('shows Look, Page size and Size limit with their defaults, and A4 can be chosen', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await useCorners();
    expect(checked('Look')).toBe('Document');
    expect(checked('Page size')).toBe('Fit');
    expect(checked('Size limit')).toBe('None');
    const a4 = Array.from(radioGroup('Page size').querySelectorAll('button')).find((b) => b.textContent === 'A4');
    await act(async () => { a4.click(); });
    await settle();
    expect(checked('Page size')).toBe('A4');
  });

  it('offers Sign, Redact, Compress once the PDF is ready', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle(1000);
    expect(container.querySelector('[data-scan-ready]')).not.toBeNull();
    const names = ['Sign', 'Redact', 'Compress'];
    const order = Array.from(container.querySelectorAll('button'))
      .map((b) => b.textContent.trim()).filter((t) => names.includes(t));
    expect(order.slice(0, 3)).toEqual(names);
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
    await act(async () => { container.querySelector('[aria-label="Remove page 2"]').click(); });
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
    // The first run is in flight; two corner moves queue two more, and only the last is still wanted.
    await act(async () => { handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    await act(async () => { handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    await act(async () => { release({ blob: new Blob(['x'], { type: 'image/jpeg' }), width: 100, height: 140, thumb: new Blob(['t']) }); });
    await settle(50);
    expect(pipeline.processPage).toHaveBeenCalledTimes(2);
  });

  it('shows the page as it will download once its corners are used, and corners again on request', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    expect(handles()).toHaveLength(4);
    await useCorners();
    expect(handles()).toHaveLength(0);
    await settle(1000);
    const paper = container.querySelector('[data-paper]');
    expect(paper.hasAttribute('data-exact')).toBe(true);
    expect(container.textContent).toContain('Exactly as it will download');
    await adjustCorners();
    expect(handles()).toHaveLength(4);
    await act(async () => { byText('Done')[0].click(); });
    expect(handles()).toHaveLength(0);
    // A new choice: the old pages stay on screen, marked as updating, until the new build lands.
    await act(async () => { radioGroup('Page size').querySelectorAll('[role="radio"]')[1].click(); });
    expect(container.querySelector('[data-paper]').hasAttribute('data-exact')).toBe(false);
    expect(container.textContent).toContain('Updating');
  });

  it('says so when no page edges were found, on the corners and then on the result', async () => {
    vi.mocked(pipeline.inspectPhoto).mockImplementation(() => Promise.resolve(seen(null)));
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    expect(container.textContent).toContain('No page edges were found in this photo');
    await useCorners();
    expect(container.textContent).toContain('so the whole photo is used');
  });

  it('finds the page on request from the corners view', async () => {
    vi.mocked(pipeline.inspectPhoto).mockImplementation(() => Promise.resolve(seen(null)));
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
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
    const img = container.querySelector('[data-corner-frame] img');
    expect(img.getAttribute('src')).toBe('blob:preview');
    expect(container.querySelector('[data-corner-frame]').style.aspectRatio).toMatch(/^0\.75/);
    expect(handles()[0].style.left).toBe(`${GUESS[0].x * 100}%`);
  });

  it('steps through new photos with Use these corners, then shows the result', async () => {
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle();
    expect(container.textContent).toContain('Page 1 of 2');
    await useCorners();
    expect(container.textContent).toContain('Page 2 of 2');
    expect(handles()).toHaveLength(4);
    await useCorners();
    expect(handles()).toHaveLength(0);
    expect(container.querySelector('[data-paper]')).not.toBeNull();
  });

  it('gives each page its own look, and a new photo the look last chosen', async () => {
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle();
    await useCorners();
    await useCorners();
    // Page 2 is selected after the last approval: make it Original.
    const original = Array.from(radioGroup('Look').querySelectorAll('button')).find((b) => b.textContent === 'Original');
    await act(async () => { original.click(); });
    await settle();
    expect(checked('Look')).toBe('Original');
    await act(async () => { tiles()[0].click(); });
    expect(checked('Look')).toBe('Document');
    expect(vi.mocked(pipeline.processPage).mock.calls.some(([, , look]) => look === 'original')).toBe(true);
  });

  it('shows the exact page again when a setting goes back to one already built (a cached PDF)', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await useCorners();
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
    expect(container.textContent).not.toContain('Finding the page edges');
    expect(container.textContent).toContain('Could not read this photo');
    // Nothing to straighten: the one thing offered is taking it out.
    expect(byText('Use these corners')).toHaveLength(0);
    expect(byText('Auto-detect')).toHaveLength(0);
    await act(async () => { byText('Remove this photo')[0].click(); });
    await settle();
    expect(container.querySelector('[data-empty-state]')).not.toBeNull();
  });

  it('moves focus to the page heading when the view changes, so a keyboard is not dropped on the body', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    byText('Use these corners')[0].focus();
    await useCorners();
    await settle();
    expect(document.activeElement?.hasAttribute('data-page-heading')).toBe(true);
  });

  it('drops an Auto-detect result for a page removed while it waited', async () => {
    let resolveFind;
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle();
    vi.mocked(pipeline.guessPage).mockImplementationOnce(() => new Promise((r) => { resolveFind = r; }));
    await act(async () => { byText('Auto-detect')[0].click(); });
    await act(async () => { container.querySelector('[aria-label="Remove page 1"]').click(); });
    await act(async () => { resolveFind?.(GUESS); });
    await settle();
    expect(container.textContent).not.toContain('Page edges found');
  });

  it('after removing the photo under review, goes to the next new photo, or to the result when none is left', async () => {
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')]);
    await settle();
    await useCorners();
    // Page 2 is under review; remove it: page 3, still new, is next.
    await act(async () => { container.querySelector('[aria-label="Remove page 2"]').click(); });
    await settle();
    expect(container.textContent).toContain('Page 2 of 2');
    expect(byText('Use these corners')).toHaveLength(1);
    // Remove that one too: nothing new is left, so the result shows.
    await act(async () => { container.querySelector('[aria-label="Remove page 2"]').click(); });
    await settle();
    expect(handles()).toHaveLength(0);
    expect(container.querySelector('[data-paper]')).not.toBeNull();
  });

  it('opens the corners full screen, as a full-page layer where the browser has no element full screen, and leaves it for the result', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    const editor = () => container.querySelector('[data-page-heading]').closest('section');
    // jsdom has no requestFullscreen: the full-page layer.
    await act(async () => { byText('Full screen')[0].click(); });
    expect(editor().hasAttribute('data-full')).toBe(true);
    await act(async () => { byText('Exit full screen')[0].click(); });
    expect(editor().hasAttribute('data-full')).toBe(false);
    await act(async () => { byText('Full screen')[0].click(); });
    await useCorners();
    expect(editor().hasAttribute('data-full')).toBe(false);
    // The page as it downloads is checked at full size too, before Download.
    expect(byText('Full screen')).toHaveLength(1);
  });

  it('shows the result page full screen for a last look, and leaves it for the corners', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle();
    await useCorners();
    const editor = () => container.querySelector('[data-page-heading]').closest('section');
    await act(async () => { byText('Full screen')[0].click(); });
    expect(editor().hasAttribute('data-full')).toBe(true);
    expect(editor().querySelector('[data-paper]')).not.toBeNull();
    await act(async () => { byText('Exit full screen')[0].click(); });
    expect(editor().hasAttribute('data-full')).toBe(false);
    await act(async () => { byText('Full screen')[0].click(); });
    await act(async () => { byText('Adjust corners')[0].click(); });
    expect(editor().hasAttribute('data-full')).toBe(false);
    expect(byText('Use these corners').length + byText('Done').length).toBeGreaterThan(0);
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
    await useCorners();
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

  it('brings the next new photo into view when the one under review is removed from the strip', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      mount();
      await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
      await settle();
      scrollTo.mockClear();
      await act(async () => { container.querySelector('[aria-label="Remove page 1"]').click(); });
      await settle();
      expect(container.querySelector('[data-page-heading]').textContent).toContain('Page 1 of 1');
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    } finally {
      scrollTo.mockRestore();
    }
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
    expect(nameEl().textContent).toBe('scan');
  });

  it('takes a tap on the held-back Download to the photo that could not be read', async () => {
    vi.mocked(pipeline.inspectPhoto).mockImplementation((file) => (file.name === 'b.jpg'
      ? Promise.reject(new Error('decode failed'))
      : Promise.resolve(seen(GUESS))));
    mount();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await settle();
    await useCorners();
    await settle();
    // On page 1 again, away from the photo that could not be read.
    await act(async () => { tiles()[0].click(); });
    expect(container.querySelector('[data-page-heading]').textContent).toContain('Page 1 of 2');
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
      await useCorners();
      scrollTo.mockClear();
      await pick([jpeg('b.jpg')]);
      await settle();
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    } finally {
      scrollTo.mockRestore();
    }
  });

  it('on a phone, brings a newly added photo to the top under the bars instead', async () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    const originalMatch = window.matchMedia;
    Element.prototype.scrollIntoView = scroll;
    window.matchMedia = ((query: string) => ({ ...originalMatch(query), matches: !query.includes('min-width: 1024px') })) as typeof window.matchMedia;
    try {
      mount();
      await pick([jpeg('a.jpg')]);
      await settle();
      await useCorners();
      scroll.mockClear();
      await pick([jpeg('b.jpg')]);
      await settle();
      expect(scroll).toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
      window.matchMedia = originalMatch;
    }
  });
});
