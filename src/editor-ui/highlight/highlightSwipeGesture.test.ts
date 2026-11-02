// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startHighlightSwipe } from './highlightSwipeGesture.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';

type SwipeReaderOption = NonNullable<Parameters<typeof startHighlightSwipe>[0]['reader']> | null;

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

function setup(isMouse = true, direction?: 'ltr' | 'rtl', reader?: SwipeReaderOption, getContext: () => unknown = () => ({ getImageData }), paintDraft?: (node: HTMLElement, geometry: unknown) => void, directionAt?: (point: { x: number; y: number }) => 'ltr' | 'rtl') {
  const canvas = { width: W, height: H, getContext };
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
      ...(reader !== undefined ? { reader } : {}),
      ...(paintDraft ? { paintDraft } : {}),
      ...(directionAt ? { directionAt } : {}),
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

describe('startHighlightSwipe with a given reader', () => {
  it('uses the reader it is given and reads no canvas', () => {
    const getContext = vi.fn(() => ({ getImageData }));
    const band = { left: 10, top: 20, width: 30, height: 5 };
    const reader = { bandsBetween: vi.fn(() => [band]), onText: vi.fn(), onLine: vi.fn() };
    const { dispatch } = setup(true, undefined, reader as never, getContext);
    move(60, 107);
    release();
    expect(getContext).not.toHaveBeenCalled();
    expect(reader.bandsBetween).toHaveBeenCalled();
    expect(types(dispatch)).toEqual(['UPDATE_ELEMENT', 'DISARM_TOOL']);
  });
});

describe('startHighlightSwipe with directionAt', () => {
  const band = { left: 10, top: 20, width: 30, height: 5 };
  const readerSpy = () => ({ bandsBetween: vi.fn((..._args: unknown[]) => [band]), onText: vi.fn(), onLine: vi.fn() });

  it('asks it at each move, passes the answer to the bands and commits the last one', () => {
    const reader = readerSpy();
    let answer: 'ltr' | 'rtl' = 'ltr';
    const { dispatch } = setup(true, undefined, reader as never, undefined, undefined, () => answer);
    move(60, 107);
    answer = 'rtl';
    move(20, 107);
    expect(reader.bandsBetween.mock.calls.at(-2)![2]).toBe('ltr');
    expect(reader.bandsBetween.mock.calls.at(-1)![2]).toBe('rtl');
    release();
    expect(dispatch.mock.calls[0][0].payload.changes.direction).toBe('rtl');
  });

  it('commits no direction when the last answer is ltr, whatever the fixed one was', () => {
    const { dispatch } = setup(true, 'rtl', readerSpy() as never, undefined, undefined, () => 'ltr');
    move(60, 107);
    release();
    expect(dispatch.mock.calls[0][0].payload.changes).not.toHaveProperty('direction');
  });

  it('absent, the fixed direction is passed to the bands as today', () => {
    const reader = readerSpy();
    setup(true, 'rtl', reader as never);
    move(60, 107);
    expect(reader.bandsBetween.mock.calls.at(-1)![2]).toBeUndefined();
  });
});

describe('paintDraft dep', () => {
  it('replaces the plain paint while swiping and clears with null on release', () => {
    const paintDraft = vi.fn();
    const { draft } = setup(true, undefined, undefined, undefined, paintDraft);
    move(150, 107);
    const last = paintDraft.mock.calls.at(-1)!;
    expect(last[1]).toMatchObject({ bands: expect.any(Array) });
    expect(last[1].bands.length).toBeGreaterThan(0);
    expect(draft.children).toHaveLength(0);
    release();
    expect(paintDraft.mock.calls.at(-1)![1]).toBeNull();
  });
});

describe('draft and commit agree', () => {
  const blankImageData = (_sx: number, _sy: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h });
  type Geometry = { bands: unknown[]; left: number; top: number; width: number; height: number };

  /** Runs a trace, returns the geometry painted on the last move and the one in the committed patch. */
  function run(trace: Array<[number, number]>, opts: { direction?: 'ltr' | 'rtl'; blank?: boolean; directionAt?: (p: { x: number; y: number }) => 'ltr' | 'rtl' } = {}) {
    const paintDraft = vi.fn();
    const getContext = () => ({ getImageData: opts.blank ? blankImageData : getImageData });
    const { dispatch } = setup(true, opts.direction, undefined, getContext, paintDraft, opts.directionAt);
    for (const [x, y] of trace) move(x, y);
    const drafted = paintDraft.mock.calls.filter(([, g]) => g).at(-1)![1] as Geometry;
    release();
    const changes = dispatch.mock.calls[0][0].payload.changes as Geometry & { direction?: string };
    return { drafted, changes };
  }

  function expectAgree(drafted: Geometry, changes: Geometry) {
    expect(drafted.bands.length).toBeGreaterThan(0);
    expect(changes.bands).toEqual(drafted.bands);
    for (const k of ['left', 'top', 'width', 'height'] as const) expect(changes[k]).toBeCloseTo(drafted[k], 2);
  }

  it('(a) a text page, left to right', () => {
    const { drafted, changes } = run([[60, 107], [100, 147]], { direction: 'ltr' });
    expectAgree(drafted, changes);
    expect(changes).not.toHaveProperty('direction');
  });

  it('(b) a text page, right to left', () => {
    const { drafted, changes } = run([[10, 107], [10, 147]], { direction: 'rtl' });
    expectAgree(drafted, changes);
    expect(changes.direction).toBe('rtl');
  });

  it('(c) a text-less page with a latched leftward first move, then a diagonal drag over three lines', () => {
    let latched: 'ltr' | 'rtl' | null = null;
    const directionAt = (p: { x: number; y: number }) => {
      if (!latched && Math.abs(p.x - (30 / W) * 100) > 2) latched = p.x < (30 / W) * 100 ? 'rtl' : 'ltr';
      return latched ?? 'ltr';
    };
    const { drafted, changes } = run([[10, 107], [60, 140], [120, 190], [200, 250]], { blank: true, directionAt });
    expectAgree(drafted, changes);
    expect(changes.direction).toBe('rtl');
  });

  it('(d) a last move that doubles back before release', () => {
    const { drafted, changes } = run([[60, 107], [200, 147], [40, 112]], { direction: 'ltr' });
    expectAgree(drafted, changes);
  });
});
