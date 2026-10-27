import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import CornerEditor from './CornerEditor.tsx';
import { isConvexQuad } from '../lib/quad.ts';

const QUAD = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const LABELS = { group: 'Page corners', corners: ['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner'] };
// 200x100 box at (50, 20): a real rect, not jsdom's 0x0.
const RECT = { left: 50, top: 20, width: 200, height: 100, right: 250, bottom: 120, x: 50, y: 20 };

let container: HTMLElement | null = null;
function mount(onCommit, quad = QUAD) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<CornerEditor src="x.jpg" quad={quad} onCommit={onCommit} labels={LABELS} />, container!));
  container.querySelector('[data-corner-frame]').getBoundingClientRect = () => RECT;
  return container;
}
const handle = (i) => container!.querySelectorAll('button')[i];
const mouse = (type, x, y, target = window) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })); });

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('CornerEditor', () => {
  it('renders a labelled group of four handles and a kebab-cased outline', () => {
    mount(vi.fn());
    expect(container!.querySelector('[role="group"]').getAttribute('aria-label')).toBe('Page corners');
    expect(handle(0).getAttribute('aria-label')).toBe('Top-left corner');
    expect(handle(0).style.left).toBe('10%');
    expect(handle(0).style.top).toBe('10%');
    expect(container!.querySelector('polygon').getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('moves the handle during a drag and commits once on release', () => {
    const onCommit = vi.fn();
    mount(onCommit);
    mouse('mousedown', 70, 40, handle(0)); // grabs the top-left corner
    mouse('mousemove', 100, 50); // (0.25, 0.30)
    mouse('mousemove', 90, 45); // (0.20, 0.25)
    expect(onCommit).not.toHaveBeenCalled();
    expect(handle(0).style.left).toBe('20%');
    expect(handle(0).style.top).toBe('25%');
    mouse('mouseup', 90, 45);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const next = onCommit.mock.calls[0][0];
    expect(next[0].x).toBeCloseTo(0.2);
    expect(next[0].y).toBeCloseTo(0.25);
    expect(next[1]).toEqual(QUAD[1]);
  });

  it('stops the handle at the last valid shape when the drag crosses the opposite corner', () => {
    const onCommit = vi.fn();
    mount(onCommit);
    mouse('mousedown', 70, 40, handle(0));
    // Down the diagonal toward the bottom-right corner: valid at 0.25 and 0.4, collinear (not a page) from 0.55 on.
    for (const t of [0.25, 0.4, 0.55, 0.7, 0.85]) mouse('mousemove', 50 + 200 * t, 20 + 100 * t);
    mouse('mousemove', 240, 110); // dropped past the bottom-right corner
    expect(handle(0).style.left).toBe('40%');
    expect(handle(0).style.top).toBe('40%');
    mouse('mouseup', 240, 110);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const next = onCommit.mock.calls[0][0];
    expect(isConvexQuad(next)).toBe(true);
    expect(next[0].x).toBeCloseTo(0.4);
    expect(next[0].y).toBeCloseTo(0.4);
    expect(next[1]).toEqual(QUAD[1]);
  });

  it('nudges a focused handle with the arrow keys and commits each press', () => {
    const onCommit = vi.fn();
    mount(onCommit);
    act(() => { handle(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0][0].x).toBeCloseTo(0.105);
    act(() => { handle(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true })); });
    expect(onCommit.mock.calls[1][0][0].y).toBeCloseTo(0.12);
  });

  it('refuses a sliver: a convex quad too thin to be a page is never committed', () => {
    const onCommit = vi.fn();
    const sliver = [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, { x: 0.9, y: 0.505 }, { x: 0.1, y: 0.505 }];
    mount(onCommit, sliver);
    act(() => { handle(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })); });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
