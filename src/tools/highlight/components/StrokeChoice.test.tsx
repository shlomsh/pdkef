import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MARKER, type Marker } from '../lib/marker/markerState.ts';
import StrokeChoice, { hatchLines } from './StrokeChoice.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(look: Partial<Marker> = {}, onChange = vi.fn()) {
  if (container) { act(() => render(null, container!)); container.remove(); }
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<StrokeChoice look={{ ...DEFAULT_MARKER, color: '#ff8fcf', ...look }} onChange={onChange} />, container!));
  return onChange;
}
const radio = (name: string) => container!.querySelector<HTMLElement>(`[role="radio"][aria-label="${name}"]`)!;
const names = () => [...container!.querySelectorAll('[role="radio"]')].map((r) => r.getAttribute('aria-label'));
const picked = () => container!.querySelector<HTMLElement>('[role="radiogroup"]')!.style.getPropertyValue('--picked');

describe('StrokeChoice', () => {
  it('on a highlight is one 3-way radiogroup named Stroke: Clean, Sketch, Pencil, Clean checked when the stroke is absent', () => {
    mount();
    const group = container!.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Stroke');
    expect(names()).toEqual(['Clean', 'Sketch', 'Pencil']);
    expect(radio('Clean').getAttribute('aria-checked')).toBe('true');
    expect([radio('Clean').tabIndex, radio('Sketch').tabIndex, radio('Pencil').tabIndex]).toEqual([0, -1, -1]);
    expect(picked()).toBe('0');
  });

  it('checks Sketch on a sketch highlight and Pencil on a pencil mark, and the thumb follows', () => {
    mount({ stroke: 'sketch' });
    expect(radio('Sketch').getAttribute('aria-checked')).toBe('true');
    expect(picked()).toBe('1');
    mount({ style: 'pencil', stroke: 'sketch' });
    expect(radio('Pencil').getAttribute('aria-checked')).toBe('true');
    expect(radio('Sketch').getAttribute('aria-checked')).toBe('false');
    expect(radio('Pencil').getAttribute('aria-keyshortcuts')).toBe('P');
    expect(picked()).toBe('2');
  });

  it('each choice sends the whole look it stands for, and the checked one does nothing', () => {
    const onChange = mount();
    act(() => radio('Clean').click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => radio('Sketch').click());
    expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight', stroke: 'sketch' });
    act(() => radio('Pencil').click());
    expect(onChange).toHaveBeenLastCalledWith({ style: 'pencil' });
    const fromPencil = mount({ style: 'pencil' });
    act(() => radio('Clean').click());
    expect(fromPencil).toHaveBeenLastCalledWith({ style: 'highlight', stroke: undefined });
  });

  it('arrow keys move the check and wrap', () => {
    const onChange = mount({ style: 'pencil' });
    radio('Pencil').focus();
    act(() => { radio('Pencil').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight', stroke: undefined });
    expect(document.activeElement).toBe(radio('Clean'));
  });

  it('marks each word in its own look: a band, a sketched band, hatching', () => {
    mount();
    expect(radio('Clean').querySelector('[data-stroke-mark="band"] rect')).not.toBeNull();
    expect(radio('Sketch').querySelector('[data-stroke-mark="band"] path')).not.toBeNull();
    expect(radio('Pencil').querySelector('[data-stroke-mark="hatch"] path')).not.toBeNull();
  });

  it('on an underline offers Clean and Sketch only, drawn as lines, and sends the stroke alone', () => {
    const onChange = mount({ style: 'underline' });
    expect(names()).toEqual(['Clean', 'Sketch']);
    expect(container!.querySelector('[data-stroke-mark="underline"]')).not.toBeNull();
    expect(container!.querySelector('[data-stroke-mark="band"]')).toBeNull();
    act(() => radio('Sketch').click());
    expect(onChange).toHaveBeenLastCalledWith({ stroke: 'sketch' });
  });
});

describe('hatchLines', () => {
  it('lays parallel lines that climb to the right and stay inside the box', () => {
    const lines = hatchLines({ x: 2, y: 1, w: 40, h: 12 }, 4);
    expect(lines.length).toBeGreaterThan(5);
    for (const [x1, y1, x2, y2] of lines) {
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        expect(x).toBeGreaterThanOrEqual(2 - 1e-9); expect(x).toBeLessThanOrEqual(42 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(1 - 1e-9); expect(y).toBeLessThanOrEqual(13 + 1e-9);
      }
      expect(x2).toBeGreaterThan(x1);
      expect(y2).toBeLessThan(y1);
    }
  });
});
