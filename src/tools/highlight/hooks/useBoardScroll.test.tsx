import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useRef } from 'preact/hooks';
import { boardLayout } from '../lib/zoom/board.ts';
import { useBoardScroll } from './useBoardScroll.ts';

const pages = [{ width: 600, height: 800, textLeft: 50, textRight: 550 }];
let board: ReturnType<typeof boardLayout> | null = null;

function Lamp({ inset }: { inset: number }) {
  const ref = useRef<HTMLDivElement>(null);
  board = useBoardScroll({ workspaceRef: ref, fullscreen: true, pages, zoom: 1, setting: 'width', view: { width: 1000, height: 700, inset } }).board;
  return <div ref={ref} />;
}

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) act(() => render(null, host!));
  host?.remove();
  host = null;
  vi.restoreAllMocks();
});

describe('useBoardScroll', () => {
  it('centres the lamp board in the view less the measured inset, and reads no style while rendering', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<Lamp inset={0} />, host!));
    const styles = vi.spyOn(window, 'getComputedStyle');
    act(() => render(<Lamp inset={24} />, host!));
    expect(board).toEqual(boardLayout(600, 1000, 24));
    expect(styles).not.toHaveBeenCalled();
  });
});
