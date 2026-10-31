// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startCommentGesture } from './commentGesture.ts';
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

/** The press lands at pixel (px, py) of the 300x400 page; the container rect is the page. */
function setup(px = 30, py = 107, withCanvas = true, direction?: 'ltr' | 'rtl') {
  const canvas = { width: W, height: H, getContext: () => ({ getImageData }) };
  const container = {
    parentElement: { querySelector: () => (withCanvas ? canvas : null) },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  } as unknown as HTMLElement;
  const node = document.createElement('div');
  const draft = document.createElement('div');
  draft.setAttribute('data-highlight-draft', '');
  node.appendChild(draft);
  const dispatch = vi.fn();
  const gestureCancelRef: { current: (() => void) | null } = { current: null };
  const setAnnouncement = vi.fn();
  const newEl = { id: 'c1', type: 'comment' } as unknown as EditorElement;
  startCommentGesture(
    {
      dispatch,
      getPointerPercent: (e) => ({ x: ((e as MouseEvent).clientX / W) * 100, y: ((e as MouseEvent).clientY / H) * 100 }),
      gestureCancelRef,
      setAnnouncement,
      messages: englishSignMessages,
      pageGeometry: { width: W, height: H } as never,
      isMouse: true,
      direction,
    },
    { pageIndex: 0, container, id: 'c1', newEl, start: { x: (px / W) * 100, y: (py / H) * 100 }, getElementNode: () => node },
  );
  return { dispatch, draft, node, gestureCancelRef, setAnnouncement };
}

const move = (x: number, y: number) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
const release = () => window.dispatchEvent(new MouseEvent('mouseup'));
const types = (d: ReturnType<typeof vi.fn>) => d.mock.calls.map(([a]) => a.type);
const update = (d: ReturnType<typeof vi.fn>) => d.mock.calls.find(([a]) => a.type === 'UPDATE_ELEMENT')![0].payload.changes;

afterEach(() => release());

describe('startCommentGesture', () => {
  it('a swipe over text commits once: a passage anchor with bands as the box union, then DISARM_TOOL, no history', () => {
    const { dispatch, draft } = setup();
    move(60, 107);
    move(100, 147);
    expect(dispatch).not.toHaveBeenCalled();
    expect(draft.childElementCount).toBeGreaterThan(0);
    release();
    expect(types(dispatch)).toEqual(['UPDATE_ELEMENT', 'DISARM_TOOL']);
    const changes = update(dispatch);
    expect(changes.anchor.kind).toBe('passage');
    expect(changes.anchor.bands).toHaveLength(2);
    expect(changes.anchor).not.toHaveProperty('direction');
    expect(changes.width).toBeGreaterThan(0);
    expect(draft.childElementCount).toBe(0);
  });
  it('records an rtl direction on the anchor', () => {
    const { dispatch } = setup(30, 107, true, 'rtl');
    move(10, 107);
    release();
    expect(update(dispatch).anchor.direction).toBe('rtl');
  });
  it('a press that moves under 4px is a pin: a square box centered on the press', () => {
    const { dispatch } = setup(150, 200);
    move(152, 201);
    release();
    const changes = update(dispatch);
    expect(changes.anchor).toEqual({ kind: 'point' });
    expect(changes.width).toBeCloseTo(2.4);
    expect(changes.left).toBeCloseTo(50 - 1.2);
    // square in pixels: 2.4% of 300 = 7.2px, so the height is 7.2 / 400 = 1.8%
    expect(changes.height).toBeCloseTo(1.8);
    expect(changes.top).toBeCloseTo(50 - 0.9);
    expect(types(dispatch)).toEqual(['UPDATE_ELEMENT', 'DISARM_TOOL']);
  });
  it('a swipe the reader cannot read (no bands) pins at the press', () => {
    const { dispatch } = setup(150, 200, false);
    move(250, 200);
    release();
    expect(update(dispatch).anchor).toEqual({ kind: 'point' });
  });
  it('a swipe that starts on blank page pins at the press, with no passage draft', () => {
    const { dispatch, draft } = setup(150, 250);
    move(250, 250);
    expect(draft.childElementCount).toBe(0);
    release();
    expect(update(dispatch).anchor).toEqual({ kind: 'point' });
  });
  it('keeps the pin on the page near an edge', () => {
    const { dispatch } = setup(1, 1);
    release();
    const changes = update(dispatch);
    expect(changes.left).toBeGreaterThanOrEqual(0);
    expect(changes.top).toBeGreaterThanOrEqual(0);
  });
  it('announces the placement', () => {
    const { setAnnouncement } = setup(150, 200);
    release();
    expect(setAnnouncement).toHaveBeenCalledTimes(1);
  });
  it('never keeps the element active or selects anything else on commit', () => {
    const { dispatch } = setup();
    move(60, 107);
    release();
    expect(types(dispatch)).not.toContain('SET_ACTIVE_ELEMENT_ID');
    expect(types(dispatch)).not.toContain('ADD_ACTION_HISTORY');
  });
  it('deletes the provisional element when cancelled', () => {
    const { dispatch, gestureCancelRef, draft } = setup();
    move(60, 107);
    gestureCancelRef.current?.();
    expect(dispatch.mock.calls.find(([a]) => a.type === 'DELETE_ELEMENT')![0].payload).toBe('c1');
    expect(types(dispatch)).not.toContain('UPDATE_ELEMENT');
    expect(draft.childElementCount).toBe(0);
  });
});
