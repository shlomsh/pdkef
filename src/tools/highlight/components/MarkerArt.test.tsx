import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { BLANK_BARREL, WHEEL_CAP } from '../lib/marker/markerShades.ts';
import MarkerArt, { MoreInk } from './MarkerArt.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});
function mount(node: preact.VNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(node, container!));
  return container.querySelector<HTMLElement>('[data-marker-art]')!;
}
const v = (el: HTMLElement, name: string) => el.style.getPropertyValue(name);

describe('MarkerArt', () => {
  it('marks the picked one', () => {
    expect(mount(<MarkerArt ink="#FFF34D" picked />).hasAttribute('data-picked')).toBe(true);
    act(() => render(<MarkerArt ink="#FFF34D" picked={false} />, container!));
    expect(container!.querySelector('[data-marker-art]')!.hasAttribute('data-picked')).toBe(false);
  });

  it('draws the palette marker in its own shades', () => {
    const art = mount(<MarkerArt ink="#FFF34D" picked={false} />);
    expect(v(art, '--ink')).toBe('#FFF34D');
    expect(v(art, '--cap').toLowerCase()).toBe('#f5cf14');
    expect(v(art, '--barrel').toLowerCase()).toBe('#ffe83a');
    expect(art.getAttribute('aria-hidden')).toBe('true');
  });

  it('derives shades for a custom ink', () => {
    const art = mount(<MarkerArt ink="#a99cff" picked />);
    expect(v(art, '--ink')).toBe('#a99cff');
    expect(v(art, '--cap')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(v(art, '--cap').toLowerCase()).not.toBe('#a99cff');
  });

  it('the wheel is a blank body under a rainbow cap until a custom color is in force', () => {
    const art = mount(<MarkerArt wheel ink="#a99cff" picked={false} />);
    expect(v(art, '--barrel').toLowerCase()).toBe(BLANK_BARREL.toLowerCase());
    expect(v(art, '--nib').toLowerCase()).toBe(BLANK_BARREL.toLowerCase());
    expect(v(art, '--cap-image')).toBe(WHEEL_CAP);
    expect(v(art, '--ink').toLowerCase()).toBe(BLANK_BARREL.toLowerCase());
  });

  it('the picked wheel wears the custom ink on its nib and band', () => {
    const art = mount(<MarkerArt wheel ink="#a99cff" picked />);
    expect(v(art, '--nib')).toBe('#a99cff');
    expect(v(art, '--ink')).toBe('#a99cff');
    expect(v(art, '--cap-image')).toBe(WHEEL_CAP);
  });
});

describe('MoreInk', () => {
  it('is a band in the ink', () => {
    mount(<MoreInk ink="#FFB15C" />);
    const band = container!.querySelector<HTMLElement>('[data-more-ink]')!;
    expect(band.style.getPropertyValue('--ink')).toBe('#FFB15C');
  });
});
