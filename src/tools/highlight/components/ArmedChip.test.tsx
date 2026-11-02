import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishHighlightMessages as t } from '../messages.ts';
import ArmedChip from './ArmedChip.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(armed: boolean, onStop = vi.fn(), lamp = false) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<ArmedChip armed={armed} onStop={onStop} lamp={lamp} />, container!));
  return onStop;
}

describe('ArmedChip', () => {
  it('shows nothing while the marker is down', () => {
    mount(false);
    expect(container!.querySelector('[data-armed-chip]')).toBeNull();
  });

  it('says what a swipe does while the marker is armed, in a status region', () => {
    mount(true);
    const chip = container!.querySelector('[data-armed-chip]')!;
    expect(chip.getAttribute('role')).toBe('status');
    expect(chip.textContent).toContain(t.armedAction);
  });

  it('Stop puts the marker down', () => {
    const onStop = mount(true);
    const stop = [...container!.querySelectorAll('button')].find((b) => b.textContent === t.armedStop)!;
    act(() => { stop.click(); });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('in the lamp it is placed on its own under the capsule, which is fixed and gives it no box to hang from', () => {
    mount(true, vi.fn(), true);
    expect(container!.querySelector('[data-armed-chip]')!.hasAttribute('data-lamp')).toBe(true);
    mount(true);
    expect(container!.querySelector('[data-armed-chip]')!.hasAttribute('data-lamp')).toBe(false);
  });
});
