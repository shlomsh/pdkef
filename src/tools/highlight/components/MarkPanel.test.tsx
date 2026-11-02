import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MARKER, TOP_COLORS, type Marker } from '../lib/marker/markerState.ts';
import MarkPanel from './MarkPanel.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(look: Marker = DEFAULT_MARKER) {
  const props = { onChange: vi.fn(), onComment: vi.fn(), onDelete: vi.fn() };
  container = document.createElement('div');
  document.body.appendChild(container);
  const draw = (next: Marker) => act(() => render(<MarkPanel look={next} {...props} />, container!));
  draw(look);
  return { ...props, draw };
}
const named = (name: string) => container!.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!;
const press = (el: Element) => act(() => { (el as HTMLElement).click(); });
const setting = () => container!.querySelector<HTMLElement>('button[aria-haspopup][aria-label="Opacity"], button[aria-haspopup][aria-label="Underline thickness"]')!;

describe('MarkPanel', () => {
  it('is one row: three colors, More, the switch, its setting button, Comment, Delete, in that order', () => {
    mount();
    const row = container!.querySelector('[data-marker-row]')!;
    const order = [...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(order).toEqual(['Yellow', 'Pink', 'Green', 'More colors', 'Highlight', 'Underline', 'Opacity', 'Comment', 'Delete']);
  });

  it('a color changes the look', () => {
    const { onChange } = mount();
    press(container!.querySelectorAll('[data-highlight-swatch]')[1]);
    expect(onChange).toHaveBeenCalledWith({ color: TOP_COLORS[1].hex });
  });

  it('Comment and Delete act', () => {
    const { onComment, onDelete } = mount();
    press(named('Comment'));
    expect(onComment).toHaveBeenCalledTimes(1);
    press(named('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  describe('the switch', () => {
    it('is two plain segments with no caret inside', () => {
      mount();
      const toggle = container!.querySelector('[data-style-toggle]')!;
      expect(toggle.querySelectorAll('button')).toHaveLength(2);
      expect(toggle.querySelector('[aria-haspopup]')).toBeNull();
      expect(toggle.querySelector('polyline')).toBeNull();
    });

    it('the inactive segment switches and the active one does nothing', () => {
      const { onChange } = mount();
      press(named('Highlight'));
      expect(onChange).not.toHaveBeenCalled();
      press(named('Underline'));
      expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
    });

    it('presses the current style', () => {
      const { draw, onChange } = mount();
      draw({ ...DEFAULT_MARKER, style: 'underline' });
      expect(named('Underline').getAttribute('aria-pressed')).toBe('true');
      press(named('Underline'));
      expect(onChange).not.toHaveBeenCalled();
      press(named('Highlight'));
      expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight' });
    });
  });

  describe('the setting button', () => {
    it('sits after the switch, outside it', () => {
      mount();
      expect(setting().closest('[data-style-toggle]')).toBeNull();
    });

    it('on a highlight shows a dot in the color at its opacity and the percent, and opens the slider', () => {
      const { onChange } = mount({ ...DEFAULT_MARKER, color: '#FF8FCF', opacity: 0.5 });
      expect(setting().textContent).toBe('50%');
      const dot = setting().querySelector<HTMLElement>('[data-setting-dot]')!;
      expect(dot.style.background.toLowerCase()).toContain('rgb(255, 143, 207)');
      expect(dot.style.opacity).toBe('0.5');
      expect(setting().querySelector('polyline')).not.toBeNull();
      expect(document.querySelector('[data-opacity-slider]')).toBeNull();
      press(setting());
      const range = document.querySelector<HTMLInputElement>('[data-opacity-slider] input')!;
      expect(range.value).toBe('0.5');
      act(() => { range.value = '0.8'; range.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight', opacity: 0.8 });
    });

    it('on an underline shows a line at the thickness and opens the thickness picker', () => {
      const { onChange } = mount({ ...DEFAULT_MARKER, style: 'underline', strokeWidth: 2 });
      expect(setting().getAttribute('aria-label')).toBe('Underline thickness');
      expect(setting().querySelector('[data-setting-dot]')).toBeNull();
      expect(setting().querySelector('[data-setting-line]')!.getAttribute('stroke-width')).toBe('2');
      expect(setting().querySelector('polyline')).not.toBeNull();
      press(setting());
      press(document.querySelector('[data-editor-thickness="3"]')!);
      expect(onChange).toHaveBeenLastCalledWith({ style: 'underline', strokeWidth: 3 });
    });
  });

  describe('More', () => {
    const more = () => container!.querySelector<HTMLElement>('[data-more-colors]')!;

    it('shows its chevron alone while the color is a top one', () => {
      mount();
      expect(more().querySelector('polyline')).not.toBeNull();
      expect(more().querySelector('i')).toBeNull();
      expect(more().getAttribute('aria-pressed')).toBeNull();
    });

    it('keeps its chevron and shows the hidden color as a pressed dot before it', () => {
      mount({ ...DEFAULT_MARKER, color: '#FF8080' });
      expect(more().querySelector('polyline')).not.toBeNull();
      expect(more().getAttribute('aria-pressed')).toBe('true');
      const dot = more().querySelector('i')!;
      expect(dot.style.background.toLowerCase()).toContain('rgb(255, 128, 128)');
      expect(dot.nextElementSibling!.tagName.toLowerCase()).toBe('svg');
    });

    it('a custom color shows its dot too, and a pick applies', () => {
      const { onChange } = mount({ ...DEFAULT_MARKER, color: '#336699' });
      expect(more().querySelector('i')).not.toBeNull();
      press(more());
      press(document.querySelectorAll('[data-more-popover] [data-highlight-swatch]')[1]);
      expect(onChange).toHaveBeenCalledWith({ color: '#FF8080' });
      expect(document.querySelector('[data-more-popover]')).toBeNull();
    });
  });
});
