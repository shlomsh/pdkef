// @ts-nocheck - test-only, mirrors PdfMergeTool.test.tsx's untyped style
import { render } from 'preact';
import { createRef } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sortable from 'sortablejs';
import PageStrip from './PageStrip.tsx';
import styles from './PageStrip.module.css';
import { planForFile } from '../../lib/mergePlan.ts';
import { englishMergeMessages } from '../../i18n/toolMessages';
import * as thumbnailsLib from '../../lib/thumbnails.js';

const sources = [];

vi.mock('../../lib/thumbnails.js', () => ({
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
    const onPlanChange = vi.fn();
    const announce = vi.fn();
    const stripRef = createRef();
    container = document.createElement('div');
    document.body.appendChild(container);
    const props = {
      entries,
      plan,
      onPlanChange,
      announce,
      messages: englishMergeMessages,
      countLabel: '4 pages',
      editing: false,
      onToggleEditing: vi.fn(),
      stripRef,
      ...overrides.props,
    };
    act(() => {
      render(<PageStrip {...props} />, container);
    });
    const rerender = (next) => act(() => { render(<PageStrip {...props} {...next} />, container); });
    return { entries, plan, onPlanChange, announce, stripRef, rerender };
  }

  const cards = () => Array.from(container.querySelectorAll(`.${styles.page}`));

  it('renders one card per plan entry in order, with a divider at each file boundary', () => {
    mount();
    expect(cards().map((card) => card.dataset.key)).toEqual(['1:0', '1:1', '2:0', '2:1']);
    expect(container.querySelectorAll(`.${styles.divider}`)).toHaveLength(1);
    expect(container.querySelector(`.${styles.count}`).textContent).toContain('4 pages');
  });

  it('renders thumbnails only for cards near the viewport, one pdf.js document per file, and releases a removed file', async () => {
    const { rerender, entries } = mount();
    expect(thumbnailsLib.openThumbnailSource).not.toHaveBeenCalled();

    await act(async () => {
      observers.at(-1).intersect(['1:1', '2:0']);
      await flush(20);
    });
    expect(thumbnailsLib.openThumbnailSource).toHaveBeenCalledTimes(2);
    const imgs = Array.from(container.querySelectorAll(`.${styles.thumb}`)).map((img) => img.getAttribute('src'));
    expect(imgs).toEqual(['data:image/png;base64,a.pdf-1', 'data:image/png;base64,b.pdf-0']);

    // Removing file 1 cancels its renders and destroys its document.
    rerender({ entries: [entries[1]], plan: planForFile(2, 2) });
    await act(async () => { await flush(5); });
    const sourceA = sources.find((s) => s.file.name === 'a.pdf');
    expect(sourceA.destroy).toHaveBeenCalled();
    expect(cards().map((card) => card.dataset.key)).toEqual(['2:0', '2:1']);
  });

  it('rotate and skip commit a new plan once per tap and announce it (MERGE-09)', async () => {
    const { onPlanChange, announce } = mount();
    const first = cards()[0];
    await act(async () => first.querySelectorAll(`.${styles.action}`)[0].click());
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.calls[0][0][0]).toMatchObject({ key: '1:0', rotation: 90 });
    expect(announce).toHaveBeenCalledWith('Page 1 rotated to 90 degrees.');

    await act(async () => first.querySelectorAll(`.${styles.action}`)[1].click());
    expect(onPlanChange).toHaveBeenCalledTimes(2);
    expect(onPlanChange.mock.calls[1][0][0]).toMatchObject({ key: '1:0', skipped: true });
    expect(announce).toHaveBeenLastCalledWith(expect.stringContaining('Page 1 skipped'));
  });

  it('shows a skipped page dimmed with its number struck, and one tap brings it back', async () => {
    const plan = [...planForFile(1, 2), ...planForFile(2, 2)];
    plan[2] = { ...plan[2], skipped: true };
    const { onPlanChange } = mount({ plan });
    const card = cards()[2];
    expect(card.hasAttribute('data-skipped')).toBe(true);
    expect(card.textContent).toContain('Skipped');
    expect(container.querySelector(`.${styles.count}`).textContent).toContain('1 skipped');
    await act(async () => card.querySelectorAll(`.${styles.action}`)[1].click());
    expect(onPlanChange.mock.calls[0][0][2]).toMatchObject({ key: '2:0', skipped: false });
  });

  it('keyboard: arrows move across files, R rotates, Delete skips, Enter opens the preview', async () => {
    const { onPlanChange } = mount();
    const card = cards()[1];
    card.focus();
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    // Moving page 2 of file 1 past page 1 of file 2 crosses a file boundary.
    const moved = onPlanChange.mock.calls[0][0];
    expect(moved.map((p) => p.key)).toEqual(['1:0', '2:0', '1:1', '2:1']);

    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })));
    expect(onPlanChange.mock.calls[1][0][1]).toMatchObject({ key: '1:1', rotation: 90 });

    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
    expect(onPlanChange.mock.calls[2][0][1]).toMatchObject({ key: '1:1', skipped: true });

    await act(async () => {
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flush(20);
    });
    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Page 2 of 4');
  });

  it('commits the drop once through SortableJS onEnd', () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    const { onPlanChange, stripRef } = mount();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toBe(stripRef.current);
    const options = createSpy.mock.calls[0][1];
    options.onEnd({ oldIndex: 0, newIndex: 3 });
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.calls[0][0].map((p) => p.key)).toEqual(['1:1', '2:0', '2:1', '1:0']);
    options.onEnd({ oldIndex: 2, newIndex: 2 });
    expect(onPlanChange).toHaveBeenCalledTimes(1);
  });

  it('exposes the per-page controls on touch only after Edit pages', () => {
    const { rerender } = mount();
    const strip = container.querySelector(`.${styles.strip}`);
    expect(strip.hasAttribute('data-editing')).toBe(false);
    rerender({ editing: true });
    expect(strip.hasAttribute('data-editing')).toBe(true);
    expect(container.querySelector(`.${styles['edit-toggle']}`).textContent).toBe('Done');
  });
});
