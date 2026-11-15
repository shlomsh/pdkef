import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import CornerEditor from './CornerEditor.tsx';
import { type Quad } from '#lib/pageEnhance/quad.ts';
import { isConvexQuad } from '../lib/quad.ts';

const QUAD: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const LABELS: { group: string; corners: [string, string, string, string] } = { group: 'Page corners', corners: ['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner'] };
// 200x100 box at (50, 20): a real rect, not jsdom's 0x0.
const RECT = { left: 50, top: 20, width: 200, height: 100, right: 250, bottom: 120, x: 50, y: 20, toJSON: () => ({}) };

let container: HTMLElement | null = null;
function mount(onCommit: (quad: Quad) => void, quad: Quad = QUAD, trace?: { x: number; y: number }[] | null) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<CornerEditor src="x.jpg" quad={quad} trace={trace} onCommit={onCommit} labels={LABELS} />, container!));
  container.querySelector('[data-corner-frame]').getBoundingClientRect = () => RECT;
  return container;
}
const handle = (i: number) => container!.querySelectorAll('button')[i];
const mouse = (type: string, x: number, y: number, target: EventTarget = window) =>
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

  it('sizes the frame by --corner-zoom, and the same as before otherwise', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<CornerEditor src="x.jpg" aspect={0.75} quad={QUAD} onCommit={vi.fn()} labels={LABELS} />, container!));
    const frame = container.querySelector<HTMLElement>('[data-corner-frame]')!;
    expect(frame.getAttribute('style')).toContain('min(100%, calc(var(--scan-view-h, 62svh) * 0.75))');
    expect(frame.getAttribute('style')).toContain('var(--corner-zoom, 1)');
    expect(frame.style.aspectRatio).toContain('0.75');
  });

  it('places a dragged corner by the frame rect at the time of each move (the photo area scrolled)', () => {
    const onCommit = vi.fn();
    const m = mount(onCommit);
    const frame = m.querySelector('[data-corner-frame]') as HTMLElement;
    mouse('mousedown', 70, 40, handle(0));
    mouse('mousemove', 100, 50); // rect (50, 20, 200x100): (0.25, 0.30)
    frame.getBoundingClientRect = () => ({ ...RECT, left: 0, top: 0, x: 0, y: 0 }) as DOMRect; // scrolled by 50, 20
    mouse('mousemove', 60, 25); // (0.3, 0.25) now; the first rect would say (0.05, 0.05)
    mouse('mouseup', 60, 25);
    const next = onCommit.mock.calls[0][0];
    expect(next[0].x).toBeCloseTo(0.3);
    expect(next[0].y).toBeCloseTo(0.25);
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

  it('magnifies a corner under a mouse drag too, and hides the magnifier on release', () => {
    mount(vi.fn());
    const loupe = container!.querySelector<HTMLElement>('[data-loupe]');
    expect(loupe.hidden).toBe(true);
    mouse('mousedown', 70, 40, handle(0));
    expect(loupe.hidden).toBe(false);
    mouse('mousemove', 90, 45);
    expect(loupe.hidden).toBe(false);
    expect(loupe.style.backgroundSize).toBe('500px 250px');
    mouse('mouseup', 90, 45);
    expect(loupe.hidden).toBe(true);
  });

  it('draws both edge lines during a corner drag, and again after a border dot drag hid them', () => {
    const TRACE = Array.from({ length: 16 }, (_, i) => ({ x: 0.1 + (0.8 * i) / 15, y: 0.1 }));
    const edges = () => Array.from(container!.querySelectorAll<SVGLineElement>('[data-loupe] line[class*="loupe-edge"]'));
    const onPin = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<CornerEditor src="x.jpg" quad={QUAD} trace={TRACE} onPin={onPin} onCommit={vi.fn()} labels={LABELS} />, container!));
    container.querySelector('[data-corner-frame]').getBoundingClientRect = () => RECT;
    mouse('mousedown', 70, 40, handle(0));
    mouse('mousemove', 90, 45);
    edges().forEach((l) => expect(l.style.display).toBe(''));
    mouse('mouseup', 90, 45);
    mouse('mousedown', 143, 40, container.querySelector('path[data-hit]')!);
    mouse('mousemove', 143, 55);
    expect(edges()).toHaveLength(2);
    edges().forEach((l) => expect(l.style.display).toBe('none'));
    mouse('mouseup', 143, 55);
    mouse('mousedown', 70, 40, handle(0));
    mouse('mousemove', 90, 45);
    edges().forEach((l) => expect(l.style.display).toBe(''));
    mouse('mouseup', 90, 45);
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
    const sliver: Quad = [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, { x: 0.9, y: 0.505 }, { x: 0.1, y: 0.505 }];
    mount(onCommit, sliver);
    act(() => { handle(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })); });
    expect(onCommit).not.toHaveBeenCalled();
  });

  const TRACE = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.08 }, { x: 0.9, y: 0.1 }, { x: 0.92, y: 0.5 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

  it('draws the trace as one closed path and fades the straight polygon', () => {
    mount(vi.fn(), QUAD, TRACE);
    const path = container!.querySelector('path[data-trace]')!;
    const d = path.getAttribute('d')!;
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.split('L').length - 1).toBe(TRACE.length - 1);
    expect(path.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(container!.querySelector('polygon')!.getAttribute('class')).toMatch(/outline-faint/);
  });

  it('draws nothing new without a trace', () => {
    mount(vi.fn(), QUAD, null);
    expect(container!.querySelector('path[data-trace]')).toBeNull();
    expect(container!.querySelector('polygon')!.getAttribute('class')).not.toMatch(/outline-faint/);
  });

  it('hides the trace during a drag and shows it again once props are back in control', () => {
    mount(vi.fn(), QUAD, TRACE);
    const path = () => container!.querySelector<SVGPathElement>('path[data-trace]')!;
    mouse('mousedown', 70, 40, handle(0));
    mouse('mousemove', 90, 45);
    expect(path().style.display).toBe('none');
    expect(container!.querySelector('polygon')!.getAttribute('class')).not.toMatch(/outline-faint/);
    mouse('mouseup', 90, 45);
    act(() => render(<CornerEditor src="x.jpg" quad={QUAD} trace={[...TRACE]} onCommit={vi.fn()} labels={LABELS} />, container!));
    expect(path().style.display).toBe('');
    expect(container!.querySelector('polygon')!.getAttribute('class')).toMatch(/outline-faint/);
  });

  describe('the dark area', () => {
    const dim = () => container!.querySelector<SVGPathElement>('path[class*="dim"]')!.getAttribute('d')!;
    const quadD = 'M0 0H1V1H0Z M0.1 0.1 L0.9 0.1 L0.9 0.9 L0.1 0.9 Z';
    const traceD = `M0 0H1V1H0Z M${TRACE.map((p) => `${p.x} ${p.y}`).join(' L')} Z`;

    it('is cut out along the trace when one shows, and along the quad when none does', () => {
      mount(vi.fn(), QUAD, TRACE);
      expect(dim()).toBe(traceD);
      act(() => render(null, container!));
      container!.remove();
      container = null;
      mount(vi.fn(), QUAD, null);
      expect(dim()).toBe(quadD);
    });

    it('follows the dragged quad during a corner drag and is the trace again once props are back', () => {
      mount(vi.fn(), QUAD, TRACE);
      mouse('mousedown', 70, 40, handle(0));
      mouse('mousemove', 90, 45); // (0.2, 0.25)
      expect(dim()).toBe('M0 0H1V1H0Z M0.2 0.25 L0.9 0.1 L0.9 0.9 L0.1 0.9 Z');
      mouse('mouseup', 90, 45);
      act(() => render(<CornerEditor src="x.jpg" quad={QUAD} trace={[...TRACE]} onCommit={vi.fn()} labels={LABELS} />, container!));
      expect(dim()).toBe(traceD);
    });
  });
});
