import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';
import { serializeMarker } from '../lib/marker/markerMemory.ts';
import { useMarker, useMarkerMemory } from './useMarker.ts';

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

describe('useMarkerMemory', () => {
  const STORE_KEY = 'pdkef:highlight:marker-default';
  const pink = { color: '#FF8FCF', style: 'underline', opacity: 0.6 } as const;
  let memoryApi: ReturnType<typeof useMarker> & ReturnType<typeof useMarkerMemory>;

  function MemoryProbe() {
    const m = useMarker();
    const memory = useMarkerMemory(m);
    memoryApi = { ...m, ...memory };
    return null;
  }
  function mountMemory() {
    container = document.createElement('div');
    act(() => render(<MemoryProbe />, container!));
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('a new document with nothing remembered gets the yellow marker and keeps no marker of its own', () => {
    mountMemory();
    act(() => memoryApi.restore(undefined));
    expect(memoryApi.marker).toEqual(DEFAULT_MARKER);
    expect(memoryApi.details).toEqual({});
    expect(memoryApi.changed).toBe(false);
  });

  it("restores the document's own marker, and keeps carrying it without calling that a change", () => {
    mountMemory();
    act(() => memoryApi.restore({ marker: { action: 'alter', value: serializeMarker(pink) } }));
    expect(memoryApi.marker).toEqual(pink);
    expect(memoryApi.changed).toBe(false);
    expect(memoryApi.details).toEqual({ marker: { action: 'alter', value: serializeMarker(pink) } });
  });

  it('a draft marker that does not validate falls back to the remembered default', () => {
    localStorage.setItem(STORE_KEY, serializeMarker(pink));
    mountMemory();
    act(() => memoryApi.restore({ marker: { action: 'alter', value: '{"color":"red"}' } }));
    expect(memoryApi.marker).toEqual(pink);
    expect(memoryApi.details).toEqual({});
  });

  it('a new document starts with the marker the reader used last', () => {
    mountMemory();
    act(() => memoryApi.restore(undefined));
    act(() => memoryApi.rearm({ color: '#7FDBFF' }));
    act(() => render(null, container!));
    container!.remove();
    mountMemory();
    act(() => memoryApi.restore(undefined));
    expect(memoryApi.marker.color).toBe('#7FDBFF');
  });

  it('a change marks the document, saves the marker in its details and becomes the default', () => {
    mountMemory();
    act(() => memoryApi.restore(undefined));
    act(() => memoryApi.rearm({ color: '#FF8080', opacity: 0.5 }));
    expect(memoryApi.changed).toBe(true);
    const expected = serializeMarker({ color: '#FF8080', style: 'highlight', opacity: 0.5 });
    expect(memoryApi.details).toEqual({ marker: { action: 'alter', value: expected } });
    expect(localStorage.getItem(STORE_KEY)).toBe(expected);
  });

  it('changing back to the marker the document opened with still remembers it', () => {
    mountMemory();
    act(() => memoryApi.restore(undefined));
    act(() => memoryApi.rearm({ color: '#FF8080' }));
    act(() => memoryApi.rearm({ color: DEFAULT_MARKER.color }));
    expect(localStorage.getItem(STORE_KEY)).toBe(serializeMarker(DEFAULT_MARKER));
  });

  it('opening another document clears the change', () => {
    mountMemory();
    act(() => memoryApi.restore(undefined));
    act(() => memoryApi.rearm({ color: '#FF8080' }));
    act(() => memoryApi.restore(undefined));
    expect(memoryApi.changed).toBe(false);
  });
});
