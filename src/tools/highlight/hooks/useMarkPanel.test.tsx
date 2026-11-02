import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { useMarkPanel } from './useMarkPanel.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof useMarkPanel>;

function Probe() {
  api = useMarkPanel();
  return null;
}

function mount() {
  container = document.createElement('div');
  act(() => render(<Probe />, container!));
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useMarkPanel', () => {
  it('starts on the pen, with no mark picked', () => {
    mount();
    expect(api.markId).toBeNull();
  });

  it('pick shows a mark, picking another moves to it, release goes back to the pen', () => {
    mount();
    act(() => api.pick('a'));
    expect(api.markId).toBe('a');
    act(() => api.pick('b'));
    expect(api.markId).toBe('b');
    act(() => api.release());
    expect(api.markId).toBeNull();
  });

  it('pick and release are the same functions across renders', () => {
    mount();
    const { pick, release } = api;
    act(() => api.pick('a'));
    expect(api.pick).toBe(pick);
    expect(api.release).toBe(release);
  });
});
