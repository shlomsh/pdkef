import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SplitLine, { movedSpine } from './SplitLine.tsx';

const LABELS = { group: 'The line between the pages', top: 'Top of the line', bottom: 'Bottom of the line' };
const RECT = { left: 50, top: 20, width: 200, height: 100, right: 250, bottom: 120, x: 50, y: 20, toJSON: () => ({}) };

let container: HTMLElement | null = null;
function mount(onCommit: (s: { top: number; bottom: number }) => void, spine = { top: 0.5, bottom: 0.6 }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<SplitLine src="x.jpg" spine={spine} onCommit={onCommit} labels={LABELS} />, container!));
  container.querySelector('[data-split-frame]')!.getBoundingClientRect = () => RECT as DOMRect;
  return container;
}
const handle = (i: number) => container!.querySelectorAll('button')[i];
const mouse = (type: string, x: number, y: number, target: EventTarget = window) =>
  act(() => { target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })); });
const key = (el: Element, k: string, shiftKey = false) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })); });

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('movedSpine', () => {
  it('moves one end and clamps to 0.02..0.98', () => {
    expect(movedSpine({ top: 0.5, bottom: 0.6 }, 'top', 0.3)).toEqual({ top: 0.3, bottom: 0.6 });
    expect(movedSpine({ top: 0.5, bottom: 0.6 }, 'bottom', 2)).toEqual({ top: 0.5, bottom: 0.98 });
    expect(movedSpine({ top: 0.5, bottom: 0.6 }, 'top', -1)).toEqual({ top: 0.02, bottom: 0.6 });
  });
});

describe('SplitLine', () => {
  it('draws one labelled line with two handles at its ends', () => {
    mount(vi.fn());
    expect(container!.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe(LABELS.group);
    expect(handle(0).getAttribute('aria-label')).toBe(LABELS.top);
    expect(handle(1).getAttribute('aria-label')).toBe(LABELS.bottom);
    expect(handle(0).style.left).toBe('50%');
    expect(handle(1).style.left).toBe('60%');
    expect(container!.querySelector('line')!.getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('moves sideways during a drag and commits once on release', () => {
    const onCommit = vi.fn();
    mount(onCommit);
    mouse('mousedown', 150, 20, handle(0));
    mouse('mousemove', 110, 90); // x = 0.30; y is ignored
    expect(onCommit).not.toHaveBeenCalled();
    expect(handle(0).style.left).toBe('30%');
    expect(handle(0).style.top).toBe('0%');
    mouse('mouseup', 110, 90);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].top).toBeCloseTo(0.3);
    expect(onCommit.mock.calls[0][0].bottom).toBe(0.6);
  });

  it('arrow keys nudge by a step, Shift by a bigger one', () => {
    const onCommit = vi.fn();
    mount(onCommit);
    key(handle(1), 'ArrowLeft');
    expect(onCommit.mock.calls[0][0].bottom).toBeCloseTo(0.595);
    key(handle(1), 'ArrowRight', true);
    expect(onCommit.mock.calls[1][0].bottom).toBeCloseTo(0.62);
    key(handle(1), 'ArrowUp');
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
});
