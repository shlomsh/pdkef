import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';
import { useMarker } from './useMarker.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof useMarker>;

function Probe() {
  api = useMarker();
  return null;
}

function mount() {
  container = document.createElement('div');
  act(() => render(<Probe />, container!));
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useMarker', () => {
  it('starts with the default marker armed', () => {
    mount();
    expect(api.marker).toEqual(DEFAULT_MARKER);
  });

  it('rearm merges a change into the armed marker', () => {
    mount();
    act(() => api.rearm({ color: '#FF8FCF', style: 'underline' }));
    expect(api.marker).toEqual({ color: '#FF8FCF', style: 'underline', opacity: 1 });
  });

  it('rearm keeps opacity within 0.3 to 1', () => {
    mount();
    act(() => api.rearm({ opacity: 0.05 }));
    expect(api.marker.opacity).toBe(0.3);
  });

  it('two changes in one batch both land', () => {
    mount();
    act(() => { api.rearm({ color: '#FF8080' }); api.rearm({ opacity: 0.5 }); });
    expect(api.marker).toEqual({ color: '#FF8080', style: 'highlight', opacity: 0.5 });
  });

  it('rearm is the same function across renders', () => {
    mount();
    const first = api.rearm;
    act(() => api.rearm({ color: '#FF8080' }));
    expect(api.rearm).toBe(first);
  });
});
