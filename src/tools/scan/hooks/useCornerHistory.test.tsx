import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { CornerShape } from '../lib/cornerHistory.ts';
import { useCornerHistory } from './useCornerHistory.ts';

const shape = (n: number): CornerShape => ({
  quad: [{ x: n, y: 0 }, { x: n + 1, y: 0 }, { x: n + 1, y: 1 }, { x: n, y: 1 }] as Quad,
  pins: null,
  fine: false,
});

type Api = ReturnType<typeof useCornerHistory>;

describe('useCornerHistory', () => {
  let container: HTMLElement;
  afterEach(() => { render(null, container); container.remove(); });

  function mount(initial: { pageId: number; current: CornerShape }, apply: (s: CornerShape) => void) {
    const out: { api: Api } = { api: undefined as unknown as Api };
    function Probe(p: { pageId: number; current: CornerShape }) {
      out.api = useCornerHistory(p.pageId, p.current, apply);
      return null;
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    const show = (p: { pageId: number; current: CornerShape }) => act(() => render(<Probe {...p} />, container));
    show(initial);
    return { out, show };
  }

  it('commit applies the next shape and enables undo, so a change is reversible', () => {
    const apply = vi.fn();
    const { out } = mount({ pageId: 1, current: shape(1) }, apply);
    expect(out.api.canUndo).toBe(false);
    act(() => out.api.commit(shape(2)));
    expect(apply).toHaveBeenCalledWith(shape(2));
    expect(out.api.canUndo).toBe(true);
  });

  it('undo applies the previous shape without recording a step of its own', () => {
    const apply = vi.fn();
    const { out } = mount({ pageId: 1, current: shape(1) }, apply);
    act(() => out.api.commit(shape(2)));
    apply.mockClear();
    act(() => out.api.undo());
    expect(apply).toHaveBeenCalledWith(shape(1));
    expect(out.api.canUndo).toBe(false);
    expect(out.api.canRedo).toBe(true);
    apply.mockClear();
    act(() => out.api.undo());
    expect(apply).not.toHaveBeenCalled();
  });

  it('redo re-applies the undone shape, and does nothing when there is none', () => {
    const apply = vi.fn();
    const { out, show } = mount({ pageId: 1, current: shape(1) }, apply);
    act(() => out.api.redo());
    expect(apply).not.toHaveBeenCalled();
    act(() => out.api.commit(shape(2)));
    show({ pageId: 1, current: shape(2) });
    act(() => out.api.undo());
    show({ pageId: 1, current: shape(1) });
    apply.mockClear();
    act(() => out.api.redo());
    expect(apply).toHaveBeenCalledWith(shape(2));
    expect(out.api.canRedo).toBe(false);
    expect(out.api.canUndo).toBe(true);
  });

  it('each page id keeps its own history and finds it again after switching away and back', () => {
    const apply = vi.fn();
    const { out, show } = mount({ pageId: 1, current: shape(1) }, apply);
    act(() => out.api.commit(shape(2)));
    show({ pageId: 2, current: shape(10) });
    expect(out.api.canUndo).toBe(false);
    act(() => out.api.commit(shape(11)));
    act(() => out.api.commit(shape(12)));
    show({ pageId: 1, current: shape(2) });
    expect(out.api.canUndo).toBe(true);
    apply.mockClear();
    act(() => out.api.undo());
    expect(apply).toHaveBeenCalledWith(shape(1));
    show({ pageId: 2, current: shape(12) });
    apply.mockClear();
    act(() => out.api.undo());
    expect(apply).toHaveBeenCalledWith(shape(10));
  });

  it('after a re-render with a new current, commit records that new current rather than a stale one', () => {
    const apply = vi.fn();
    const { out, show } = mount({ pageId: 1, current: shape(1) }, apply);
    show({ pageId: 1, current: shape(5) });
    act(() => out.api.commit(shape(6)));
    apply.mockClear();
    act(() => out.api.undo());
    expect(apply).toHaveBeenCalledWith(shape(5));
  });

  it('remember records the current shape without applying, so a change made elsewhere can be undone', () => {
    const apply = vi.fn();
    const { out, show } = mount({ pageId: 1, current: shape(1) }, apply);
    act(() => out.api.remember());
    expect(apply).not.toHaveBeenCalled();
    expect(out.api.canUndo).toBe(true);
    show({ pageId: 1, current: shape(2) });
    act(() => out.api.undo());
    expect(apply).toHaveBeenCalledWith(shape(1));
  });
});
