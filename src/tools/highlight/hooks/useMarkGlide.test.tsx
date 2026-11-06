import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarkGlide } from './useMarkGlide.ts';

type Menu = 'more' | 'look' | null;
let panel: HTMLElement;

function Probe({ markId, menu }: { markId: string | null; menu: Menu }) {
  useMarkGlide(markId, menu, { current: panel });
  return null;
}

const rect = (el: Element, top: number, bottom: number) => {
  (el as HTMLElement).getBoundingClientRect = () => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
};

let container: HTMLElement;
let board: HTMLElement;
let mark: HTMLElement;
let moved = '';

const mount = (markId: string | null, menu: Menu = null) => act(() => render(<Probe markId={markId} menu={menu} />, container));

beforeEach(() => {
  moved = '';
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  if (!('CSS' in globalThis)) vi.stubGlobal('CSS', { escape: (s: string) => s });
  vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ translate: moved || 'none' }) as unknown as CSSStyleDeclaration);
  board = document.createElement('div');
  board.setAttribute('data-lamp-part', 'board');
  mark = document.createElement('div');
  mark.setAttribute('data-editor-element-id', 'm1');
  board.appendChild(mark);
  panel = document.createElement('div');
  document.body.append(board, panel);
  container = document.createElement('div');
  document.body.appendChild(container);
  rect(panel, 0, 100);
});

afterEach(() => {
  act(() => render(null, container));
  container.remove(); board.remove(); panel.querySelectorAll('*').forEach((n) => n.remove()); panel.remove();
  document.querySelectorAll('[data-editor-popover]').forEach((n) => n.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useMarkGlide', () => {
  it('moves the board down so a mark under the panel clears it', () => {
    rect(mark, 40, 50);
    mount('m1');
    expect(board.style.translate).toBe('0 68px');
  });

  it('leaves the board alone when the mark is already below the panel', () => {
    rect(mark, 300, 310);
    mount('m1');
    expect(board.style.translate).toBe('');
  });

  it('an open menu popover counts as cover', () => {
    rect(mark, 150, 160);
    const pop = document.createElement('div');
    pop.setAttribute('data-editor-popover', '');
    rect(pop, 100, 220);
    document.body.appendChild(pop);
    mount('m1', 'more');
    expect(board.style.translate).toBe('0 78px');
  });

  it('ignores the popover when no menu is open', () => {
    rect(mark, 150, 160);
    const pop = document.createElement('div');
    pop.setAttribute('data-editor-popover', '');
    rect(pop, 100, 220);
    document.body.appendChild(pop);
    mount('m1', null);
    expect(board.style.translate).toBe('');
  });

  it('letting the mark go clears it', () => {
    rect(mark, 40, 50);
    mount('m1');
    mount(null);
    expect(board.style.translate).toBe('');
  });

  it('subtracts how far the board has already moved so the answer does not grow', () => {
    moved = '0px 30px';
    board.style.translate = '0 30px';
    rect(mark, 70, 80);
    mount('m1');
    expect(board.style.translate).toBe('0 68px');
  });

  it('unmount clears it', () => {
    rect(mark, 40, 50);
    mount('m1');
    act(() => render(null, container));
    expect(board.style.translate).toBe('');
  });
});
