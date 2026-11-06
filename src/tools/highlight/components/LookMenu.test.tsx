import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MARKER, type Marker } from '../lib/marker/markerState.ts';
import LookMenu from './LookMenu.tsx';
import { ToolbarScale } from './toolbarScale.ts';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(look: Partial<Marker> = {}, open = true, extra: { placement?: 'top' | 'bottom'; scaled?: boolean } = {}) {
  const onChange = vi.fn();
  const onOpenChange = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  const menu = <LookMenu look={{ ...DEFAULT_MARKER, ...look }} onChange={onChange} open={open} onOpenChange={onOpenChange} placement={extra.placement} />;
  act(() => render(extra.scaled ? <ToolbarScale.Provider value={true}>{menu}</ToolbarScale.Provider> : menu, container!));
  return { onChange, onOpenChange };
}
const trigger = () => container!.querySelector<HTMLElement>('button[data-look-button]')!;
const group = (name: string) => document.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${name}"]`);
const labels = (g: HTMLElement | null) => [...g!.querySelectorAll('[role="radio"]')].map((r) => r.getAttribute('aria-label'));
const press = (el: Element) => act(() => { (el as HTMLElement).click(); });

describe('LookMenu', () => {
  it('the trigger is named Look, shows the current look with no percent, and a chevron', () => {
    mount({ opacity: 0.5 }, false);
    expect(trigger().getAttribute('aria-label')).toBe('Look');
    expect(trigger().title).toBe('Look');
    expect(trigger().getAttribute('aria-haspopup')).toBe('true');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().textContent).toBe('');
    expect(trigger().querySelector('[data-setting-face] svg rect')).not.toBeNull();
    expect(trigger().querySelector('polyline')!.getAttribute('points')).toBe('6 9 12 15 18 9');
    expect(document.querySelector('[data-opacity-slider]')).toBeNull();
  });

  it('an underline face is a line on the same box, and a top placement points the chevron up', () => {
    mount({ style: 'underline', strokeWidth: 2 }, false, { placement: 'top' });
    expect(trigger().querySelector('[data-setting-line] rect')!.getAttribute('height')).toBe('2');
    expect(trigger().querySelector('polyline')!.getAttribute('points')).toBe('6 15 12 9 18 15');
  });

  it('on a highlight holds Kind, Stroke and the opacity slider', () => {
    mount();
    expect(labels(group('Kind'))).toEqual(['Highlight', 'Underline']);
    expect(labels(group('Stroke'))).toEqual(['Clean', 'Sketch', 'Pencil']);
    expect(document.querySelector('[data-opacity-slider] input')).not.toBeNull();
    expect(document.querySelector('[data-editor-thickness]')).toBeNull();
  });

  it('on an underline holds Kind, a two-way Stroke and five thickness radios', () => {
    mount({ style: 'underline', strokeWidth: 3 });
    expect(labels(group('Stroke'))).toEqual(['Clean', 'Sketch']);
    expect(document.querySelector('[data-opacity-slider]')).toBeNull();
    const radios = [...group('Underline thickness')!.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.map((r) => r.dataset.editorThickness)).toEqual(['1', '1.5', '2', '3', '4']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true', 'false']);
    expect(radios[3].getAttribute('aria-label')).toBe('3 pt');
    expect(radios.every((r) => r.querySelector('svg') !== null)).toBe(true);
  });

  it('picking Underline changes the style', () => {
    const { onChange } = mount();
    press(document.querySelector('[role="radio"][aria-label="Underline"]')!);
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
  });

  it('the slider keeps a pencil a pencil', () => {
    const { onChange } = mount({ style: 'pencil' });
    const range = document.querySelector<HTMLInputElement>('[data-opacity-slider] input')!;
    act(() => { range.value = '0.7'; range.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ style: 'pencil', opacity: 0.7 });
  });

  it('a thickness pick sets it and leaves the menu open', () => {
    const { onChange, onOpenChange } = mount({ style: 'underline' });
    press(document.querySelector('[data-editor-thickness="4"]')!);
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline', strokeWidth: 4 });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(group('Underline thickness')).not.toBeNull();
  });

  it('closed, it holds no menu; the trigger asks the host to open', () => {
    const { onOpenChange } = mount({}, false);
    expect(group('Kind')).toBeNull();
    press(trigger());
    expect(onOpenChange.mock.calls[0][0]).toBe(true);
  });

  it('a top placement reaches the popover', () => {
    mount({}, true, { placement: 'top' });
    expect(document.querySelector('[data-editor-popover]')).not.toBeNull();
    expect(group('Kind')).not.toBeNull();
  });

  it('counter-scales its popover inside the desktop toolbar, and only there', () => {
    mount();
    expect(document.querySelector('[data-editor-popover] [data-counter-scaled]')).toBeNull();
    act(() => render(null, container!)); container!.remove(); container = null;
    mount({}, true, { scaled: true });
    expect(document.querySelector('[data-editor-popover] [data-counter-scaled]')!.getAttribute('style')).toContain('--vv-scale');
  });
});
