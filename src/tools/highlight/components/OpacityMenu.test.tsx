import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OpacityMenu from './OpacityMenu.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(onChange = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<OpacityMenu value={0.8} onChange={onChange} />, container!));
  return onChange;
}
const trigger = () => container!.querySelector<HTMLElement>('button[aria-haspopup]')!;
const range = () => document.querySelector<HTMLInputElement>('[data-opacity-slider] input');

describe('OpacityMenu', () => {
  it('is a caret that holds the slider closed until it is opened', () => {
    mount();
    expect(trigger().title).toBe('Opacity');
    expect(range()).toBeNull();
    act(() => trigger().click());
    expect(range()!.value).toBe('0.8');
  });

  it('the slider reports the opacity', () => {
    const onChange = mount();
    act(() => trigger().click());
    const input = range()!;
    act(() => { input.value = '0.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it('Escape closes it', () => {
    mount();
    act(() => trigger().click());
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(range()).toBeNull();
  });
});
