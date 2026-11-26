import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { setScreen } from '../../../test/support/screen.ts';
import { useMediaQuery } from './useMediaQuery.ts';

describe('useMediaQuery', () => {
  let container: HTMLElement;
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('says whether the query matches, and follows it when the window crosses it', () => {
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
    act(() => render(null, container));
    seen = [];
    act(() => setScreen({ width: 700 }));
    expect(seen).toEqual([]);
  });
});
