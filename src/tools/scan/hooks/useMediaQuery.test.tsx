import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setScreen } from '../../../test/support/screen.ts';
import { useMediaQuery } from './useMediaQuery.ts';

describe('useMediaQuery', () => {
  let container: HTMLElement;
  afterEach(() => {
    vi.restoreAllMocks();
    render(null, container);
    container.remove();
  });

  it('says whether the query matches, and follows it when the window crosses it', () => {
    // Spy-through: the real lists; the spies show the hook takes off the listener it put on.
    const asked = vi.spyOn(window, 'matchMedia');
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    let seen: boolean[] = [];
    function Probe() { seen.push(useMediaQuery('(min-width: 1024px)')); return null; }
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<Probe />, container));
    expect(seen.at(-1)).toBe(true);
    act(() => setScreen({ width: 700 }));
    expect(seen.at(-1)).toBe(false);
    act(() => setScreen({ width: 1200 }));
    expect(seen.at(-1)).toBe(true);
    const lists = asked.mock.results.map((result) => result.value);
    const listener = added.mock.calls.find((call, at) => lists.includes(added.mock.contexts[at]) && call[0] === 'change')![1];
    act(() => render(null, container));
    expect(removed.mock.calls.some((call, at) => lists.includes(removed.mock.contexts[at]) && call[0] === 'change' && call[1] === listener)).toBe(true);
  });
});
