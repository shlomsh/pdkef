import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { underlineInk } from '#editor/model/underlineInk.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import PenHint from './PenHint.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(marker: Marker) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<PenHint marker={marker} text="Swipe to highlight" />, container!));
  return container;
}

describe('PenHint', () => {
  it('shows a highlight pen as a dot in its color, hidden from assistive tech, before the text', () => {
    const root = mount({ color: '#FF8FCF', style: 'highlight', opacity: 1 });
    const dot = root.querySelector('[data-marker-dot]') as HTMLElement;
    expect(dot.style.background.toLowerCase()).toContain('rgb(255, 143, 207)');
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('[data-marker-underline]')).toBeNull();
    expect(root.textContent).toBe('Swipe to highlight');
    expect(dot.compareDocumentPosition(root.querySelector('span span')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows an underline pen as the underline glyph in the darkened ink', () => {
    const root = mount({ color: '#FFF34D', style: 'underline', opacity: 1 });
    const glyph = root.querySelector('[data-marker-underline]') as HTMLElement;
    const rgb = [1, 3, 5].map((i) => parseInt(underlineInk('#FFF34D').slice(i, i + 2), 16)).join(', ');
    expect(glyph.style.background).toContain(`rgb(${rgb})`);
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('[data-marker-dot]')).toBeNull();
  });

  it('marks itself active, so on a phone the shell shows it in place of the file name instead of over it', () => {
    const hint = mount({ color: '#FFF34D', style: 'highlight', opacity: 0.5 }).querySelector('[data-pen-hint]')!;
    expect(hint.hasAttribute('data-status-active')).toBe(true);
  });
});
