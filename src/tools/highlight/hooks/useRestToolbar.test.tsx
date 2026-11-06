import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HINT_KEY, HINT_MS } from '../lib/marker/hint.ts';
import { REST } from '../lib/marker/restDetector.ts';
import { useRef } from 'preact/hooks';
import { useRestToolbar, useToolbarDismissal } from './useRestToolbar.ts';

let container: HTMLElement | null = null;
let api: ReturnType<typeof useRestToolbar>;

function Probe() {
  api = useRestToolbar();
  return null;
}

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<Probe />, container!));
}

const markNode = (id: string) => {
  const node = document.createElement('div');
  node.setAttribute('data-element-id', id);
  const child = document.createElement('span');
  node.appendChild(child);
  return child;
};
const blank = document.createElement('div');

function move(x: number, y: number, over: Element | null, extra: { pointerType?: string; buttons?: number } = {}) {
  act(() => api.onPointerMove({ clientX: x, clientY: y, target: over ?? blank, pointerType: 'mouse', buttons: 0, ...extra } as unknown as PointerEvent));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useRestToolbar rest detection', () => {
  it('a rest outlines the mark and opens nothing', () => {
    mount();
    move(100, 100, markNode('a'));
    act(() => { vi.advanceTimersByTime(REST.restMs - 1); });
    expect(api.restId).toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    expect(api.restId).toBe('a');
    expect(api.targetId).toBeNull();
  });

  it('a pointer that keeps moving more than 3 px never rests', () => {
    mount();
    const over = markNode('a');
    for (let i = 0; i < 10; i += 1) {
      move(100 + i * 5, 100, over);
      act(() => { vi.advanceTimersByTime(100); });
    }
    expect(api.restId).toBeNull();
  });

  it('leaving the mark clears the rest', () => {
    mount();
    const over = markNode('a');
    move(100, 100, over);
    act(() => { vi.advanceTimersByTime(REST.restMs + 1); });
    expect(api.restId).toBe('a');
    move(100, 100, null);
    expect(api.restId).toBeNull();
  });

  it('small moves inside the mark keep the rest', () => {
    mount();
    const over = markNode('a');
    move(100, 100, over);
    act(() => { vi.advanceTimersByTime(REST.restMs + 1); });
    move(140, 104, over);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.restId).toBe('a');
  });

  it('leaving the page clears the rest', () => {
    mount();
    move(100, 100, markNode('a'));
    act(() => { vi.advanceTimersByTime(REST.restMs + 1); });
    act(() => api.onPointerLeave());
    expect(api.restId).toBeNull();
  });

  it('a finger never rests, and a held button is a stroke, not a rest', () => {
    mount();
    move(100, 100, markNode('a'), { pointerType: 'touch' });
    move(100, 100, markNode('b'), { buttons: 1 });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.restId).toBeNull();
  });

  it('the end of a stroke blocks rest until the pointer is 12 px away', () => {
    mount();
    const over = markNode('a');
    move(100, 100, over);
    act(() => api.strokeEnd());
    move(105, 100, over);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(api.restId).toBeNull();
    move(120, 100, over);
    act(() => { vi.advanceTimersByTime(REST.restMs + 1); });
    expect(api.restId).toBe('a');
  });

  it('openFor opens with its anchor and clears the rest; close clears the anchor', () => {
    mount();
    move(100, 100, markNode('a'));
    act(() => { vi.advanceTimersByTime(REST.restMs + 1); });
    expect(api.restId).toBe('a');
    act(() => api.openFor('a', { x: 40, y: 10 }));
    expect(api.targetId).toBe('a');
    expect(api.anchor).toEqual({ x: 40, y: 10 });
    expect(api.restId).toBeNull();
    act(() => api.close());
    expect(api.targetId).toBeNull();
    expect(api.anchor).toBeNull();
  });

  it('while open, moves do not set restId, and after close it can rest again', () => {
    mount();
    act(() => api.openFor('a'));
    move(300, 300, markNode('b'));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(api.restId).toBeNull();
    act(() => api.close());
    move(300, 300, markNode('b'));
    act(() => { vi.advanceTimersByTime(REST.restMs + 1); });
    expect(api.restId).toBe('b');
  });
});

describe('useRestToolbar hint', () => {
  const ink = { x: 40, bottom: 12, rtl: false };

  it('shows after the first mark, once, for four seconds', () => {
    mount();
    act(() => api.showHint(ink));
    expect(api.hint).toEqual(ink);
    expect(localStorage.getItem(HINT_KEY)).toBe('1');
    act(() => { vi.advanceTimersByTime(HINT_MS - 1); });
    expect(api.hint).not.toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    expect(api.hint).toBeNull();
  });

  it('stays away once it has been seen', () => {
    localStorage.setItem(HINT_KEY, '1');
    mount();
    act(() => api.showHint(ink));
    expect(api.hint).toBeNull();
  });

  it('a new stroke takes it away', () => {
    mount();
    act(() => api.showHint(ink));
    act(() => api.clearHint());
    expect(api.hint).toBeNull();
  });
});

describe('one rest toolbar in the workspace', () => {
  type Rest = ReturnType<typeof useRestToolbar>;
  const rests: Rest[] = [];
  const deleted: string[] = [];
  const commented: string[] = [];

  function Page({ n }: { n: number }) {
    const rest = useRestToolbar();
    rests[n] = rest;
    const live = useRef({
      layers: { custom: false, colors: false } as never, mark: { id: `m${n}` } as never, onChange: () => {}, onDelete: () => { deleted.push(`m${n}`); },
      onComment: () => { commented.push(`m${n}`); }, onClose: rest.close, look: {} as never,
    });
    live.current.onClose = rest.close;
    useToolbarDismissal({ current: null }, live as never);
    return null;
  }

  const key = (k: string) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });

  function mountTwo() {
    rests.length = 0; deleted.length = 0; commented.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<><Page n={0} /><Page n={1} /></>, container!));
  }

  it('opening toolbar B closes toolbar A', () => {
    mountTwo();
    act(() => rests[0].openFor('a'));
    expect(rests[0].targetId).toBe('a');
    act(() => rests[1].openFor('b'));
    expect(rests[1].targetId).toBe('b');
    expect(rests[0].targetId).toBeNull();
  });

  it('Delete with both pages rested acts on one mark only', () => {
    mountTwo();
    act(() => rests[0].openFor('a'));
    act(() => rests[1].openFor('b'));
    key('Delete');
    expect(deleted).toEqual(['m1']);
  });

  it('c with the toolbar open calls the comment handler once', () => {
    mountTwo();
    act(() => rests[0].openFor('a'));
    key('c');
    expect(commented).toEqual(['m0']);
  });
});

describe('Esc returns focus to the mark', () => {
  let rest: ReturnType<typeof useRestToolbar>;

  function Bar() {
    rest = useRestToolbar();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const live = useRef({
      layers: { custom: false, colors: false } as never, mark: { id: 'm' } as never, onChange: () => {}, onDelete: () => {},
      onComment: () => {}, onClose: rest.close, look: {} as never,
    });
    useToolbarDismissal(rootRef, live as never);
    return (
      <div>
        <div data-editor-element-id="m" tabIndex={0} />
        <div ref={rootRef}><button type="button">Colors</button></div>
        <button type="button" id="elsewhere">Elsewhere</button>
      </div>
    );
  }

  const esc = () => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

  function mountBar() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<Bar />, container!));
    act(() => rest.openFor('m'));
  }

  it('Esc from inside the toolbar closes it and focuses the mark', () => {
    mountBar();
    container!.querySelector<HTMLElement>('button')!.focus();
    esc();
    expect(rest.targetId).toBeNull();
    expect(document.activeElement).toBe(container!.querySelector('[data-editor-element-id="m"]'));
  });

  it('Esc with focus on the mark keeps it there', () => {
    mountBar();
    const mark = container!.querySelector<HTMLElement>('[data-editor-element-id="m"]')!;
    mark.focus();
    esc();
    expect(rest.targetId).toBeNull();
    expect(document.activeElement).toBe(mark);
  });

  it('Esc with focus elsewhere does not steal it', () => {
    mountBar();
    const other = container!.querySelector<HTMLElement>('#elsewhere')!;
    other.focus();
    esc();
    expect(document.activeElement).toBe(other);
  });
});
