// @ts-nocheck - test-only, mirrors PdfMergeTool.test.tsx's untyped style
import { render } from 'preact';
import { createRef } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sortable from 'sortablejs';
// Asserts the .action class on the save link: a cell action is styled as one of the card's actions.
import styles from '../../shell/pageGrid/PageGrid.module.css';
import PageGrid, { cellEdge } from '../../shell/pageGrid/PageGrid.tsx';
import { planForFile } from '../../lib/pages/pagePlan.ts';
import { englishMergeMessages } from '../../tools/merge/messages';
import * as thumbnailsLib from '../../lib/pdf/thumbnails.js';

const sources = [];
// What each mocked file reports for its page sizes; null = the source cannot say (the thumbnail's own size is used).
const probe = vi.hoisted(() => ({ aspects: null as number[] | null }));

vi.mock('../../lib/pdf/thumbnails.js', () => ({
  openThumbnailSource: vi.fn(async (file) => {
    const source = {
      file,
      pageCount: 2,
      aspects: vi.fn(async () => probe.aspects),
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

// Whether every file's pages sit in one contiguous run (Merge's isGrouped,
// restated here so the shell test does not reach into a tool).
const isGrouped = (plan) => plan.every((entry, i) => plan.findIndex((p) => p.fileId === entry.fileId) === i
  || plan[i - 1].fileId === entry.fileId);

describe('PageGrid', () => {
  let container;
  let originalIO;

  beforeEach(() => {
    sources.length = 0;
    probe.aspects = null;
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
    const onRenderedCountChange = vi.fn();
    const onRemoveFile = vi.fn();
    const gridRef = createRef();
    container = document.createElement('div');
    document.body.appendChild(container);
    const props = {
      sources: entries,
      plan,
      onPlanChange,
      announce,
      messages: englishMergeMessages,
      labelledBy: 'page-grid-heading',
      grouped: overrides.grouped ?? isGrouped(plan),
      labelSources: true,
      gridRef,
      onRenderedCountChange,
      onRemoveFile,
      ...overrides.props,
    };
    act(() => {
      render(<PageGrid {...props} />, container);
    });
    const rerender = (next) => act(() => { render(<PageGrid {...props} {...next} />, container); });
    return { entries, plan, onPlanChange, announce, onRemoveFile, gridRef, rerender };
  }

  const cards = () => Array.from(container.querySelectorAll('[data-key]'));
  const captions = () => Array.from(container.querySelectorAll('[data-caption-for]'));
  const cellTagName = (card) => card.querySelector('[dir="auto"]');

  it('renders one card per plan entry in order, in one continuous grid with no row-break items', () => {
    mount();
    expect(cards().map((card) => card.dataset.key)).toEqual(['1:0', '1:1', '2:0', '2:1']);
    // Two two-page files: each run is 1 to 3 pages, so item 1 says tag only,
    // no caption row and nothing that would force a row break.
    expect(captions()).toHaveLength(0);
    expect(container.querySelector('[data-page-grid]').children).toHaveLength(cards().length);
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
    expect(container.querySelectorAll('[dir="auto"]')).toHaveLength(0);
    const grid = container.querySelector('[data-page-grid]');
    expect(grid.hasAttribute('data-grouped')).toBe(false);
  });

  // Shlomi's reduction (wave 2): captions are labels now, no actions -
  // "rotate all" is gone and "remove" lives only in the rail row, so the
  // caption itself carries no buttons at all.
  it('without labelSources there is no caption, tag, band or grouping, even for a long run', () => {
    const entries = [{ id: 1, file: makeFile('a.pdf'), pageCount: 6, error: null }];
    mount({ entries, plan: planForFile(1, 6), props: { labelSources: false } });
    expect(container.querySelector('[data-caption-for]')).toBeNull();
    expect(container.querySelector('[data-band]')).toBeNull();
    expect(container.querySelector('[dir="auto"], [aria-hidden="true"][style]')).toBeNull();
    expect(container.querySelector('[data-page-grid]').hasAttribute('data-grouped')).toBe(false);
    expect(cards()).toHaveLength(6);
  });

  it('exposes the stable hooks Merge styles through', () => {
    mount();
    expect(container.querySelector('ul[data-page-grid]')).not.toBeNull();
    expect(container.querySelectorAll('[data-thumb-box]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-page-number]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-band]')).toHaveLength(4);
  });

  it('a caption carries no interactive controls, only the label', () => {
    const entries = [{ id: 1, file: makeFile('a.pdf'), pageCount: 4, error: null }];
    mount({ entries, plan: planForFile(1, 4) });
    expect(container.querySelectorAll('[data-caption-for] button')).toHaveLength(0);
  });

  it('renders thumbnails only for cards near the viewport, one pdf.js document per file, and releases a removed file', async () => {
    const { rerender, entries } = mount();
    // Each file opens once up front, to read its page sizes; no page renders until it nears the viewport.
    await waitFor(() => thumbnailsLib.openThumbnailSource.mock.calls.length === 2);
    expect(container.querySelectorAll('[data-thumb-box] img')).toHaveLength(0);

    await act(async () => { observers.at(-1).intersect(['1:1', '2:0']); });
    await waitFor(() => container.querySelectorAll('[data-thumb-box] img').length === 2);
    expect(thumbnailsLib.openThumbnailSource).toHaveBeenCalledTimes(2);
    const imgs = Array.from(container.querySelectorAll('[data-thumb-box] img')).map((img) => img.getAttribute('src'));
    expect(imgs).toEqual(['data:image/png;base64,a.pdf-1', 'data:image/png;base64,b.pdf-0']);
    expect(Array.from(container.querySelectorAll('[data-thumb-box] img')).every((img) => img.draggable === false)).toBe(true);

    // Removing file 1 cancels its renders and destroys its document.
    rerender({ sources: [entries[1]], plan: planForFile(2, 2) });
    const sourceA = sources.find((s) => s.file.name === 'a.pdf');
    await waitFor(() => sourceA.destroy.mock.calls.length > 0);
    expect(sourceA.destroy).toHaveBeenCalled();
    expect(cards().map((card) => card.dataset.key)).toEqual(['2:0', '2:1']);
  });

  // DEBT-65: the span comes from the PDF's own page sizes, so a landscape page is two cells wide
  // before any thumbnail renders and nothing refits when one arrives.
  it('lays a landscape page out from the page size, before its thumbnail renders', async () => {
    probe.aspects = [1.5, 0.77];
    mount();
    await waitFor(() => cards()[0].style.gridColumn === 'span 2');
    expect(container.querySelectorAll('[data-thumb-box] img')).toHaveLength(0);
    expect(cards()[0].style.getPropertyValue('--cell-w')).toBe('144px');
    expect(cards()[1].style.gridColumn).not.toBe('span 2');
  });

  it('holds the grid back while a file is still being read, then shows it once the sizes are in', async () => {
    probe.aspects = [1.5, 0.77];
    const entries = [{ id: 1, file: makeFile('a.pdf'), pageCount: null, error: null }];
    const { rerender } = mount({ entries, plan: planForFile(1, 2) });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(container.querySelector('[data-fit-settled]')).toBeNull();

    rerender({ sources: [{ ...entries[0], pageCount: 2 }], plan: planForFile(1, 2) });
    await waitFor(() => container.querySelector('[data-fit-settled]') != null);
  });

  // Review P1/D2: a landscape cell used to swap the portrait box's own
  // width and height wholesale, which shrank the cell into the portrait
  // box's (shorter) width and broke row alignment with its neighbours. Every
  // cell now keeps the SAME fixed height, and a landscape page takes a
  // landscape WIDTH for that height instead.
  it('gives a landscape page a fixed cell height and a width scaled to its aspect', async () => {
    mount();
    await act(async () => { observers.at(-1).intersect(['1:0']); });
    await waitFor(() => container.querySelectorAll('[data-thumb-box] img').length === 1);
    const img = container.querySelector('[data-thumb-box] img');
    // A landscape source image, 1.5:1.
    Object.defineProperty(img, 'naturalWidth', { value: 300, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await act(async () => { img.dispatchEvent(new Event('load')); });

    const page = cards()[0];
    // jsdom's window.matchMedia stub (src/test/support/setup.js) always matches, so
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
  it('rotate, hide/show and open each carry a short tooltip word', () => {
    const { rerender } = mount();
    const first = cards()[0];
    const [rotateButton, skipButton, openButton] = first.querySelectorAll('button[aria-label], a[aria-label]');
    expect(rotateButton.querySelector('[data-tip]').textContent).toBe('Rotate');
    expect(skipButton.querySelector('[data-tip]').textContent).toBe('Hide');
    expect(skipButton.getAttribute('aria-label')).toBe('Hide page 1 from the merged PDF');
    expect(openButton.querySelector('[data-tip]').textContent).toBe('Open');

    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    plan[0] = { ...plan[0], skipped: true };
    rerender({ plan });
    const [, skipButtonAfter] = cards()[0].querySelectorAll('button[aria-label], a[aria-label]');
    expect(skipButtonAfter.querySelector('[data-tip]').textContent).toBe('Show');
    expect(skipButtonAfter.getAttribute('aria-label')).toBe('Show page 1 in the merged PDF');
  });

  it('rotate and skip commit a new plan once per tap and announce it (MERGE-09)', async () => {
    const { onPlanChange, announce } = mount();
    const first = cards()[0];
    await act(async () => first.querySelectorAll('button[aria-label], a[aria-label]')[0].click());
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.results[0].value[0]).toMatchObject({ key: '1:0', rotation: 90 });
    expect(announce).toHaveBeenCalledWith('Page 1 rotated to 90 degrees.');

    await act(async () => first.querySelectorAll('button[aria-label], a[aria-label]')[1].click());
    expect(onPlanChange).toHaveBeenCalledTimes(2);
    expect(onPlanChange.mock.results[1].value[0]).toMatchObject({ key: '1:0', skipped: true });
    expect(announce).toHaveBeenLastCalledWith(expect.stringContaining('Page 1 skipped'));
  });

  it('shows a skipped page dimmed with its number struck and the word "skipped", and one tap brings it back', async () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    plan[2] = { ...plan[2], skipped: true };
    const { onPlanChange } = mount({ plan });
    const card = cards()[2];
    expect(card.hasAttribute('data-skipped')).toBe(true);
    expect(card.textContent).toContain('skipped');
    // The state line exists for every page, so toggling skipped never changes
    // one card's flex height and shifts its thumbnail above its neighbours.
    expect(cards().every((item) => item.querySelector('[data-page-number] + span'))).toBe(true);
    expect(cards()[0].querySelector('[data-page-number] + span').hasAttribute('data-visible')).toBe(false);
    expect(card.querySelector('[data-page-number] + span').hasAttribute('data-visible')).toBe(true);
    // Numbers are output positions: the skipped page shows the number it
    // would take, and the page after it takes that number for real.
    expect(cards().map((c) => c.querySelector('[data-page-number]').textContent)).toEqual(['1', '2', '3', '3']);
    expect(cards()[3].getAttribute('aria-label')).toBe('Page 3 of 3, from b.pdf');
    await act(async () => card.querySelectorAll('button[aria-label], a[aria-label]')[1].click());
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

  it('the card\'s shortcuts apply to the card only: Enter on Rotate rotates once and a key on a cluster control is not the card\'s', async () => {
    const { onPlanChange } = mount();
    const card = cards()[0];
    const rotate = card.querySelectorAll('button[aria-label], a[aria-label]')[0];
    rotate.focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => rotate.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(false);
    for (const key of ['r', 'Delete', 'ArrowRight']) {
      await act(async () => rotate.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
    }
    expect(onPlanChange).not.toHaveBeenCalled();
    await act(async () => rotate.click());
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.results[0].value[0]).toMatchObject({ key: '1:0', rotation: 90 });
    await act(async () => { await flush(30); });
    expect(container.querySelector('dialog')).toBeNull();
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

  it('commits the drop once through SortableJS onEnd', () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    const { onPlanChange, gridRef } = mount();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toBe(gridRef.current);
    const options = createSpy.mock.calls[0][1];
    expect(options.forceFallback).toBe(true);
    expect(options.fallbackTolerance).toBe(4);
    options.onStart();
    expect(document.documentElement.hasAttribute('data-page-dragging')).toBe(true);
    options.onEnd({ oldIndex: 0, newIndex: 3 });
    expect(document.documentElement.hasAttribute('data-page-dragging')).toBe(false);
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.results[0].value.map((p) => p.key)).toEqual(['1:1', '2:0', '2:1', '1:0']);
    options.onEnd({ oldIndex: 2, newIndex: 2 });
    expect(onPlanChange).toHaveBeenCalledTimes(1);
  });

  it('focus returns to a keyboard-moved card, but never yanks it back from a field outside the grid', async () => {
    const { rerender, plan } = mount();
    const field = document.createElement('input');
    document.body.appendChild(field);
    try {
      const card = cards()[1];
      card.focus();
      await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
      cards()[1].blur();
      const moved = [plan[0], plan[2], plan[1], plan[3]];
      rerender({ plan: moved });
      expect(document.activeElement).toBe(container.querySelector('[data-key="1:1"]'));
      // The restore was used up: a later plan change leaves a field's focus alone.
      field.focus();
      rerender({ plan: [...moved].reverse() });
      expect(document.activeElement).toBe(field);
      // And a plain focus on a cell (no keyboard move) is not remembered either.
      cards()[0].focus();
      field.focus();
      rerender({ plan });
      expect(document.activeElement).toBe(field);
    } finally {
      field.remove();
    }
  });

  it('carries data-reorderable only when tiles can be dragged', () => {
    mount();
    expect(container.querySelector('[data-page-grid]').hasAttribute('data-reorderable')).toBe(true);
    act(() => render(null, container));
    mount({ props: { reorderable: false } });
    expect(container.querySelector('[data-page-grid]').hasAttribute('data-reorderable')).toBe(false);
  });

  it('reorderable={false}: no Sortable, no move keys, but rotate and skip keys still work', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    const { onPlanChange, announce } = mount({ props: { reorderable: false } });
    expect(createSpy).not.toHaveBeenCalled();
    const card = cards()[1];
    card.focus();
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(onPlanChange).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })));
    expect(onPlanChange.mock.results[0].value[1]).toMatchObject({ key: '1:1', rotation: 90 });
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
    expect(onPlanChange.mock.results[1].value[1]).toMatchObject({ key: '1:1', skipped: true });
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
    await act(async () => first.querySelectorAll('button[aria-label], a[aria-label]')[0].click());
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

  describe('cellAction', () => {
    const action = (entry) => ((entry.fileId === 1 && entry.pageIndex === 0) ? { href: 'blob:one', download: 'a-1.png', label: 'Save page 1 as an image', tip: 'Save' } : null);
    const saveLinks = (card) => card.querySelectorAll('a[download]');

    it('adds a download link as the fourth control for a cell the callback answers, and nothing for null', () => {
      mount({ props: { cellAction: action } });
      const [first, second] = cards();
      expect(first.querySelectorAll('button')).toHaveLength(3);
      const link = saveLinks(first)[0];
      expect(link.getAttribute('href')).toBe('blob:one');
      expect(link.getAttribute('download')).toBe('a-1.png');
      expect(link.getAttribute('aria-label')).toBe('Save page 1 as an image');
      expect(link.classList.contains(styles.action)).toBe(true);
      expect(link.querySelector('[data-tip]').textContent).toBe('Save');
      expect([...first.querySelectorAll('button[aria-label], a[aria-label]')].at(-1)).toBe(link);
      expect(saveLinks(second)).toHaveLength(0);
      expect(second.querySelectorAll('button')).toHaveLength(3);
    });

    it('renders exactly three controls without the prop', () => {
      mount();
      expect(container.querySelectorAll('a[download]')).toHaveLength(0);
      expect(cards()[0].querySelectorAll('button[aria-label], a[aria-label]')).toHaveLength(3);
    });

    it('Enter on the focused link is the link\'s own: no preview, not prevented', async () => {
      mount({ props: { cellAction: action } });
      const link = saveLinks(cards()[0])[0];
      link.focus();
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      await act(async () => link.dispatchEvent(enter));
      expect(enter.defaultPrevented).toBe(false);
      await act(async () => { await flush(30); });
      expect(container.querySelector('dialog')).toBeNull();
    });

    it('a click on it calls onActivate, keeps the browser download, and does not select the cell', async () => {
      const onActivate = vi.fn();
      mount({ props: { cellAction: (entry) => ((entry.fileId === 1 && entry.pageIndex === 0) ? { href: 'blob:one', download: 'a-1.png', label: 'Save', tip: 'Save', onActivate } : null) } });
      const [first] = cards();
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      await act(async () => saveLinks(first)[0].dispatchEvent(click));
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(click.defaultPrevented).toBe(false);
      expect(first.hasAttribute('data-selected')).toBe(false);
    });
  });

  describe('cluster edge', () => {
    const rect = (left, width) => ({ left, right: left + width, width, top: 0, bottom: 100, height: 100 });
    const grid = rect(0, 300);

    it('cellEdge: the first and last cell of a row align to that edge, cells between stay centred', () => {
      expect(cellEdge(rect(0, 72), grid)).toBe('start');
      expect(cellEdge(rect(75, 72), grid)).toBeNull();
      expect(cellEdge(rect(150, 72), grid)).toBeNull();
      expect(cellEdge(rect(228, 72), grid)).toBe('end');
      // A row that does not fill the grid: its last cell is not at the edge.
      expect(cellEdge(rect(75, 72), grid)).toBeNull();
    });

    it('cellEdge mirrors in a right-to-left grid, and a lone full-width cell takes start', () => {
      expect(cellEdge(rect(0, 72), grid, true)).toBe('end');
      expect(cellEdge(rect(228, 72), grid, true)).toBe('start');
      expect(cellEdge(rect(0, 300), grid)).toBe('start');
    });

    it('marks each rendered cell from its place in the grid', () => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.hasAttribute('data-page-grid')) return grid;
        const index = Array.from(this.parentElement.children).indexOf(this);
        return rect(index * 76, 72);
      });
      mount();
      expect(cards().map((card) => card.getAttribute('data-edge'))).toEqual(['start', null, null, 'end']);
    });
  });
});
