import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { underlineInk } from '#editor/model/underlineInk.ts';
import { DEFAULT_MARKER, TOP_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import MarkerButton from './MarkerButton.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

const markProps = (look: Marker = { ...DEFAULT_MARKER }) => ({ look, onChange: vi.fn(), onComment: vi.fn(), onDelete: vi.fn(), onRelease: vi.fn() });

function mount(over: Partial<Parameters<typeof MarkerButton>[0]> = {}) {
  const props = { marker: DEFAULT_MARKER as Marker, onTap: vi.fn(), ...over };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<MarkerButton {...props} />, container!));
  const button = () => container!.querySelector(`button[aria-label="${t.marker}"]`) as HTMLButtonElement;
  return { props, button };
}

const press = (el: Element) => act(() => { (el as HTMLElement).click(); });
const named = (name: string) => container!.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;

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

  it('shows a pencil marker as a hatch badge in its color and opacity', () => {
    mount({ marker: { color: '#FF8FCF', style: 'pencil', opacity: 0.6 } });
    const hatch = container!.querySelector('[data-marker-pencil]') as HTMLElement;
    expect(hatch).not.toBeNull();
    expect(hatch.style.color.toLowerCase()).toContain('rgb(255, 143, 207)');
    expect(container!.querySelector('[data-marker-dot]')).toBeNull();
    expect(container!.querySelector('[data-marker-underline]')).toBeNull();
  });

  describe('without a mark it never opens a panel', () => {
    it('a click arms the marker and opens nothing, on every pointer', () => {
      const { props, button } = mount({});
      press(button());
      expect(props.onTap).toHaveBeenCalledTimes(1);
      expect(button().hasAttribute('aria-expanded')).toBe(false);
      expect(button().hasAttribute('aria-haspopup')).toBe(false);
      expect(container!.querySelector('[role=group]')).toBeNull();
    });

    it('a click while armed disarms it and does not arm again, on every pointer', () => {
      const onDisarm = vi.fn();
      const { props, button } = mount({ armed: true, onDisarm });
      press(button());
      expect(onDisarm).toHaveBeenCalledTimes(1);
      expect(props.onTap).not.toHaveBeenCalled();
      expect(container!.querySelector('[role=group]')).toBeNull();
    });
  });

  it('exposes the armed state as aria-pressed', () => {
    const { button } = mount({ armed: true });
    expect(button().getAttribute('aria-pressed')).toBe('true');
    act(() => render(<MarkerButton marker={DEFAULT_MARKER} onTap={vi.fn()} armed={false} />, container!));
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the armed fill while armed and none once put down, on every pointer (R50)', () => {
    const armed = mount({ armed: true });
    expect(armed.button().hasAttribute('data-armed')).toBe(true);
    act(() => render(null, container!));
    container!.remove();
    const down = mount({ armed: false });
    expect(down.button().hasAttribute('data-armed')).toBe(false);
  });

  describe('on a mark', () => {
    it('opens the panel under the button, with the colors, More, the switch, its setting, Comment and Delete in one row', () => {
      const { button } = mount({ mark: markProps() });
      expect(button().getAttribute('aria-expanded')).toBe('true');
      const row = container!.querySelector('[data-marker-row]')!;
      expect(row.querySelectorAll('[data-highlight-swatch]')).toHaveLength(3);
      expect([...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')).slice(3)).toEqual(
        ['More colors', 'Highlight', 'Underline', 'Pencil', 'Opacity', 'Comment', 'Delete'],
      );
    });

    it('keeps showing the pen on the button', () => {
      const pen = { color: '#FF8FCF', style: 'highlight' as const, opacity: 1 };
      mount({ marker: pen, mark: markProps() });
      expect((container!.querySelector('[data-marker-dot]') as HTMLElement).style.background.toLowerCase()).toContain('rgb(255, 143, 207)');
    });

    it('shows the mark\'s look, and closes when the mark goes away', () => {
      const look = { ...DEFAULT_MARKER, color: TOP_COLORS[2].hex };
      const { props, button } = mount({ mark: markProps(look) });
      expect(container!.querySelectorAll('[data-highlight-swatch]')[2].getAttribute('aria-checked')).toBe('true');
      act(() => render(<MarkerButton {...props} mark={undefined} />, container!));
      expect(button().hasAttribute('aria-expanded')).toBe(false);
      expect(named(t.markComment)).toBeNull();
    });

    it('a swatch changes the mark and keeps the panel open', () => {
      const m = markProps();
      const { button } = mount({ mark: m });
      press(container!.querySelectorAll('[data-highlight-swatch]')[2]);
      expect(m.onChange).toHaveBeenCalledWith({ color: TOP_COLORS[2].hex });
      expect(button().getAttribute('aria-expanded')).toBe('true');
      expect(m.onRelease).not.toHaveBeenCalled();
    });

    it('Highlight | Underline switches the mark both ways', () => {
      const m = markProps();
      const { props } = mount({ mark: m });
      press(named(t.markUnderline));
      expect(m.onChange).toHaveBeenLastCalledWith({ style: 'underline' });
      act(() => render(<MarkerButton {...props} mark={{ ...m, look: { ...DEFAULT_MARKER, style: 'underline' } }} />, container!));
      press(named(t.markHighlight));
      expect(m.onChange).toHaveBeenLastCalledWith({ style: 'highlight' });
    });

    it('Pencil is a third style, one click from either', () => {
      const m = markProps();
      mount({ mark: m });
      press(named(t.markPencil));
      expect(m.onChange).toHaveBeenLastCalledWith({ style: 'pencil' });
    });

    it('opacity is one click away on the setting button', () => {
      const m = markProps();
      mount({ mark: m });
      expect(container!.querySelector('[data-opacity-slider]')).toBeNull();
      press(named(t.markOpacityMenu));
      const range = document.querySelector('[data-opacity-slider] input') as HTMLInputElement;
      range.value = '0.7';
      act(() => { range.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(m.onChange).toHaveBeenLastCalledWith({ style: 'highlight', opacity: 0.7 });
    });

    describe('keys, for a touch screen with a keyboard (R9)', () => {
      const key = (k: string, target: EventTarget = document.body) =>
        act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });

      it('1 to 6 pick a color and U flips the style, the panel staying open', () => {
        const m = markProps();
        mount({ mark: m });
        key('3');
        expect(m.onChange).toHaveBeenLastCalledWith({ color: TOP_COLORS[2].hex });
        key('u');
        expect(m.onChange).toHaveBeenLastCalledWith({ style: 'underline' });
        expect(m.onRelease).not.toHaveBeenCalled();
      });

      it('C comments and Delete deletes, each releasing the mark as their buttons do', () => {
        const m = markProps();
        mount({ mark: m });
        key('c');
        expect(m.onComment).toHaveBeenCalledTimes(1);
        key('Delete');
        expect(m.onDelete).toHaveBeenCalledTimes(1);
        expect(m.onRelease).toHaveBeenCalledTimes(2);
      });

      it('nothing answers while typing, or with no mark picked', () => {
        const m = markProps();
        mount({ mark: m });
        const input = document.createElement('textarea');
        document.body.append(input);
        key('3', input);
        input.remove();
        expect(m.onChange).not.toHaveBeenCalled();
        act(() => render(null, container!));
        mount();
        key('Delete');
        expect(m.onDelete).not.toHaveBeenCalled();
      });
    });

    it('Comment and Delete act, then release the mark', () => {
      const m = markProps();
      mount({ mark: m });
      press(named(t.markComment));
      expect(m.onComment).toHaveBeenCalledTimes(1);
      expect(m.onRelease).toHaveBeenCalledTimes(1);
      press(named(t.markDelete));
      expect(m.onDelete).toHaveBeenCalledTimes(1);
      expect(m.onRelease).toHaveBeenCalledTimes(2);
    });

    it('a tap on Marker releases the mark and leaves arming alone', () => {
      const onDisarm = vi.fn();
      const m = markProps();
      const { button, props } = mount({ armed: true, onDisarm, mark: m });
      press(button());
      expect(m.onRelease).toHaveBeenCalledTimes(1);
      expect(onDisarm).not.toHaveBeenCalled();
      expect(props.onTap).not.toHaveBeenCalled();
    });

    it('Escape and a press outside release the mark', () => {
      const m = markProps();
      mount({ mark: m });
      act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(m.onRelease).toHaveBeenCalledTimes(1);
      act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
      expect(m.onRelease).toHaveBeenCalledTimes(2);
    });

    it('Escape on the panel releases the mark and nothing above it hears the key', () => {
      const m = markProps();
      mount({ mark: m });
      const above = vi.fn();
      document.addEventListener('keydown', above);
      act(() => { container!.querySelector('[data-highlight-swatch]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      document.removeEventListener('keydown', above);
      expect(m.onRelease).toHaveBeenCalledTimes(1);
      expect(above).not.toHaveBeenCalled();
    });

    it('reports when its panel opens and closes', () => {
      const onOpenChange = vi.fn();
      const { props } = mount({ onOpenChange, mark: markProps() });
      act(() => render(<MarkerButton {...props} mark={undefined} />, container!));
      expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
    });

    describe('More', () => {
      const more = () => container!.querySelector('[data-more-colors]') as HTMLButtonElement;
      const hidden = () => [...document.querySelectorAll('[data-more-popover] [data-highlight-swatch]')] as HTMLElement[];

      it('opens orange, red, blue and the color wheel', () => {
        mount({ mark: markProps() });
        press(more());
        expect(hidden().map((el) => el.getAttribute('aria-label'))).toEqual(['Orange', 'Red', 'Blue']);
        expect(document.querySelector('[data-more-popover] [data-color-wheel]')).not.toBeNull();
      });

      it('a pick applies, closes the popover and leaves the panel open', () => {
        const m = markProps();
        const { button } = mount({ mark: m });
        press(more());
        press(hidden()[2]);
        expect(m.onChange).toHaveBeenCalledWith({ color: '#7FDBFF' });
        expect(document.querySelector('[data-more-popover]')).toBeNull();
        expect(button().getAttribute('aria-expanded')).toBe('true');
      });

      it('the wheel commits a chosen color once', () => {
        const m = markProps();
        mount({ mark: m });
        press(more());
        const input = document.querySelector('[data-color-wheel] input[type="color"]') as HTMLInputElement;
        input.value = '#336699';
        act(() => { input.dispatchEvent(new Event('input', { bubbles: true })); });
        expect(m.onChange).not.toHaveBeenCalled();
        act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(m.onChange).toHaveBeenCalledWith({ color: '#336699' });
      });

      it('Escape closes More first, then the panel', () => {
        const m = markProps();
        const { button } = mount({ mark: m });
        press(more());
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(document.querySelector('[data-more-popover]')).toBeNull();
        expect(m.onRelease).not.toHaveBeenCalled();
        expect(button().getAttribute('aria-expanded')).toBe('true');
        act(() => { more().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(m.onRelease).toHaveBeenCalledTimes(1);
      });
    });
  });
});
