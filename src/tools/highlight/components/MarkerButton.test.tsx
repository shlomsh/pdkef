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

  it('a click opens the six colors, the color wheel and the Highlight | Underline toggle', () => {
    const { open, button } = mount();
    expect(button().getAttribute('aria-expanded')).toBe('false');
    open();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(container!.querySelectorAll('[data-highlight-swatch]')).toHaveLength(HIGHLIGHT_COLORS.length);
    expect(container!.querySelector('[data-style-toggle]')).not.toBeNull();
    expect(container!.querySelectorAll(`button[aria-label="${t.markUnderline}"]`)).toHaveLength(1);
    expect(container!.querySelector(`button[aria-label="${t.markCustom}"]`)).toBeNull();
    expect(container!.querySelector('[data-color-wheel]')).not.toBeNull();
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
    expect(container!.querySelector(`button[aria-label="${t.markUnderline}"]`)!.getAttribute('aria-pressed')).toBe('true');
    press(container!.querySelector(`button[aria-label="${t.markHighlight}"]`)!);
    expect(props.onChange).toHaveBeenLastCalledWith({ style: 'highlight' });
  });

  it('the wheel commits a chosen color once, as a re-arm', () => {
    const { props, open } = mount();
    open();
    const input = container!.querySelector('[data-color-wheel] input[type="color"]') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBe(t.markColorInput);
    input.value = '#336699';
    act(() => { input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(props.onChange).not.toHaveBeenCalled();
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(props.onChange).toHaveBeenCalledWith({ color: '#336699' });
  });

  it('the panel holds no slider row, opacity is one click away on the highlight caret, each move a re-arm', () => {
    const { props, open } = mount();
    open();
    expect(container!.querySelector('[data-opacity-slider]')).toBeNull();
    act(() => container!.querySelector<HTMLElement>('button[title="Opacity"]')!.click());
    const range = document.querySelector('[data-opacity-slider] input') as HTMLInputElement;
    range.value = '0.5';
    act(() => { range.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(props.onChange).toHaveBeenLastCalledWith({ style: 'highlight', opacity: 0.5 });
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

  it('Escape on the document closes the menu, as after a tap on WebKit', () => {
    const { open, button } = mount();
    open();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(button().getAttribute('aria-expanded')).toBe('false');
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

  it('on a coarse pointer a tap arms the marker and opens nothing', () => {
    const { props, open, button } = mount({ isCoarse: () => true });
    open();
    expect(props.onTap).toHaveBeenCalledTimes(1);
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(container!.querySelector('[role=group]')).toBeNull();
  });

  it('given a mark on a coarse pointer, the panel is open on the mark and Marker releases it', () => {
    const onRelease = vi.fn();
    const mark = { look: DEFAULT_MARKER as Marker, onChange: vi.fn(), onComment: vi.fn(), onDelete: vi.fn(), onRelease };
    const { button } = mount({ isCoarse: () => true, armed: true, mark });
    expect(container!.querySelector('[role=group]')).not.toBeNull();
    press(button());
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('on a coarse pointer a tap while armed disarms the marker, closes the panel and does not arm again', () => {
    const onDisarm = vi.fn();
    const { props, button } = mount({ isCoarse: () => true, armed: true, onDisarm });
    press(button());
    expect(onDisarm).toHaveBeenCalledTimes(1);
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(container!.querySelector('[role=group]')).toBeNull();
    expect(props.onTap).not.toHaveBeenCalled();
  });

  it('a fine pointer never disarms', () => {
    const onDisarm = vi.fn();
    const { button } = mount({ armed: true, onDisarm });
    press(button());
    expect(onDisarm).not.toHaveBeenCalled();
  });

  it('given a mark, a tap on Marker releases the mark and leaves arming alone', () => {
    const onDisarm = vi.fn();
    const onRelease = vi.fn();
    const mark = { look: DEFAULT_MARKER as Marker, onChange: vi.fn(), onComment: vi.fn(), onDelete: vi.fn(), onRelease };
    const { button } = mount({ isCoarse: () => true, armed: true, onDisarm, mark });
    press(button());
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onDisarm).not.toHaveBeenCalled();
  });

  it('shows the armed fill on touch only; a fine pointer always has the marker in hand and shows none', () => {
    const fine = mount({ armed: true, isCoarse: () => false });
    expect(fine.button().hasAttribute('data-armed')).toBe(false);
    act(() => render(null, container!));
    container!.remove();
    const touch = mount({ armed: true, isCoarse: () => true });
    expect(touch.button().hasAttribute('data-armed')).toBe(true);
  });

  it('reports when its menu opens and closes', () => {
    const onOpenChange = vi.fn();
    const { open, button } = mount({ onOpenChange });
    open();
    press(button());
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  describe('on a mark', () => {
    const mark = () => ({ look: { ...DEFAULT_MARKER } as Marker, onChange: vi.fn(), onComment: vi.fn(), onDelete: vi.fn(), onRelease: vi.fn() });
    const named = (name: string) => container!.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;

    it('is open with Comment and Delete, and the pen button keeps showing the pen', () => {
      const pen = { color: '#FF8FCF', style: 'highlight' as const, opacity: 1 };
      const { button } = mount({ marker: pen, mark: mark() });
      expect(button().getAttribute('aria-expanded')).toBe('true');
      expect(named(t.markComment)).not.toBeNull();
      expect(named(t.markDelete)).not.toBeNull();
      expect((container!.querySelector('[data-marker-dot]') as HTMLElement).style.background.toLowerCase()).toContain('rgb(255, 143, 207)');
    });

    it('shows the mark\'s look: a swatch pressed, and no Comment or Delete for the pen', () => {
      const look = { ...DEFAULT_MARKER, color: HIGHLIGHT_COLORS[3].hex };
      mount({ mark: { ...mark(), look } });
      expect(container!.querySelectorAll('[data-highlight-swatch]')[3].getAttribute('aria-pressed')).toBe('true');
      act(() => render(<MarkerButton marker={DEFAULT_MARKER} onChange={vi.fn()} />, container!));
      expect(named(t.markComment)).toBeNull();
    });

    it('a swatch changes the mark, not the pen, and keeps the panel open', () => {
      const m = mark();
      const { props, button } = mount({ mark: m });
      press(container!.querySelectorAll('[data-highlight-swatch]')[2]);
      expect(m.onChange).toHaveBeenCalledWith({ color: HIGHLIGHT_COLORS[2].hex });
      expect(props.onChange).not.toHaveBeenCalled();
      expect(button().getAttribute('aria-expanded')).toBe('true');
      expect(m.onRelease).not.toHaveBeenCalled();
    });

    it('Comment and Delete act, then release the mark', () => {
      const m = mark();
      mount({ mark: m });
      press(named(t.markComment));
      expect(m.onComment).toHaveBeenCalledTimes(1);
      expect(m.onRelease).toHaveBeenCalledTimes(1);
      press(named(t.markDelete));
      expect(m.onDelete).toHaveBeenCalledTimes(1);
      expect(m.onRelease).toHaveBeenCalledTimes(2);
    });

    it('Escape and a press outside release the mark', () => {
      const m = mark();
      mount({ mark: m });
      act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(m.onRelease).toHaveBeenCalledTimes(1);
      act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
      expect(m.onRelease).toHaveBeenCalledTimes(2);
    });

    it('closes when the mark goes away', () => {
      const m = mark();
      const { props, button } = mount({ mark: m });
      act(() => render(<MarkerButton {...props} mark={undefined} />, container!));
      expect(button().getAttribute('aria-expanded')).toBe('false');
    });
  });
});
