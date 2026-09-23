// @ts-nocheck - test-only, mirrors PdfMergeTool.test.tsx's untyped style
import { render } from 'preact';
import { createRef } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sortable from 'sortablejs';
import PageStrip from './PageStrip.tsx';
import styles from './PageStrip.module.css';
import { isGrouped, planForFile } from '../mergePlan.ts';
import { englishMergeMessages } from '../../../i18n/toolMessages';
import * as thumbnailsLib from '../../../lib/thumbnails.js';

const sources = [];

vi.mock('../../../lib/thumbnails.js', () => ({
  openThumbnailSource: vi.fn(async (file) => {
    const source = {
      file,
      pageCount: 2,
      render: vi.fn(async (pageIndex, { signal } = {}) => {
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
        return `data:image/png;base64,${file.name}-${pageIndex}`;
      }),
      destroy: vi.fn(async () => {}),
    };
    sources.push(source);
    return source;
  }),
  renderPdfThumbnails: vi.fn(async () => 0),
}));

// A controllable IntersectionObserver: tests decide which cards are "near
// the viewport" by calling `intersect`.
let observers = [];
class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    observers.push(this);
  }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  intersect(keys) {
    const records = Array.from(this.targets)
      .filter((target) => keys.includes(target.dataset.key))
      .map((target) => ({ target, isIntersecting: true }));
    this.callback(records);
  }
}

function makeFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

const flush = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls instead of sleeping a fixed time: under a loaded machine (the full
// suite in parallel) a fixed 20ms wait once let this file flake.
async function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition not met in time');
    // Each poll is its own act(): renders are held back inside one.
    await act(async () => { await flush(5); });
  }
}

describe('PageStrip', () => {
  let container;
  let originalIO;

  beforeEach(() => {
    sources.length = 0;
    observers = [];
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = FakeIntersectionObserver;
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    globalThis.IntersectionObserver = originalIO;
    vi.restoreAllMocks();
  });

  function mount(overrides = {}) {
    const entries = overrides.entries ?? [
      { id: 1, file: makeFile('a.pdf'), pageCount: 2, error: null },
      { id: 2, file: makeFile('b.pdf'), pageCount: 2, error: null },
    ];
    const plan = overrides.plan ?? [...planForFile(1, 2), ...planForFile(2, 2)];
    // The strip commits updaters; the harness applies each to the plan it was
    // mounted with so the tests can read the resulting plan.
    const onPlanChange = vi.fn((update) => update(plan));
    const announce = vi.fn();
    const onRegisterUndo = vi.fn();
    const onRenderedCountChange = vi.fn();
    const onRemoveFile = vi.fn();
    const stripRef = createRef();
    container = document.createElement('div');
    document.body.appendChild(container);
    const props = {
      entries,
      plan,
      onPlanChange,
      announce,
      messages: englishMergeMessages,
      grouped: overrides.grouped ?? isGrouped(plan),
      stripRef,
      onRegisterUndo,
      onRenderedCountChange,
      onRemoveFile,
      ...overrides.props,
    };
    act(() => {
      render(<PageStrip {...props} />, container);
    });
    const rerender = (next) => act(() => { render(<PageStrip {...props} {...next} />, container); });
    return { entries, plan, onPlanChange, announce, onRegisterUndo, onRemoveFile, stripRef, rerender };
  }

  const cards = () => Array.from(container.querySelectorAll(`.${styles.page}`));
  const captions = () => Array.from(container.querySelectorAll(`.${styles.caption}`));
  const cellTagName = (card) => card.querySelector(`.${styles['cell-tag-name']}`);

  it('renders one card per plan entry in order, in one continuous grid with no row-break items', () => {
    mount();
    expect(cards().map((card) => card.dataset.key)).toEqual(['1:0', '1:1', '2:0', '2:1']);
    // Two two-page files: each run is 1 to 3 pages, so item 1 says tag only,
    // no caption row and nothing that would force a row break.
    expect(captions()).toHaveLength(0);
    expect(container.querySelector(`.${styles.grid}`).children).toHaveLength(cards().length);
  });

  // Item 1 (Shlomi's follow-up, 2026-09-13): a run of 1 to 3 pages gets only
  // a small tag in its first cell's reserved strip; a run of 4 or more gets
  // a full-width caption row before it instead, and that cell's own strip
  // stays empty (the caption already said whose pages these are).
  it('tags the first cell of a short run (1 to 3 pages), with no caption row', () => {
    const entries = [
      { id: 1, file: makeFile('short.pdf'), pageCount: 2, error: null },
      { id: 2, file: makeFile('other.pdf'), pageCount: 1, error: null },
    ];
    const plan = [...planForFile(1, 2), ...planForFile(2, 1)];
    mount({ entries, plan });
    expect(captions()).toHaveLength(0);
    const [first, second, third] = cards();
    expect(cellTagName(first).textContent).toBe('short'); // the tag drops the extension (FileName, wave 5)
    // Every other cell's strip is empty, first-of-run or not.
    expect(cellTagName(second)).toBeNull();
    expect(cellTagName(third).textContent).toBe('other');
  });

  it('gives a run of four or more pages a full-width caption row, and no tag in its first cell', () => {
    const entries = [
      { id: 1, file: makeFile('a.pdf'), pageCount: 4, error: null },
      { id: 2, file: makeFile('b.pdf'), pageCount: 1, error: null },
    ];
    const plan = [...planForFile(1, 4), ...planForFile(2, 1)];
    mount({ entries, plan });
    expect(captions()).toHaveLength(1);
    expect(captions()[0].textContent).toContain('a.pdf');
    expect(captions()[0].textContent).toContain('pages 1 to 4');
    expect(captions()[0].getAttribute('data-caption-for')).toBe('1');
    // The 4-page run's own first cell carries no tag - the caption already
    // named the file; the 1-page run right after it does get one.
    const cards2 = cards();
    expect(cellTagName(cards2[0])).toBeNull();
    expect(cellTagName(cards2[4]).textContent).toBe('b');
  });

  it('hides captions and tags once the plan is no longer grouped, showing the per-page tag dot instead', () => {
    const plan = [planForFile(1, 2)[0], planForFile(2, 2)[0], planForFile(1, 2)[1], planForFile(2, 2)[1]];
    mount({ plan, grouped: false });
    expect(captions()).toHaveLength(0);
    expect(container.querySelectorAll(`.${styles['cell-tag-name']}`)).toHaveLength(0);
    const grid = container.querySelector(`.${styles.grid}`);
    expect(grid.hasAttribute('data-grouped')).toBe(false);
  });

  // Shlomi's reduction (wave 2): captions are labels now, no actions -
  // "rotate all" is gone and "remove" lives only in the rail row, so the
  // caption itself carries no buttons at all.
  it('a caption carries no interactive controls, only the label', () => {
    const entries = [{ id: 1, file: makeFile('a.pdf'), pageCount: 4, error: null }];
    mount({ entries, plan: planForFile(1, 4) });
    expect(container.querySelectorAll(`.${styles.caption} button`)).toHaveLength(0);
  });

  it('renders thumbnails only for cards near the viewport, one pdf.js document per file, and releases a removed file', async () => {
    const { rerender, entries } = mount();
    expect(thumbnailsLib.openThumbnailSource).not.toHaveBeenCalled();

    await act(async () => { observers.at(-1).intersect(['1:1', '2:0']); });
    await waitFor(() => container.querySelectorAll(`.${styles.thumb}`).length === 2);
    expect(thumbnailsLib.openThumbnailSource).toHaveBeenCalledTimes(2);
    const imgs = Array.from(container.querySelectorAll(`.${styles.thumb}`)).map((img) => img.getAttribute('src'));
    expect(imgs).toEqual(['data:image/png;base64,a.pdf-1', 'data:image/png;base64,b.pdf-0']);
    expect(Array.from(container.querySelectorAll(`.${styles.thumb}`)).every((img) => img.draggable === false)).toBe(true);

    // Removing file 1 cancels its renders and destroys its document.
    rerender({ entries: [entries[1]], plan: planForFile(2, 2) });
    const sourceA = sources.find((s) => s.file.name === 'a.pdf');
    await waitFor(() => sourceA.destroy.mock.calls.length > 0);
    expect(sourceA.destroy).toHaveBeenCalled();
    expect(cards().map((card) => card.dataset.key)).toEqual(['2:0', '2:1']);
  });

  // Review P1/D2: a landscape cell used to swap the portrait box's own
  // width and height wholesale, which shrank the cell into the portrait
  // box's (shorter) width and broke row alignment with its neighbours. Every
  // cell now keeps the SAME fixed height, and a landscape page takes a
  // landscape WIDTH for that height instead.
  it('gives a landscape page a fixed cell height and a width scaled to its aspect', async () => {
    mount();
    await act(async () => { observers.at(-1).intersect(['1:0']); });
    await waitFor(() => container.querySelectorAll(`.${styles.thumb}`).length === 1);
    const img = container.querySelector(`.${styles.thumb}`);
    // A landscape source image, 1.5:1.
    Object.defineProperty(img, 'naturalWidth', { value: 300, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => { img.dispatchEvent(new Event('load')); });

    const page = cards()[0];
    // jsdom's window.matchMedia stub (src/test/setup.js) always matches, so
    // baseCellSize() takes the phone branch here: a fixed 96px height, and a
    // landscape width of height * aspect (96 * 1.5 = 144) - never the old
    // swapped box, which would have reported a 72px height.
    expect(page.style.getPropertyValue('--cell-h')).toBe('96px');
    expect(page.style.getPropertyValue('--cell-w')).toBe('144px');
    expect(page.style.gridColumn).toBe('span 2');
  });

  // Item 6 (Shlomi's follow-up, 2026-09-13): a `title` attribute alone is
  // not a visible tooltip - each action button carries its own short word in
  // the DOM (CSS shows it on hover/focus; jsdom cannot prove the CSS, only
  // that the text is actually there).
  it('rotate, skip and open each carry a short tooltip word', () => {
    const { rerender } = mount();
    const first = cards()[0];
    const [rotateButton, skipButton, openButton] = first.querySelectorAll(`.${styles.action}`);
    expect(rotateButton.querySelector(`.${styles.tip}`).textContent).toBe('Rotate');
    expect(skipButton.querySelector(`.${styles.tip}`).textContent).toBe('Skip');
    expect(openButton.querySelector(`.${styles.tip}`).textContent).toBe('Open');

    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    plan[0] = { ...plan[0], skipped: true };
    rerender({ plan });
    const [, skipButtonAfter] = cards()[0].querySelectorAll(`.${styles.action}`);
    expect(skipButtonAfter.querySelector(`.${styles.tip}`).textContent).toBe('Bring back');
  });

  it('rotate and skip commit a new plan once per tap, announce it, and register one undo (MERGE-09)', async () => {
    const { onPlanChange, announce, onRegisterUndo } = mount();
    const first = cards()[0];
    await act(async () => first.querySelectorAll(`.${styles.action}`)[0].click());
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.results[0].value[0]).toMatchObject({ key: '1:0', rotation: 90 });
    expect(announce).toHaveBeenCalledWith('Page 1 rotated to 90 degrees.');
    expect(onRegisterUndo).toHaveBeenCalledWith('Rotated page 1', expect.any(Function));

    await act(async () => first.querySelectorAll(`.${styles.action}`)[1].click());
    expect(onPlanChange).toHaveBeenCalledTimes(2);
    expect(onPlanChange.mock.results[1].value[0]).toMatchObject({ key: '1:0', skipped: true });
    expect(announce).toHaveBeenLastCalledWith(expect.stringContaining('Page 1 skipped'));
    expect(onRegisterUndo).toHaveBeenLastCalledWith('Skipped page 1', expect.any(Function));
  });

  it('a page-action undo restores the plan from before the change', async () => {
    const { onPlanChange, onRegisterUndo } = mount();
    const first = cards()[0];
    await act(async () => first.querySelectorAll(`.${styles.action}`)[0].click());
    const [, perform] = onRegisterUndo.mock.calls[0];
    await act(async () => perform());
    // The second onPlanChange call (the undo) restores the original,
    // unrotated plan.
    expect(onPlanChange).toHaveBeenCalledTimes(2);
    expect(onPlanChange.mock.results[1].value[0]).toMatchObject({ key: '1:0', rotation: 0 });
  });

  it('shows a skipped page dimmed with its number struck and the word "skipped", and one tap brings it back', async () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    plan[2] = { ...plan[2], skipped: true };
    const { onPlanChange } = mount({ plan });
    const card = cards()[2];
    expect(card.hasAttribute('data-skipped')).toBe(true);
    expect(card.textContent).toContain('skipped');
    // Numbers are output positions: the skipped page shows the number it
    // would take, and the page after it takes that number for real.
    expect(cards().map((c) => c.querySelector(`.${styles.number}`).textContent)).toEqual(['1', '2', '3', '3']);
    expect(cards()[3].getAttribute('aria-label')).toBe('Page 3 of 3, from b.pdf');
    await act(async () => card.querySelectorAll(`.${styles.action}`)[1].click());
    expect(onPlanChange.mock.results[0].value[2]).toMatchObject({ key: '2:0', skipped: false });
  });

  it('keyboard: arrows move across files, R rotates, Delete skips, Enter opens the preview', async () => {
    const { onPlanChange } = mount();
    const card = cards()[1];
    card.focus();
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    // Moving page 2 of file 1 past page 1 of file 2 crosses a file boundary.
    const moved = onPlanChange.mock.results[0].value;
    expect(moved.map((p) => p.key)).toEqual(['1:0', '2:0', '1:1', '2:1']);

    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })));
    expect(onPlanChange.mock.results[1].value[1]).toMatchObject({ key: '1:1', rotation: 90 });

    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
    expect(onPlanChange.mock.results[2].value[1]).toMatchObject({ key: '1:1', skipped: true });

    await act(async () => { card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await waitFor(() => container.querySelector('dialog') !== null);
    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Page 2 of 4');
  });

  // Review P2: the dialog used to count the raw plan (previewIndex + 1 of
  // plan.length), disagreeing with the heading's "N pages · 1 skipped" and
  // every cell's own aria-label, both of which count OUTPUT pages. The
  // title now uses the same counter. A skipped page's preview no longer
  // marks itself in the title (five quiet words in the header were easy to
  // miss); it gets a banner above the dimmed page and a restore link below
  // instead - see the dedicated banner test.
  it('the preview dialog title counts output pages like the heading, and marks a skipped page', async () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    plan[2] = { ...plan[2], skipped: true };
    mount({ plan });

    // The skipped page (index 2) previews as the position it would take
    // (3 of 3 output pages), with the exclusion banner - same numbers its
    // own cell already shows (the prior test: struck "3").
    await act(async () => { cards()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await waitFor(() => container.querySelector('dialog') !== null);
    let dialog = container.querySelector('dialog');
    expect(dialog.textContent).toContain('Page 3 of 3');
    expect(dialog.textContent.toLowerCase()).toContain('excluded from the merged file');
    const prevButton = () => Array.from(dialog.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Previous page');
    const nextButton = () => Array.from(dialog.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Next page');
    // Not the first or last entry in the raw plan, so neither nav button
    // disables even though its shown position (3) equals the output total.
    expect(prevButton().disabled).toBe(false);
    expect(nextButton().disabled).toBe(false);

    // The real page right behind it (index 3, the plan's last entry) also
    // reads "3 of 3", with no exclusion banner, and Next is disabled there.
    await act(async () => { nextButton().click(); });
    dialog = container.querySelector('dialog');
    expect(dialog.textContent).toContain('Page 3 of 3');
    expect(dialog.textContent.toLowerCase()).not.toContain('excluded from the merged file');
    expect(nextButton().disabled).toBe(true);
    expect(prevButton().disabled).toBe(false);

    // Stepping back to the very first entry disables Previous.
    await act(async () => { prevButton().click(); });
    await act(async () => { prevButton().click(); });
    await act(async () => { prevButton().click(); });
    dialog = container.querySelector('dialog');
    expect(dialog.textContent).toContain('Page 1 of 3');
    expect(prevButton().disabled).toBe(true);
  });

  it('the preview dialog\'s restore link brings a skipped page back, same as the strip button', async () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    plan[2] = { ...plan[2], skipped: true };
    const { onPlanChange, announce } = mount({ plan });

    await act(async () => { cards()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await waitFor(() => container.querySelector('dialog') !== null);
    const dialog = container.querySelector('dialog');
    const restoreButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Include it again');
    expect(restoreButton).toBeTruthy();

    await act(async () => restoreButton.click());
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.results[0].value[2]).toMatchObject({ key: '2:0', skipped: false });
    expect(announce).toHaveBeenLastCalledWith(expect.stringContaining('Page 3 included again'));
  });

  it('commits the drop once through SortableJS onEnd and registers one undo', () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    const { onPlanChange, onRegisterUndo, stripRef } = mount();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toBe(stripRef.current);
    const options = createSpy.mock.calls[0][1];
    expect(options.forceFallback).toBe(true);
    expect(options.fallbackTolerance).toBe(4);
    options.onStart();
    expect(document.documentElement.hasAttribute('data-merge-page-dragging')).toBe(true);
    options.onEnd({ oldIndex: 0, newIndex: 3 });
    expect(document.documentElement.hasAttribute('data-merge-page-dragging')).toBe(false);
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.results[0].value.map((p) => p.key)).toEqual(['1:1', '2:0', '2:1', '1:0']);
    expect(onRegisterUndo).toHaveBeenCalledTimes(1);
    options.onEnd({ oldIndex: 2, newIndex: 2 });
    expect(onPlanChange).toHaveBeenCalledTimes(1);
  });

  it('reports the first keyboard (not pointer) focus of a page cell, once', () => {
    const onFirstKeyboardFocus = vi.fn();
    mount({ props: { onFirstKeyboardFocus } });
    const [first, second] = cards();

    // A pointer-driven focus (mousedown then focus, as a real click does)
    // must not count.
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    first.focus();
    expect(onFirstKeyboardFocus).not.toHaveBeenCalled();

    // A keyboard-driven focus (Tab: a keydown, then focus lands) counts,
    // and only the first one fires anything the parent need act on.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    second.focus();
    expect(onFirstKeyboardFocus).toHaveBeenCalledTimes(1);
  });

  // Phone (Shlomi, 2026-09-13): there is no Edit pages mode any more - a tap
  // on a page reveals that page's own cluster, and only that page's.
  it('a click selects a page (data-selected), a second click on it clears the selection', async () => {
    mount();
    const [first] = cards();
    expect(first.hasAttribute('data-selected')).toBe(false);

    await act(async () => first.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(first.hasAttribute('data-selected')).toBe(true);

    await act(async () => first.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(first.hasAttribute('data-selected')).toBe(false);
  });

  it('clicking another page moves the selection to it', async () => {
    mount();
    const [first, second] = cards();

    await act(async () => first.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(first.hasAttribute('data-selected')).toBe(true);

    await act(async () => second.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(first.hasAttribute('data-selected')).toBe(false);
    expect(second.hasAttribute('data-selected')).toBe(true);
  });

  it("a click on one of the cluster's own buttons does not change the selection", async () => {
    const { onPlanChange } = mount();
    const [first] = cards();

    await act(async () => first.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(first.hasAttribute('data-selected')).toBe(true);

    // Rotate: bubbles up through the li, whose own click handler must not
    // treat a click that started on a button as a tap on the page.
    await act(async () => first.querySelectorAll(`.${styles.action}`)[0].click());
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(first.hasAttribute('data-selected')).toBe(true);
  });

  it('a pointerdown outside the grid clears the selection', async () => {
    mount();
    const [first] = cards();
    await act(async () => first.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(first.hasAttribute('data-selected')).toBe(true);

    await act(async () => document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(first.hasAttribute('data-selected')).toBe(false);
  });
});
