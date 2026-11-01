import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { underlineInk } from '#editor/model/underlineInk.ts';
import { DEFAULT_MARKER, HIGHLIGHT_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import MarkerButton from './MarkerButton.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(over: Partial<Parameters<typeof MarkerButton>[0]> = {}) {
  const props = { marker: DEFAULT_MARKER as Marker, onChange: vi.fn(), onTap: vi.fn(), isCoarse: () => false, ...over };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<MarkerButton {...props} />, container!));
  const button = () => container!.querySelector(`button[aria-label="${t.marker}"]`) as HTMLButtonElement;
  const open = () => act(() => { button().click(); });
  return { props, button, open };
}

const press = (el: Element) => act(() => { (el as HTMLElement).click(); });

describe('MarkerButton', () => {
  it('shows the armed marker as a dot in its color', () => {
    mount({ marker: { color: '#FF8FCF', style: 'highlight', opacity: 1 } });
    const dot = container!.querySelector('[data-marker-dot]') as HTMLElement;
    expect(dot.style.background.toLowerCase()).toContain('rgb(255, 143, 207)');
    expect(container!.querySelector('[data-marker-underline]')).toBeNull();
  });

  it('shows an underline marker as the underline glyph in the darkened ink', () => {
    mount({ marker: { color: '#FFF34D', style: 'underline', opacity: 1 } });
    const glyph = container!.querySelector('[data-marker-underline]') as HTMLElement;
    expect(glyph).not.toBeNull();
    const ink = underlineInk('#FFF34D');
    const rgb = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16)).join(', ');
    expect(glyph.style.background).toContain(`rgb(${rgb})`);
    expect(container!.querySelector('[data-marker-dot]')).toBeNull();
  });

  it('a click opens the six colors, Underline and the plus', () => {
    const { open, button } = mount();
    expect(button().getAttribute('aria-expanded')).toBe('false');
    open();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(container!.querySelectorAll('[data-highlight-swatch]')).toHaveLength(HIGHLIGHT_COLORS.length);
    expect(container!.querySelector(`button[aria-label="${t.markUnderline}"]`)).not.toBeNull();
    expect(container!.querySelector(`button[aria-label="${t.markCustom}"]`)).not.toBeNull();
  });

  it('picking a color re-arms the marker and closes the colors', () => {
    const { props, open, button } = mount();
    open();
    press(container!.querySelectorAll('[data-highlight-swatch]')[2]);
    expect(props.onChange).toHaveBeenCalledWith({ color: HIGHLIGHT_COLORS[2].hex });
    expect(button().getAttribute('aria-expanded')).toBe('false');
  });

  it('Underline toggles the style both ways', () => {
    const { props, open } = mount();
    open();
    press(container!.querySelector(`button[aria-label="${t.markUnderline}"]`)!);
    expect(props.onChange).toHaveBeenLastCalledWith({ style: 'underline' });
    act(() => render(<MarkerButton {...props} marker={{ ...DEFAULT_MARKER, style: 'underline' }} />, container!));
    const toggle = container!.querySelector(`button[aria-label="${t.markUnderline}"]`)!;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    press(toggle);
    expect(props.onChange).toHaveBeenLastCalledWith({ style: 'highlight' });
  });

  it('the plus opens a color input and an opacity slider, each a re-arm', () => {
    const { props, open } = mount();
    open();
    press(container!.querySelector(`button[aria-label="${t.markCustom}"]`)!);
    const range = container!.querySelector(`input[aria-label="${t.markOpacity}"]`) as HTMLInputElement;
    expect(range).not.toBeNull();
    expect(container!.querySelector(`input[aria-label="${t.markColorInput}"]`)).not.toBeNull();
    range.value = '50';
    act(() => { range.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(props.onChange).toHaveBeenLastCalledWith({ opacity: 0.5 });
  });

  it('Escape closes the menu and nothing above it hears the key', () => {
    const { open, button } = mount();
    const above = vi.fn();
    document.addEventListener('keydown', above);
    open();
    act(() => { container!.querySelector('[data-highlight-swatch]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    document.removeEventListener('keydown', above);
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(above).not.toHaveBeenCalled();
  });

  it('a press outside closes the menu', () => {
    const { open, button } = mount();
    open();
    act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(button().getAttribute('aria-expanded')).toBe('false');
  });

  it('on a fine pointer the click only opens the colors', () => {
    const { props, open } = mount();
    open();
    expect(props.onTap).not.toHaveBeenCalled();
  });

  it('on a coarse pointer a tap arms the marker, and a tap while armed only opens the colors', () => {
    const { props, open, button } = mount({ isCoarse: () => true });
    open();
    expect(props.onTap).toHaveBeenCalledTimes(1);
    act(() => render(<MarkerButton {...props} armed />, container!));
    press(button());
    press(button());
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(props.onTap).toHaveBeenCalledTimes(1);
  });

  it('reports when its menu opens and closes', () => {
    const onOpenChange = vi.fn();
    const { open, button } = mount({ onOpenChange });
    open();
    press(button());
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });
});
