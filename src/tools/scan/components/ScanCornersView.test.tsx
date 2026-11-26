import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FULL_QUAD, turnedPoint, unturnedPoint } from '../lib/quad.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins, Sides } from '../lib/edges/follow.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import ScanCornersView from './ScanCornersView.tsx';
import CornerEditor from './CornerEditor.tsx';
import { useCornerZoom } from '../hooks/useCornerZoom.ts';

// Both modules run for real; the spies only let a test read the props the view gives the editor and the hook, and call the editor's callbacks.
vi.mock('./CornerEditor.tsx', { spy: true });
vi.mock('../hooks/useCornerZoom.ts', { spy: true });
const editorProps = { get last(): Record<string, any> | null { return (vi.mocked(CornerEditor).mock.lastCall?.[0] as Record<string, any> | undefined) ?? null; } };
const zoomCalls = () => vi.mocked(useCornerZoom).mock.calls.map(([area, key]) => ({ area, key }));

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('ScanCornersView', () => {
  it('has one primary, Use these corners, and no Done', () => {
    const onApprove = vi.fn();
    const selected = { id: 1, guessed: true, preview: 'p', quad: FULL_QUAD, turns: 0, aspect: 1 } as unknown as ScanPage;
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(
      <ScanCornersView selected={selected} photo={null} shownAspect={1} hint="Drag it." finding={null} unreadable={false} sides={null} onCommit={vi.fn()} onFind={vi.fn()} onRotate={vi.fn()} onApprove={onApprove} onRemove={vi.fn()} />,
      container!,
    ));
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toContain(t.useCorners);
    expect(labels).not.toContain(t.pageDone);
    act(() => ([...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === t.useCorners) as HTMLButtonElement).click());
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  const mountView = (selected: ScanPage, unreadable: boolean) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(
      <ScanCornersView selected={selected} photo={null} shownAspect={1} hint="Drag it." finding={null} unreadable={unreadable} sides={null} onCommit={vi.fn()} onFind={vi.fn()} onRotate={vi.fn()} onApprove={vi.fn()} onRemove={vi.fn()} />,
      container!,
    ));
    return [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());
  };
  const noPreview = { id: 1, guessed: true, preview: null, quad: FULL_QUAD, turns: 0, aspect: 1 } as unknown as ScanPage;

  it('a page waiting for its preview shows the actions bar, not Remove only', () => {
    const labels = mountView(noPreview, false);
    expect(labels).toContain(t.findPage);
    expect(labels).toContain(t.useCorners);
    expect(labels).not.toContain(t.removePhoto);
  });

  it('a failed page shows Remove only', () => {
    expect(mountView(noPreview, true)).toEqual([t.removePhoto]);
  });

  describe('hint, Rotate and the Fit page chip', () => {
    const mountWith = (selected: ScanPage, onRotate = vi.fn()) => {
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => render(
        <ScanCornersView selected={selected} photo={null} shownAspect={1} hint="Drag it." finding={null} unreadable={false} sides={null} onCommit={vi.fn()} onFind={vi.fn()} onRotate={onRotate} onApprove={vi.fn()} onRemove={vi.fn()} />,
        container!,
      ));
      return onRotate;
    };
    const rotateButton = () => [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === t.rotate) as HTMLButtonElement;
    const ready = { id: 1, guessed: true, preview: 'p', quad: FULL_QUAD, turns: 0, aspect: 1 } as unknown as ScanPage;

    // Protects: the hint the parent computed is what the strip over the photo says, as a status.
    it('shows the hint prop as a status', () => {
      mountWith(ready);
      expect(container!.querySelector('[role="status"]')?.textContent).toBe('Drag it.');
    });

    // Protects: Rotate lives in the corners bar and turns the page.
    it('Rotate calls onRotate', () => {
      const onRotate = mountWith(ready);
      act(() => rotateButton().click());
      expect(onRotate).toHaveBeenCalledTimes(1);
    });

    // Protects: a page with no preview has nothing to turn yet.
    it('Rotate is disabled while the page has no preview', () => {
      mountWith(noPreview);
      expect(rotateButton().disabled).toBe(true);
    });

    // Protects: the Fit page chip appears only when zoomed in.
    it('has no Fit page chip at fit', () => {
      mountWith(ready);
      expect(container!.querySelector('[data-fit-page]')).toBeNull();
    });
  });

  describe('zoom', () => {
    const page = (id: number, turns = 0) => ({ id, guessed: true, preview: 'p', quad: FULL_QUAD, turns, aspect: 1, pins: null }) as unknown as ScanPage;
    const view = (selected: ScanPage, unreadable = false) => (
      <ScanCornersView selected={selected} photo={null} shownAspect={1} hint="Drag it." finding={null} unreadable={unreadable} sides={null} onCommit={vi.fn()} onFind={vi.fn()} onRotate={vi.fn()} onApprove={vi.fn()} onRemove={vi.fn()} />
    );
    const mount = (selected: ScanPage, unreadable = false) => {
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => render(view(selected, unreadable), container!));
    };
    const names = () => [...container!.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    const button = (name: string) => [...container!.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name) as HTMLButtonElement;

    // Protects: zoom is wheel, pinch and keys only; the tools row has undo, redo and Fine-tune edges, no zoom buttons.
    it('renders no zoom buttons, only undo, redo and the Fine-tune toggle in the tools row', () => {
      mount(page(1));
      expect(names().filter(Boolean)).toEqual([t.undo, t.redo]);
      expect(container!.textContent).not.toMatch(/Zoom|Fit the page/);
      expect(button(t.fineTune)).not.toBeNull();
    });

    it('hands the hook the photo area and a key that changes with the page and its turns', () => {
      mount(page(1));
      const first = zoomCalls()[0];
      expect(first.area.current).toBe(container!.querySelector('[data-photo-area]'));
      expect(first.area.current).not.toBeNull();
      vi.mocked(useCornerZoom).mockClear();
      act(() => render(view(page(2)), container!));
      act(() => render(view(page(2, 1)), container!));
      const keys = zoomCalls().map((c) => c.key);
      expect(keys.at(-1)).not.toBe(keys[0]);
      expect(new Set(['1|0', '2|0', '2|1']).size).toBe(3);
      expect(zoomCalls().some((c) => c.key === '2|0')).toBe(true);
      expect(zoomCalls().some((c) => c.key === '2|1')).toBe(true);
    });

    it('shows none of them on an unreadable photo', () => {
      mount(page(1), true);
      expect(names().filter(Boolean)).toEqual([]);
    });
  });

  describe('trace', () => {
    const Q1: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    const side = Array.from({ length: 15 }, (_, i) => ({ x: 0.3 + i * 0.01, y: 0.5 }));
    const SIDES = [side, side, side, side] as Sides;
    const page = (quad: Quad, turns = 0, pins: Pins | null = null, fine = true) => ({ id: 1, guessed: true, preview: 'p', quad, turns, aspect: 1, pins, fine }) as unknown as ScanPage;
    const mount = (selected: ScanPage, sides: Sides | null) => {
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => render(
        <ScanCornersView selected={selected} photo="x.jpg" shownAspect={1} hint="Drag it." finding={null} unreadable={false} sides={sides} onCommit={vi.fn()} onFind={vi.fn()} onRotate={vi.fn()} onApprove={vi.fn()} onRemove={vi.fn()} />,
        container!,
      ));
    };
    const traceLines = () => container!.querySelectorAll('g[data-trace] line');
    const traceD = () => (traceLines().length ? Array.from(traceLines()).map((l) => `${l.getAttribute('x1')} ${l.getAttribute('y1')}`) : null);

    // Protects: with Fine-tune edges off the border is neither requested nor drawn, so the editor shows plain straight lines.
    it('with fine off asks for no trace and shows none, and the toggle is not pressed', () => {
      mount(page(Q1, 0, null, false), null);
      expect(traceD()).toBeNull();
      expect(editorProps.last!.trace).toBeNull();
      expect(editorProps.last!.pinned).toEqual([]);
      expect(container!.querySelector<HTMLButtonElement>(`button[aria-pressed]`)!.getAttribute('aria-pressed')).toBe('false');
    });

    // Protects: with Fine-tune edges on the trace is requested for the page's quad and pins.
    it('with fine on asks for the trace and the toggle is pressed', () => {
      mount(page(Q1), SIDES);
      expect(container!.querySelector('button[aria-pressed="true"]')).not.toBeNull();
    });

    it('asks for the trace of the page\'s own quad on mount and draws 64 points', () => {
      mount(page(Q1), SIDES);
      expect(traceD()!.length).toBe(64);
    });

    it('draws the first point turned with the page', () => {
      mount(page(Q1, 1), SIDES);
      const p = turnedPoint(Q1[0], 1);
      expect(traceD()![0]).toBe(`${p.x * 100}% ${p.y * 100}%`);
    });

    it('passes no trace when the answer is null', () => {
      mount(page(Q1), null);
      expect(traceD()).toBeNull();
    });
  });

  describe('pins and history', () => {
    const Q: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    const pin = (k: number, x = 0.5, y = 0.5) => ({ k, at: { x, y } });
    const mk = (over: Partial<ScanPage> = {}) => ({ id: 1, guessed: true, preview: 'p', quad: Q, turns: 0, aspect: 1, pins: null, fine: true, ...over }) as unknown as ScanPage;
    const mount = (selected: ScanPage, onCommit = vi.fn(), onFind = vi.fn()) => {
      container = document.createElement('div');
      document.body.appendChild(container);
      const view = (sel: ScanPage) => (
        <ScanCornersView selected={sel} photo="x.jpg" shownAspect={1} hint="Drag it." finding={null} unreadable={false} sides={null} onCommit={onCommit} onFind={onFind} onRotate={vi.fn()} onApprove={vi.fn()} onRemove={vi.fn()} />
      );
      act(() => render(view(selected), container!));
      return { onCommit, onFind, show: (sel: ScanPage) => act(() => render(view(sel), container!)) };
    };
    const button = (name: string) => [...container!.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name) as HTMLButtonElement;
    const key = (init: KeyboardEventInit) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', init)); });
    const MOVED: Quad = [{ x: 0.2, y: 0.1 }, Q[1], Q[2], Q[3]];

    it('a moved corner drops the pins on its two sides and keeps the others, so a stale pin never fights the new corner', () => {
      const pins: Pins = [[pin(1)], [pin(2)], [pin(3)], [pin(4)]];
      const { onCommit } = mount(mk({ pins }));
      editorProps.last!.onCommit(MOVED);
      // Corner 0 touches sides 0 (top) and 3 (left).
      expect(onCommit).toHaveBeenCalledWith(1, MOVED, [[], pins[1], pins[2], []], true);
    });

    it('a corner move that leaves no pins stores null, so an empty pin set is never kept', () => {
      const { onCommit } = mount(mk({ pins: [[pin(1)], [], [], [pin(2)]] }));
      editorProps.last!.onCommit(MOVED);
      expect(onCommit).toHaveBeenCalledWith(1, MOVED, null, true);
    });

    it('a pin on a turned page lands on its photo-frame side and point, unturned, with the quad unchanged', () => {
      const { onCommit } = mount(mk({ turns: 1 }));
      const at = { x: 0.3, y: 0.6 };
      editorProps.last!.onPin(23, at);
      expect(onCommit).toHaveBeenCalledWith(1, Q, [[], [{ k: 6, at: unturnedPoint(at, 1) }], [], []], true);
    });

    it('a pin at an already pinned point replaces it, so one point has one pin', () => {
      const { onCommit } = mount(mk({ pins: [[pin(2), pin(5)], [], [], []] }));
      editorProps.last!.onPin(3, { x: 0.7, y: 0.2 });
      expect(onCommit).toHaveBeenCalledWith(1, Q, [[{ k: 2, at: { x: 0.7, y: 0.2 } }, pin(5)], [], [], []], true);
    });

    it('a new pin keeps its side sorted by point, so the pins stay in edge order', () => {
      const { onCommit } = mount(mk({ pins: [[pin(5)], [], [], []] }));
      editorProps.last!.onPin(2, { x: 0.4, y: 0.4 });
      expect(onCommit.mock.calls[0][2][0].map((p: { k: number }) => p.k)).toEqual([1, 5]);
    });

    it('removing a pin keeps the rest, and removing the last stores null', () => {
      const { onCommit, show } = mount(mk({ pins: [[pin(1), pin(2)], [], [], []] }));
      editorProps.last!.onUnpin(3);
      expect(onCommit).toHaveBeenLastCalledWith(1, Q, [[pin(1)], [], [], []], true);
      show(mk({ pins: [[pin(1)], [], [], []] }));
      editorProps.last!.onUnpin(2);
      expect(onCommit).toHaveBeenLastCalledWith(1, Q, null, true);
    });

    it('the editor is told the outline index of every pin, side * 16 + k + 1, so the right points show as pinned', () => {
      mount(mk({ pins: [[pin(0)], [], [pin(14)], [pin(3)]] }));
      expect(editorProps.last!.pinned).toEqual([1, 2 * 16 + 15, 3 * 16 + 4]);
      expect(editorProps.last!.labels.pin).toBe(t.pinLabel);
    });

    it('Undo after a corner move restores the earlier corners and pins and Redo the later, so both directions are one tap', () => {
      const pins: Pins = [[pin(1)], [pin(2)], [], []];
      const before = mk({ pins });
      const { onCommit, show } = mount(before);
      editorProps.last!.onCommit(MOVED);
      onCommit.mockClear();
      show(mk({ quad: MOVED, pins: [[], [pin(2)], [], []] }));
      act(() => button(t.undo).click());
      expect(onCommit).toHaveBeenLastCalledWith(1, Q, pins, true);
      show(before);
      act(() => button(t.redo).click());
      expect(onCommit).toHaveBeenLastCalledWith(1, MOVED, [[], [pin(2)], [], []], true);
    });

    it('Undo is disabled with no history and Redo until something is undone, so a dead tap is never offered', () => {
      const { show } = mount(mk());
      expect(button(t.undo).disabled).toBe(true);
      expect(button(t.redo).disabled).toBe(true);
      editorProps.last!.onCommit(MOVED);
      show(mk({ quad: MOVED }));
      expect(button(t.undo).disabled).toBe(false);
      expect(button(t.redo).disabled).toBe(true);
    });

    it('Redo is disabled again after a new change, because the undone future is dropped', () => {
      const { show } = mount(mk());
      editorProps.last!.onCommit(MOVED);
      show(mk({ quad: MOVED }));
      act(() => button(t.undo).click());
      show(mk());
      expect(button(t.redo).disabled).toBe(false);
      act(() => editorProps.last!.onPin(3, { x: 0.5, y: 0.5 }));
      expect(button(t.redo).disabled).toBe(true);
    });

    it('Auto-detect then Undo restores the corners from before the find, so a bad find is reversible', () => {
      const { onCommit, onFind, show } = mount(mk());
      act(() => button(t.findPage).click());
      expect(onFind).toHaveBeenCalledTimes(1);
      show(mk({ quad: MOVED }));
      act(() => button(t.undo).click());
      expect(onCommit).toHaveBeenLastCalledWith(1, Q, null, true);
    });

    it('Whole photo goes through history and clears the pins, so it can be undone', () => {
      const pins: Pins = [[pin(1)], [], [], []];
      const { onCommit, show } = mount(mk({ pins }));
      act(() => button(t.wholePhoto).click());
      expect(onCommit).toHaveBeenLastCalledWith(1, FULL_QUAD, null, false);
      show(mk({ quad: FULL_QUAD }));
      act(() => button(t.undo).click());
      expect(onCommit).toHaveBeenLastCalledWith(1, Q, pins, true);
    });

    // Protects: the switch is one history step with the quad and pins unchanged.
    it('tapping Fine-tune edges commits fine on with the same quad and pins', () => {
      const pins: Pins = [[pin(1)], [], [], []];
      const { onCommit } = mount(mk({ pins, fine: false }));
      act(() => button(t.fineTune).click());
      expect(onCommit).toHaveBeenLastCalledWith(1, Q, pins, true);
    });

    // Protects: undo steps over the switch, so a person can take Fine-tune edges back.
    it('Undo after turning Fine-tune edges on commits fine off again', () => {
      const { onCommit, show } = mount(mk({ fine: false }));
      act(() => button(t.fineTune).click());
      show(mk({ fine: true }));
      act(() => button(t.undo).click());
      expect(onCommit).toHaveBeenLastCalledWith(1, Q, null, false);
    });

    // Protects: a whole-photo frame has no border to tune, so the switch is unavailable there.
    it('the toggle is disabled while the corners are the whole photo', () => {
      mount(mk({ quad: FULL_QUAD, fine: false }));
      expect(button(t.fineTune).disabled).toBe(true);
    });

    it('Cmd+Z and Shift+Cmd+Z do what Undo and Redo do, so the keyboard matches the buttons', () => {
      const { onCommit, show } = mount(mk());
      editorProps.last!.onCommit(MOVED);
      show(mk({ quad: MOVED }));
      key({ key: 'z', metaKey: true });
      expect(onCommit).toHaveBeenLastCalledWith(1, Q, null, true);
      show(mk());
      key({ key: 'z', metaKey: true, shiftKey: true });
      expect(onCommit).toHaveBeenLastCalledWith(1, MOVED, null, true);
    });
  });
});
