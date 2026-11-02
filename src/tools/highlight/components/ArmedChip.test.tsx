import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishHighlightMessages as t } from '../messages.ts';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';
import ArmedChip from './ArmedChip.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(armed: boolean, onStop = vi.fn(), onLook = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<ArmedChip armed={armed} look={DEFAULT_MARKER} onLook={onLook} onStop={onStop} />, container!));
  return { onStop, onLook };
}

describe('ArmedChip', () => {
  it('shows nothing while the marker is down', () => {
    mount(false);
    expect(container!.querySelector('[data-armed-chip]')).toBeNull();
  });

  it('names what a swipe does while the marker is armed, as the label of a status region', () => {
    mount(true);
    const chip = container!.querySelector('[data-armed-chip]')!;
    expect(chip.getAttribute('role')).toBe('status');
    expect(chip.getAttribute('aria-label')).toBe(t.armedAction);
  });

  it('Stop puts the marker down', () => {
    const { onStop } = mount(true);
    const stop = [...container!.querySelectorAll('button')].find((b) => b.textContent === t.armedStop)!;
    act(() => { stop.click(); });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('holds the look controls, then Stop at the end', () => {
    mount(true);
    const chip = container!.querySelector('[data-armed-chip]')!;
    expect(chip.querySelector('[data-style-toggle]')).not.toBeNull();
    expect(chip.querySelector('button[aria-label="Highlight"]')).not.toBeNull();
    expect(chip.lastElementChild?.textContent).toBe(t.armedStop);
  });

  it('a look change goes to onLook', () => {
    const { onLook } = mount(true);
    act(() => { container!.querySelector<HTMLElement>('button[aria-label="Underline"]')!.click(); });
    expect(onLook).toHaveBeenCalledWith({ style: 'underline' });
  });
});
