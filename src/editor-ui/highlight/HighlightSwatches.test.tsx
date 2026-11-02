import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import HighlightSwatches from './HighlightSwatches.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(props: Partial<Parameters<typeof HighlightSwatches>[0]> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const onChange = vi.fn();
  act(() => render(<HighlightSwatches color={HIGHLIGHT_COLORS[0].hex} t={englishSignMessages} onChange={onChange} {...props} />, container!));
  return onChange;
}

describe('HighlightSwatches', () => {
  it('shows the six colors and a trailing divider by default', () => {
    mount();
    expect(container!.querySelectorAll('[data-highlight-swatch]')).toHaveLength(6);
    expect(container!.querySelectorAll('div')).toHaveLength(1);
  });

  it('shows only the given colors, and no divider when asked', () => {
    const onChange = mount({ colors: [HIGHLIGHT_COLORS[2], HIGHLIGHT_COLORS[4]], divider: false });
    const swatches = container!.querySelectorAll<HTMLElement>('[data-highlight-swatch]');
    expect(swatches).toHaveLength(2);
    expect(container!.querySelector('div')).toBeNull();
    act(() => swatches[1].click());
    expect(onChange).toHaveBeenCalledWith({ color: HIGHLIGHT_COLORS[4].hex });
  });

  it('stays a set of pressed buttons by default (Sign)', () => {
    mount();
    const first = container!.querySelector('[data-highlight-swatch]')!;
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(first.hasAttribute('role')).toBe(false);
  });

  it('as radios: checked instead of pressed, with one tab stop on the checked one', () => {
    mount({ colors: HIGHLIGHT_COLORS.slice(0, 3), color: HIGHLIGHT_COLORS[1].hex, radio: true });
    const swatches = [...container!.querySelectorAll<HTMLElement>('[data-highlight-swatch]')];
    expect(swatches.map((b) => b.getAttribute('role'))).toEqual(['radio', 'radio', 'radio']);
    expect(swatches.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(swatches.some((b) => b.hasAttribute('aria-pressed'))).toBe(false);
    expect(swatches.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('as radios with none checked, the first is the tab stop', () => {
    mount({ colors: HIGHLIGHT_COLORS.slice(0, 3), color: '#123456', radio: true });
    const swatches = [...container!.querySelectorAll<HTMLElement>('[data-highlight-swatch]')];
    expect(swatches.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
  });
});
