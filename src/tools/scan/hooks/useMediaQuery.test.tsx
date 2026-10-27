import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { useMediaQuery } from './useMediaQuery.ts';

function fakeQuery(initial: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  return { list, flip(next: boolean) { list.matches = next; listeners.forEach((fn) => fn()); }, listeners };
}

describe('useMediaQuery', () => {
  const original = window.matchMedia;
  let container: HTMLElement;
  afterEach(() => {
    window.matchMedia = original;
    render(null, container);
    container.remove();
  });

  it('says whether the query matches, and follows it when the window crosses it', () => {
    const q = fakeQuery(true);
    window.matchMedia = (() => q.list) as unknown as typeof window.matchMedia;
    let seen: boolean[] = [];
    function Probe() { seen.push(useMediaQuery('(min-width: 1024px)')); return null; }
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<Probe />, container));
    expect(seen.at(-1)).toBe(true);
    act(() => q.flip(false));
    expect(seen.at(-1)).toBe(false);
    act(() => render(null, container));
    expect(q.listeners.size).toBe(0);
    seen = [];
  });
});
