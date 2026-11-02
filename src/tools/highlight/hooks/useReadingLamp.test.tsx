import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { useReadingLamp } from './useReadingLamp.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof useReadingLamp>;
const workspaceRef: { current: HTMLElement | null } = { current: null };

function Probe() {
  api = useReadingLamp(workspaceRef);
  return null;
}

function mount() {
  container = document.createElement('div');
  act(() => render(<Probe />, container!));
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useReadingLamp', () => {
  it('starts outside the lamp', () => {
    mount();
    expect(api.fullscreen).toBe(false);
    expect(api.pseudoFullscreen).toBe(false);
  });

  it('falls back to the pseudo lamp where real fullscreen is missing, and the toggle leaves it', async () => {
    workspaceRef.current = document.createElement('div');
    mount();
    act(() => api.toggleLamp());
    expect(api.pseudoFullscreen).toBe(true);
    expect(api.fullscreen).toBe(true);
    // The entrance plans in a microtask; with nothing to animate it lets go at once.
    await act(async () => { await Promise.resolve(); });
    act(() => api.toggleLamp());
    expect(api.fullscreen).toBe(false);
  });

  it('follows real fullscreen on the workspace, including leaving it with Esc', () => {
    const ws = document.createElement('div');
    workspaceRef.current = ws;
    mount();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => ws });
    act(() => { document.dispatchEvent(new Event('fullscreenchange')); });
    expect(api.fullscreen).toBe(true);
    expect(api.pseudoFullscreen).toBe(false);
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    act(() => { document.dispatchEvent(new Event('fullscreenchange')); });
    expect(api.fullscreen).toBe(false);
  });
});
