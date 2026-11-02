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
  it('shows the six colors and a trailing divider', () => {
    mount();
    expect(container!.querySelectorAll('[data-highlight-swatch]')).toHaveLength(6);
    expect(container!.querySelectorAll('div')).toHaveLength(1);
  });

  it('picks a color', () => {
    const onChange = mount();
    act(() => container!.querySelectorAll<HTMLElement>('[data-highlight-swatch]')[4].click());
    expect(onChange).toHaveBeenCalledWith({ color: HIGHLIGHT_COLORS[4].hex });
  });

  it('is a set of pressed buttons', () => {
    mount();
    const first = container!.querySelector('[data-highlight-swatch]')!;
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(first.hasAttribute('role')).toBe(false);
  });

});
