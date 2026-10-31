// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startHighlightSwipe } from './highlightSwipeGesture.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';

const W = 300;
const H = 400;
const rects: Array<[number, number, number, number]> = [];
for (const y of [100, 140]) for (const x of [20, 90]) rects.push([x, y, 40, 14]);

function getImageData(sx: number, sy: number, w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x, y, rw, rh] of rects) {
    for (let j = y; j < y + rh; j += 1) {
      for (let i = x; i < x + rw; i += 1) {
        const px = i - sx;
        const py = j - sy;
        if (px >= 0 && px < w && py >= 0 && py < h) data.fill(0, (py * w + px) * 4, (py * w + px) * 4 + 3);
      }
    }
  }
  return { data, width: w, height: h };
}

function setup(isMouse = true, direction?: 'ltr' | 'rtl') {
  const canvas = { width: W, height: H, getContext: () => ({ getImageData }) };
  const container = { parentElement: { querySelector: () => canvas } } as unknown as HTMLElement;
  const node = document.createElement('div');
  const draft = document.createElement('div');
  draft.setAttribute('data-highlight-draft', '');
  node.appendChild(draft);
  const dispatch = vi.fn();
  const gestureCancelRef: { current: (() => void) | null } = { current: null };
  const newEl = { id: 'h1', type: 'highlight', color: '#9CF27A' } as unknown as EditorElement;
  startHighlightSwipe(
    {
      dispatch,
      getPointerPercent: (e) => ({ x: ((e as MouseEvent).clientX / W) * 100, y: ((e as MouseEvent).clientY / H) * 100 }),
      gestureCancelRef,
      logAction: vi.fn(),
      setAnnouncement: vi.fn(),
      messages: englishSignMessages,
      nextElementIndex: 0,
      isMouse,
      direction,
    },
    { pageIndex: 0, container, id: 'h1', newEl, start: { x: (30 / W) * 100, y: (107 / H) * 100 }, getElementNode: () => node },
  );
  return { dispatch, draft, gestureCancelRef };
}

const move = (x: number, y: number) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
const release = () => window.dispatchEvent(new MouseEvent('mouseup'));
const types = (d: ReturnType<typeof vi.fn>) => d.mock.calls.map(([a]) => a.type);

afterEach(() => release());

describe('startHighlightSwipe', () => {
  it('dispatches nothing until release, then one UPDATE_ELEMENT with bands and DISARM_TOOL', () => {
    const { dispatch, draft } = setup();
    move(60, 107);
    move(100, 147);
    expect(dispatch).not.toHaveBeenCalled();
    expect(draft.childElementCount).toBeGreaterThan(0);
    release();
    expect(types(dispatch)).toEqual(['UPDATE_ELEMENT', 'DISARM_TOOL']);
    expect(dispatch.mock.calls[0][0].payload.changes.bands).toHaveLength(2);
    expect(draft.childElementCount).toBe(0);
  });

  it('an RTL swipe records its direction on the highlight; an LTR one leaves it absent', () => {
    const rtl = setup(true, 'rtl');
    move(10, 107);
    release();
    expect(rtl.dispatch.mock.calls[0][0].payload.changes.direction).toBe('rtl');
    const ltr = setup(true, 'ltr');
    move(60, 107);
    release();
    expect(ltr.dispatch.mock.calls[0][0].payload.changes).not.toHaveProperty('direction');
  });

  it('deletes the element when cancelled', () => {
    const { dispatch, gestureCancelRef, draft } = setup();
    move(60, 107);
    gestureCancelRef.current?.();
    expect(types(dispatch)).toContain('DELETE_ELEMENT');
    expect(dispatch.mock.calls.find(([a]) => a.type === 'DELETE_ELEMENT')![0].payload).toBe('h1');
    expect(types(dispatch)).not.toContain('UPDATE_ELEMENT');
    expect(draft.childElementCount).toBe(0);
  });

  it('a mouse swipe swallows its trailing click once, and a later click gets through', () => {
    const page = document.createElement('div');
    document.body.appendChild(page);
    const seen = vi.fn();
    page.addEventListener('click', seen);
    setup();
    move(60, 107);
    release();
    page.click();
    expect(seen).not.toHaveBeenCalled();
    page.click();
    expect(seen).toHaveBeenCalledTimes(1);
    page.remove();
  });

  it('a touch swipe arms nothing', () => {
    const page = document.createElement('div');
    document.body.appendChild(page);
    const seen = vi.fn();
    page.addEventListener('click', seen);
    setup(false);
    move(60, 107);
    release();
    page.click();
    expect(seen).toHaveBeenCalledTimes(1);
    page.remove();
  });
});
