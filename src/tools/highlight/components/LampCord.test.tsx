import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LampCord from './LampCord.tsx';

let container: HTMLElement | null = null;
afterEach(() => { if (container) { act(() => render(null, container!)); container.remove(); container = null; } });

describe('LampCord', () => {
  it('is one real button named Full screen, and pulling it calls the handler', () => {
    const onPull = vi.fn();
    container = document.createElement('div');
    act(() => render(<LampCord onPull={onPull} />, container!));
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Full screen');
    act(() => buttons[0].click());
    expect(onPull).toHaveBeenCalledTimes(1);
  });

  it('carries the parts the entrance and exit animate', () => {
    container = document.createElement('div');
    act(() => render(<LampCord onPull={() => {}} />, container!));
    for (const part of ['cord', 'settle', 'line', 'pull', 'tag']) expect(container.querySelector(`[data-lamp-part="${part}"]`), part).not.toBeNull();
    expect(container.querySelector('[data-lamp-bead]')).not.toBeNull();
  });

  it('the tag is inside the button, hidden from assistive tech, so a click on the words pulls the cord', () => {
    const onPull = vi.fn();
    container = document.createElement('div');
    act(() => render(<LampCord onPull={onPull} />, container!));
    const tag = container.querySelector<HTMLElement>('[data-lamp-part="tag"]')!;
    expect(tag.closest('button')).not.toBeNull();
    expect(tag.getAttribute('aria-hidden')).toBe('true');
    act(() => tag.click());
    expect(onPull).toHaveBeenCalledTimes(1);
  });

  it('the drop-in is flagged until it has played once, then never again', () => {
    container = document.createElement('div');
    act(() => render(<LampCord onPull={() => {}} />, container!));
    const root = container.querySelector<HTMLElement>('[data-lamp-part="cord"]')!;
    expect(root.hasAttribute('data-intro')).toBe(true);
    act(() => { root.firstElementChild!.dispatchEvent(new Event('animationend', { bubbles: true })); });
    expect(root.hasAttribute('data-intro')).toBe(false);
  });
});
