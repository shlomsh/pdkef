import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { useTouchArming } from './useTouchArming.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof useTouchArming>;

function Probe() {
  api = useTouchArming();
  return null;
}

function mount() {
  container = document.createElement('div');
  act(() => render(<Probe />, container!));
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useTouchArming', () => {
  it('starts with the marker put down, so a swipe scrolls', () => {
    mount();
    expect(api.armed).toBe(false);
  });

  it('arm picks the marker up and disarm puts it down', () => {
    mount();
    act(() => api.arm());
    expect(api.armed).toBe(true);
    act(() => api.disarm());
    expect(api.armed).toBe(false);
  });

  it('arm and disarm are the same functions across renders', () => {
    mount();
    const { arm, disarm } = api;
    act(() => api.arm());
    expect(api.arm).toBe(arm);
    expect(api.disarm).toBe(disarm);
  });
});
