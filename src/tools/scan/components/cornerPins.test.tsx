import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CornerEditor from './CornerEditor.tsx';
import { nearestPinIndex, pulledTrace } from './cornerPins.tsx';
import { type Point, type Quad } from '#lib/pageEnhance/quad.ts';

const QUAD: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const LABELS = { group: 'Page corners', corners: ['TL', 'TR', 'BR', 'BL'] as [string, string, string, string], pin: 'Pinned point' };
// 200x100 box at (50, 20): a real rect, not jsdom's 0x0.
const RECT = { left: 50, top: 20, width: 200, height: 100, right: 250, bottom: 120, x: 50, y: 20, toJSON: () => ({}) };

/** 64 points: each side of QUAD from its corner, 16 steps. Index 7 is (0.45, 0.1), at client (140, 30). */
const TRACE: Point[] = Array.from({ length: 64 }, (_, i) => {
  const a = QUAD[Math.floor(i / 16)];
  const b = QUAD[(Math.floor(i / 16) + 1) % 4];
  const t = (i % 16) / 16;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
});

let container: HTMLElement | null = null;
interface Props { trace?: Point[] | null; pinned?: number[]; withPin?: boolean }
function mount({ trace = TRACE, pinned, withPin = true }: Props = {}) {
  const onPin = vi.fn<(i: number, at: Point) => void>();
  const onUnpin = vi.fn<(i: number) => void>();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<CornerEditor src="x.jpg" quad={QUAD} trace={trace} pinned={pinned} onPin={withPin ? onPin : undefined} onUnpin={onUnpin} onCommit={vi.fn()} labels={LABELS} />, container!));
  container.querySelector('[data-corner-frame]')!.getBoundingClientRect = () => RECT as DOMRect;
  return { onPin, onUnpin };
}
const hit = () => container!.querySelector<SVGGElement>('g[data-hit]')!;
const trace = () => container!.querySelector<SVGGElement>('g[data-trace]')!;
const lineAttrs = (g: Element) => Array.from(g.querySelectorAll('line')).map((l) => ['x1', 'y1', 'x2', 'y2'].map((a) => l.getAttribute(a)).join(' ')).join('|');
const pin = (i: number) => container!.querySelector<HTMLButtonElement>(`button[data-pin="${i}"]`)!;
const mouse = (type: string, x: number, y: number, target: EventTarget = window) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })); });
const key = (el: Element, k: string, shiftKey = false) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })); });

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('nearestPinIndex', () => {
  it('measures in screen pixels, so a wide frame does not favour its x axis', () => {
    // 5px right of index 7 and 5px below index 8's row: index 7 by pixels, though closer in x to 8 in unit space.
    expect(nearestPinIndex(TRACE, { x: 143, y: 30 }, RECT)).toBe(7);
  });
});

describe('pulledTrace', () => {
  const at = { x: 0.45, y: 0.14 }; // index 7 moved 0.04 down
  const dy = (points: Point[], i: number) => points[i].y - TRACE[i].y;

  it('moves the dragged point and pulls its three neighbours each way by 0.85, 0.5 and 0.15 of the move', () => {
    const out = pulledTrace(TRACE, 7, at, []);
    expect(out[7]).toEqual(at);
    [[6, 0.85], [8, 0.85], [5, 0.5], [9, 0.5], [4, 0.15], [10, 0.15]].forEach(([i, w]) => expect(dy(out, i)).toBeCloseTo(0.04 * w));
    [3, 11, 0, 16].forEach((i) => expect(out[i]).toEqual(TRACE[i]));
  });

  it('never moves a corner, a pinned point, or a point past a pin', () => {
    const out = pulledTrace(TRACE, 2, { x: 0.15, y: 0.14 }, [4]);
    expect(out[0]).toEqual(TRACE[0]);
    expect(dy(out, 1)).toBeCloseTo(0.04 * 0.85);
    expect(dy(out, 3)).toBeCloseTo(0.04 * 0.85);
    expect(out[4]).toEqual(TRACE[4]);
    expect(out[5]).toEqual(TRACE[5]);
  });
});

describe('CornerEditor pins', () => {
  it('pins the point nearest the press at the released place, once, and shows the move during the drag', () => {
    const { onPin } = mount();
    const before = lineAttrs(trace());
    mouse('mousedown', 143, 30, hit());
    mouse('mousemove', 143, 45);
    mouse('mousemove', 143, 60);
    expect(lineAttrs(trace())).not.toBe(before);
    expect(lineAttrs(hit())).toBe(lineAttrs(trace()));
    expect(onPin).not.toHaveBeenCalled();
    mouse('mouseup', 143, 60);
    expect(onPin).toHaveBeenCalledTimes(1);
    const [index, at] = onPin.mock.calls[0];
    expect(index).toBe(7);
    expect(at.x).toBeCloseTo(0.465, 2);
    expect(at.y).toBeCloseTo(0.4, 2);
  });

  it('places a dragged pin by the frame rect at the time of the move (the photo area scrolled)', () => {
    const { onPin } = mount();
    mouse('mousedown', 143, 30, hit());
    mouse('mousemove', 143, 60);
    container!.querySelector<HTMLElement>('[data-corner-frame]')!.getBoundingClientRect = () => ({ ...RECT, left: 0, top: 0, x: 0, y: 0 }) as DOMRect;
    mouse('mousemove', 100, 50); // (0.5, 0.5) of the frame now at (0, 0); the first rect would say (0.25, 0.3)
    mouse('mouseup', 100, 50);
    const [, at] = onPin.mock.calls[0];
    expect(at.x).toBeCloseTo(0.5, 2);
    expect(at.y).toBeCloseTo(0.5, 2);
  });

  it('keeps the trace visible while a pin is dragged', () => {
    mount();
    mouse('mousedown', 143, 30, hit());
    mouse('mousemove', 143, 60);
    expect(trace().style.display).toBe('');
    mouse('mouseup', 143, 60);
  });

  it('does nothing for a press on the border that never moves', () => {
    const { onPin, onUnpin } = mount();
    mouse('mousedown', 143, 30, hit());
    mouse('mouseup', 143, 30);
    expect(onPin).not.toHaveBeenCalled();
    expect(onUnpin).not.toHaveBeenCalled();
  });

  it('never pins a corner: a press beside one takes its nearer neighbour', () => {
    const { onPin } = mount();
    mouse('mousedown', 71, 31, hit()); // beside corner 0, nearer point 63 than point 1
    mouse('mousemove', 71, 80);
    mouse('mouseup', 71, 80);
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onPin.mock.calls[0][0]).toBe(63);
    expect([0, 16, 32, 48]).not.toContain(onPin.mock.calls[0][0]);
  });

  it('draws a pinned point as a labelled round button at its percent position', () => {
    mount({ pinned: [7] });
    expect(container!.querySelectorAll('button[data-pin]').length).toBe(1);
    expect(pin(7).getAttribute('aria-label')).toBe('Pinned point');
    expect(parseFloat(pin(7).style.left)).toBeCloseTo(45);
    expect(pin(7).style.top).toBe('10%');
  });

  it('removes a pin on a tap and does not move it', () => {
    const { onPin, onUnpin } = mount({ pinned: [7] });
    mouse('mousedown', 140, 30, pin(7));
    mouse('mouseup', 140, 30);
    expect(onUnpin).toHaveBeenCalledTimes(1);
    expect(onUnpin).toHaveBeenCalledWith(7);
    expect(onPin).not.toHaveBeenCalled();
  });

  it('moves a pin on a drag and does not remove it', () => {
    const { onPin, onUnpin } = mount({ pinned: [7] });
    mouse('mousedown', 140, 30, pin(7));
    mouse('mousemove', 140, 50);
    expect(pin(7).style.top).toBe('30%');
    mouse('mouseup', 140, 50);
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onPin.mock.calls[0][0]).toBe(7);
    expect(onPin.mock.calls[0][1].y).toBeCloseTo(0.3, 2);
    expect(onUnpin).not.toHaveBeenCalled();
  });

  it('removes a focused pin with Delete', () => {
    const { onUnpin } = mount({ pinned: [7] });
    key(pin(7), 'Delete');
    expect(onUnpin).toHaveBeenCalledTimes(1);
    expect(onUnpin).toHaveBeenCalledWith(7);
  });

  it('nudges a focused pin with the arrow keys, by the corner handles steps', () => {
    const { onPin } = mount({ pinned: [7] });
    key(pin(7), 'ArrowRight');
    expect(onPin.mock.calls[0][0]).toBe(7);
    expect(onPin.mock.calls[0][1].x).toBeCloseTo(TRACE[7].x + 0.005);
    key(pin(7), 'ArrowDown', true);
    expect(onPin.mock.calls[1][1].y).toBeCloseTo(TRACE[7].y + 0.02);
  });

  it('adds no hit path and no pin without a trace', () => {
    mount({ trace: null, pinned: [7] });
    expect(hit()).toBeNull();
    expect(pin(7)).toBeNull();
  });

  it('adds no hit path and no pin without onPin', () => {
    mount({ withPin: false, pinned: [7] });
    expect(hit()).toBeNull();
    expect(pin(7)).toBeNull();
  });

  it('still hides the trace for a corner drag and commits it once', () => {
    mount({ pinned: [7] });
    const onCommit = vi.fn();
    act(() => render(<CornerEditor src="x.jpg" quad={QUAD} trace={TRACE} pinned={[7]} onPin={vi.fn()} onCommit={onCommit} labels={LABELS} />, container!));
    container!.querySelector('[data-corner-frame]')!.getBoundingClientRect = () => RECT as DOMRect;
    const corner = container!.querySelector('[role="group"] button')!;
    mouse('mousedown', 70, 40, corner);
    mouse('mousemove', 90, 45);
    expect(trace().style.display).toBe('none');
    mouse('mouseup', 90, 45);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  const dots = () => container!.querySelector<HTMLElement>('[data-trace-dots]');
  const dotEls = () => Array.from(container!.querySelectorAll<HTMLElement>('[data-dot]'));
  const dotAt = (i: number) => container!.querySelector<HTMLElement>(`[data-dot="${i}"]`);

  it('draws one dot per traced point, none at the four corners', () => {
    mount();
    expect(dotEls()).toHaveLength(60);
    for (const c of [0, 16, 32, 48]) expect(dotAt(c)).toBeNull();
  });

  it('leaves out a pinned point, which has its own button', () => {
    mount({ pinned: [7] });
    expect(dotEls()).toHaveLength(59);
    expect(dotAt(7)).toBeNull();
  });

  it('draws no dots without onPin or without a trace', () => {
    mount({ withPin: false });
    expect(dots()).toBeNull();
    act(() => render(null, container!));
    mount({ trace: null });
    expect(dots()).toBeNull();
  });

  it('hides the dots for a corner drag and brings them back after it', () => {
    mount();
    const corner = container!.querySelector('[role="group"] button')!;
    mouse('mousedown', 70, 40, corner);
    mouse('mousemove', 90, 45);
    expect(dots()!.style.display).toBe('none');
    mouse('mouseup', 90, 45);
    act(() => render(<CornerEditor src="x.jpg" quad={QUAD} trace={[...TRACE]} onPin={vi.fn()} onCommit={vi.fn()} labels={LABELS} />, container!));
    expect(dots()!.style.display).toBe('');
  });

  it('moves the dot with its point while a pin is dragged', () => {
    mount();
    const dot = dotAt(5)!;
    const before = `${dot.style.left} ${dot.style.top}`;
    mouse('mousedown', 143, 30, hit());
    mouse('mousemove', 143, 60);
    const moved = dotEls().some((d) => `${d.style.left} ${d.style.top}` !== `${TRACE[Number(d.dataset.dot)].x * 100}% ${TRACE[Number(d.dataset.dot)].y * 100}%`);
    expect(moved || `${dot.style.left} ${dot.style.top}` !== before).toBe(true);
    expect(dots()!.style.display).toBe('');
    mouse('mouseup', 143, 60);
  });

  // Protects: the hit lines are real pixels now, 28 wide, and take the press from the lines.
  it('draws the hit area as one wide line per segment of the trace', () => {
    mount();
    expect(hit().querySelectorAll('line')).toHaveLength(TRACE.length);
    expect(hit().getAttribute('stroke-width')).toBe('28');
  });

  describe('the magnifier on hover', () => {
    const loupe = () => container!.querySelector<HTMLElement>('[data-loupe]')!;
    const dim = () => container!.querySelector<HTMLElement>('[data-dim]')!.getAttribute('style')!;
    const touch = (type: string, target: EventTarget) =>
      act(() => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(e, { touches: type === 'touchend' ? [] : [{ clientX: 143, clientY: 30 }], changedTouches: [{ clientX: 143, clientY: 30 }] });
        target.dispatchEvent(e);
      });

    it('shows with a mouse over the border and hides when the pointer leaves', () => {
      mount();
      expect(loupe().hidden).toBe(true);
      mouse('mousemove', 143, 30, hit());
      expect(loupe().hidden).toBe(false);
      mouse('mouseleave', 143, 30, hit());
      expect(loupe().hidden).toBe(true);
    });

    const edges = () => Array.from(container!.querySelectorAll<SVGLineElement>('[data-loupe] line[class*="loupe-edge"]'));

    it('draws no edge lines while the mouse rests on the border, because the pointer is not on a dot', () => {
      mount();
      mouse('mousemove', 143, 30, hit());
      expect(loupe().hidden).toBe(false);
      expect(edges()).toHaveLength(2);
      edges().forEach((l) => expect(l.style.display).toBe('none'));
    });

    it('draws no edge lines while a border dot is dragged, because the rest of the side is re-traced on drop', () => {
      mount();
      mouse('mousedown', 143, 30, hit());
      mouse('mousemove', 143, 45);
      expect(loupe().hidden).toBe(false);
      edges().forEach((l) => expect(l.style.display).toBe('none'));
      mouse('mouseup', 143, 45);
    });

    it('shows over a pin button too', () => {
      mount({ pinned: [7] });
      mouse('mousemove', 140, 30, pin(7));
      expect(loupe().hidden).toBe(false);
    });

    it('stays hidden after a touch tap on the border', () => {
      mount();
      touch('touchstart', hit());
      touch('touchend', window);
      mouse('mousemove', 143, 30, hit()); // the emulated mouse event after a tap
      expect(loupe().hidden).toBe(true);
    });

    it('does nothing during a drag', () => {
      mount();
      mouse('mousedown', 143, 30, hit());
      mouse('mousemove', 143, 45);
      loupe().hidden = true;
      // Not bubbling: only the border's own hover handler could answer it, and it must not.
      act(() => { hit().dispatchEvent(new MouseEvent('mousemove', { clientX: 143, clientY: 50, bubbles: false })); });
      expect(loupe().hidden).toBe(true);
      mouse('mouseup', 143, 50);
    });

    it('lets the dark area follow a moved point during a pin drag', () => {
      mount();
      const before = dim();
      mouse('mousedown', 143, 30, hit());
      mouse('mousemove', 143, 45);
      mouse('mousemove', 143, 60);
      expect(dim()).not.toBe(before);
      mouse('mouseup', 143, 60);
    });
  });
});
