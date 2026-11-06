import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MARKER, TOP_COLORS, type Marker } from '../lib/marker/markerState.ts';
import MarkPanel, { type PanelMenu } from './MarkPanel.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

// The host owns the open menu, as MarkerButton and RestToolbar do.
function Host({ look, spy, ...rest }: { look: Marker; spy(menu: PanelMenu): void; onChange(): void; onComment(): void; onDelete(): void }) {
  const [menu, setMenu] = useState<PanelMenu>(null);
  return <MarkPanel look={look} menu={menu} onMenuChange={(next) => { spy(next); setMenu(next); }} {...rest} />;
}

function mount(look: Marker = DEFAULT_MARKER) {
  const props = { onChange: vi.fn(), onComment: vi.fn(), onDelete: vi.fn(), onMenuChange: vi.fn() };
  container = document.createElement('div');
  document.body.appendChild(container);
  const { onMenuChange, ...rest } = props;
  const draw = (next: Marker) => act(() => render(<Host look={next} spy={onMenuChange} {...rest} />, container!));
  draw(look);
  return { ...props, draw };
}
const named = (name: string) => container!.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!;
const press = (el: Element) => act(() => { (el as HTMLElement).click(); });

describe('MarkPanel', () => {
  it('holds no menu state: the host\'s menu shows the popover, and the toggle only asks the host', () => {
    const onMenuChange = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    const draw = (menu: PanelMenu) => act(() => render(
      <MarkPanel look={DEFAULT_MARKER} menu={menu} onMenuChange={onMenuChange} onChange={vi.fn()} onComment={vi.fn()} onDelete={vi.fn()} />, container!));
    draw('more');
    expect(document.querySelector('[data-more-popover]')).not.toBeNull();
    press(named('More colors'));
    expect(onMenuChange.mock.calls[0][0]).toBe(null);
    expect(document.querySelector('[data-more-popover]')).not.toBeNull();
    draw('look');
    expect(document.querySelector('[data-more-popover]')).toBeNull();
    expect(document.querySelector('[role="radiogroup"][aria-label="Kind"]')).not.toBeNull();
    draw(null);
    expect(document.querySelector('[role="radiogroup"][aria-label="Kind"]')).toBeNull();
  });

  it('is one row: Comment, three colors, More, Look, Delete, in that order', () => {
    mount();
    const row = container!.querySelector('[data-marker-row]')!;
    const order = [...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(order).toEqual(['Comment', 'Yellow', 'Pink', 'Green', 'More colors', 'Look', 'Delete']);
  });

  it('Comment always says its name; Delete stays an icon', () => {
    mount();
    expect(named('Comment').textContent).toBe('Comment');
    expect(named('Delete').textContent).toBe('');
  });

  describe('the colors', () => {
    const group = () => container!.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Color"]')!;
    const radios = () => [...group().querySelectorAll<HTMLElement>('[role="radio"]')];
    const arrow = (k: string, target: Element) =>
      act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });

    it('are one radio group of the three top colors, the current one checked', () => {
      mount();
      expect(radios().map((r) => r.getAttribute('aria-label'))).toEqual(['Yellow', 'Pink', 'Green']);
      expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    });

    it('each draws a marker, the checked one picked; More wears an ink band only for a hidden color', () => {
      const { draw } = mount();
      expect(radios().map((r) => !!r.querySelector('[data-marker-art]'))).toEqual([true, true, true]);
      expect(radios().map((r) => !!r.querySelector('[data-marker-art][data-picked]'))).toEqual([true, false, false]);
      expect(named('More colors').querySelector('[data-more-ink]')).toBeNull();
      draw({ ...DEFAULT_MARKER, color: '#FFB15C' });
      expect(named('More colors').querySelector('[data-more-ink]')).not.toBeNull();
    });

    it('sit in one track with More, which stays a plain button outside the group', () => {
      mount();
      const track = container!.querySelector('[data-color-track]')!;
      expect(track.contains(group())).toBe(true);
      const more = named('More colors');
      expect(track.contains(more)).toBe(true);
      expect(group().contains(more)).toBe(false);
    });

    it('arrow keys check the next color and wrap', () => {
      const { onChange } = mount();
      radios()[0].focus();
      arrow('ArrowRight', radios()[0]);
      expect(onChange).toHaveBeenLastCalledWith({ color: TOP_COLORS[1].hex });
      expect(document.activeElement).toBe(radios()[1]);
      radios()[0].focus();
      arrow('ArrowLeft', radios()[0]);
      expect(onChange).toHaveBeenLastCalledWith({ color: TOP_COLORS[2].hex });
    });

    it('with a color from More, no top color is checked and More shows it', () => {
      mount({ ...DEFAULT_MARKER, color: '#123456' });
      expect(radios().every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
      expect(named('More colors').getAttribute('aria-pressed')).toBe('true');
    });
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

  it('Look opens the menu through the host', () => {
    const { onMenuChange } = mount();
    press(named('Look'));
    expect(onMenuChange).toHaveBeenLastCalledWith('look');
    expect(document.querySelector('[role="radiogroup"][aria-label="Kind"]')).not.toBeNull();
  });

  describe('More', () => {
    const more = () => container!.querySelector<HTMLElement>('[data-more-colors]')!;

    it('shows its chevron alone while the color is a top one', () => {
      mount();
      expect(more().querySelector('polyline')).not.toBeNull();
      expect(more().querySelector('[data-more-ink]')).toBeNull();
      expect(more().getAttribute('aria-pressed')).toBeNull();
    });

    it('keeps its chevron and shows the hidden color as its own marker, uncapped over its band, before it', () => {
      mount({ ...DEFAULT_MARKER, color: '#FF8080' });
      expect(more().querySelector('polyline')).not.toBeNull();
      expect(more().getAttribute('aria-pressed')).toBe('true');
      const slot = more().querySelector<HTMLElement>('[data-more-ink]')!;
      const art = slot.querySelector<HTMLElement>('[data-marker-art][data-picked]')!;
      expect(art.style.getPropertyValue('--ink').toLowerCase()).toBe('#ff8080');
      expect(slot.nextElementSibling!.tagName.toLowerCase()).toBe('svg');
    });

    it('a custom color shows its marker too, and a pick applies', () => {
      const { onChange } = mount({ ...DEFAULT_MARKER, color: '#336699' });
      expect(more().querySelector('[data-more-ink] [data-marker-art][data-picked]')).not.toBeNull();
      press(more());
      press(document.querySelectorAll('[data-more-popover] [data-highlight-swatch]')[1]);
      expect(onChange).toHaveBeenCalledWith({ color: '#FF8080' });
      expect(document.querySelector('[data-more-popover]')).toBeNull();
    });
  });
});
