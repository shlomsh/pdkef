import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { useMarkPanel } from './useMarkPanel.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof useMarkPanel>;

function Probe({ ids }: { ids: string[] }) {
  api = useMarkPanel(ids.map((id) => ({ id })));
  return null;
}

function mount(ids = ['a', 'b']) {
  container = document.createElement('div');
  act(() => render(<Probe ids={ids} />, container!));
}

function rerender(ids: string[]) {
  act(() => render(<Probe ids={ids} />, container!));
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

  it('lets go of a mark that disappears, and does not reopen when it comes back', () => {
    mount();
    act(() => api.pick('a'));
    rerender(['b']);
    expect(api.markId).toBeNull();
    rerender(['a', 'b']);
    expect(api.markId).toBeNull();
  });

  it('keeps the picked mark while other marks come and go', () => {
    mount();
    act(() => api.pick('a'));
    rerender(['a']);
    expect(api.markId).toBe('a');
  });
});
