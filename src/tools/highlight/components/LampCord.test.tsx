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
});
