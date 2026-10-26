// @ts-nocheck - island test with loose DOM helpers
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './scanPipeline.ts';
import { setInputFiles } from '../../test/setInputFiles.js';

vi.mock('../../lib/productAnalytics.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  reportToolLifecycleEvent: vi.fn(),
}));

vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  takeHandoff: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('./scanPipeline.ts', () => ({
  guessPage: vi.fn(),
  inspectPhoto: vi.fn(),
  processPage: vi.fn(),
  buildScanPdf: vi.fn(),
}));

const QUIET = { baseMs: 100, stepMs: 50, maxMs: 300, burstWindowMs: 1000 };
const GUESS = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.12 }, { x: 0.88, y: 0.9 }, { x: 0.12, y: 0.88 }];
const seen = (quad) => ({ quad, width: 1000, height: 1333, preview: new Blob(['p'], { type: 'image/jpeg' }) });
const jpeg = (name) => new File(['x'], name, { type: 'image/jpeg' });
const heic = (name) => new File(['x'], name, { type: 'image/heic' });

describe('PdfScanTool', () => {
  let container;
  let originalCreate;
  let originalRevoke;

  beforeEach(() => {
    vi.useFakeTimers();
    originalCreate = window.URL.createObjectURL;
    originalRevoke = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:test');
    window.URL.revokeObjectURL = vi.fn();
    vi.mocked(pipeline.guessPage).mockReset().mockImplementation(() => Promise.resolve(GUESS));
    vi.mocked(pipeline.inspectPhoto).mockReset().mockImplementation(() => Promise.resolve(seen(GUESS)));
    vi.mocked(pipeline.processPage).mockReset().mockImplementation(() => Promise.resolve({
      blob: new Blob(['x'], { type: 'image/jpeg' }), width: 100, height: 140, thumb: new Blob(['t'], { type: 'image/jpeg' }),
    }));
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
    window.URL.createObjectURL = originalCreate;
    window.URL.revokeObjectURL = originalRevoke;
    vi.useRealTimers();
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

  it('offers Sign, Merge, Compress once the PDF is ready', async () => {
    mount();
    await pick([jpeg('a.jpg')]);
    await settle(1000);
    expect(container.querySelector('[data-scan-ready]')).not.toBeNull();
    const names = ['Sign', 'Merge', 'Compress'];
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

  it('brings a newly added photo into view, also when photos were already there', async () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
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
    }
  });
});
