import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coarsePointer, useMarkerArming } from './useMarkerArming.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof useMarkerArming>;

function Probe() {
  api = useMarkerArming();
  return null;
}

function mount() {
  container = document.createElement('div');
  act(() => render(<Probe />, container!));
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useMarkerArming', () => {
  // Forced: setup.js answers yes to every query, so a fine pointer needs a screen that answers no.
  const finePointer = () => vi.stubGlobal('matchMedia', () => ({ matches: false }));

  it('starts with the marker in the hand on a touch screen, so a file opens ready to mark', () => {
    expect(coarsePointer()).toBe(true);
    mount();
    expect(api.armed).toBe(true);
  });

  it('starts with the marker in the hand on a fine pointer too: Marker toggles it for every pointer', () => {
    finePointer();
    expect(coarsePointer()).toBe(false);
    mount();
    expect(api.armed).toBe(true);
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
