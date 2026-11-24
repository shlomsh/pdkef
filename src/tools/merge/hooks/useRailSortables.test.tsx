import { createRef, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sortable from 'sortablejs';
import { useRailSortables } from './useRailSortables.ts';
import { TOUCH_HOLD_DELAY_MS, TOUCH_START_THRESHOLD_PX } from '../lib/sortableOptions.ts';

interface ProbeProps {
  hasFiles: boolean;
  canReorderFiles: boolean;
  onReorder: (oldIndex: number, newIndex: number) => void;
}

describe('useRailSortables', () => {
  let container: HTMLElement;
  const listRef = createRef<HTMLUListElement>();
  const chipListRef = createRef<HTMLUListElement>();

  function Probe({ hasFiles, canReorderFiles, onReorder }: ProbeProps) {
    useRailSortables({ listRef, chipListRef, hasFiles, canReorderFiles, onReorder });
    return hasFiles ? (
      <>
        <ul ref={listRef} data-rail><li>a</li><li>b</li></ul>
        <ul ref={chipListRef} data-chips><li data-chip>a</li><li data-chip>b</li></ul>
      </>
    ) : null;
  }
  const noReorder = () => {};
  const mount = (props: Partial<ProbeProps> = {}) => act(() => render(
    <Probe hasFiles canReorderFiles onReorder={noReorder} {...props} />,
    container,
  ));
  const rail = () => container.querySelector('[data-rail]') as HTMLUListElement;
  const chips = () => container.querySelector('[data-chips]') as HTMLUListElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.restoreAllMocks();
  });

  it('creates nothing until there are files, then one Sortable on the rail and one on the chip row', () => {
    const create = vi.spyOn(Sortable, 'create');
    mount({ hasFiles: false });
    expect(create).not.toHaveBeenCalled();
    mount();
    expect(create.mock.calls.filter(([element]) => element === rail())).toHaveLength(1);
    expect(create.mock.calls.filter(([element]) => element === chips())).toHaveLength(1);
    expect(create).toHaveBeenCalledWith(chips(), expect.objectContaining({
      draggable: '[data-chip]',
      delay: TOUCH_HOLD_DELAY_MS,
      delayOnTouchOnly: true,
      touchStartThreshold: TOUCH_START_THRESHOLD_PX,
    }));
  });

  it('makes a live Sortable again after the files are cleared and added back, never destroying one twice', () => {
    const destroy = vi.spyOn(Sortable.prototype, 'destroy');
    mount();
    expect(() => mount({ hasFiles: false })).not.toThrow();
    expect(() => mount()).not.toThrow();
    expect(Sortable.get(rail())).toBeDefined();
    expect(Sortable.get(chips())).toBeDefined();
    expect(new Set(destroy.mock.contexts).size).toBe(destroy.mock.contexts.length);
  });

  it('keeps whole-file drag enabled only while files can be reordered', () => {
    mount({ canReorderFiles: false });
    expect(Sortable.get(rail())?.option('disabled')).toBe(true);
    expect(Sortable.get(chips())?.option('disabled')).toBe(true);
    mount({ canReorderFiles: true });
    expect(Sortable.get(rail())?.option('disabled')).toBe(false);
    expect(Sortable.get(chips())?.option('disabled')).toBe(false);
  });

  it('reports a drop on either list once, with the indexes it read', () => {
    const create = vi.spyOn(Sortable, 'create');
    const drops: [number, number][] = [];
    mount({ onReorder: (from, to) => drops.push([from, to]) });
    const optionsOf = (element: Element) => create.mock.calls.find(([target]) => target === element)![1]!;
    optionsOf(rail()).onEnd!({ oldIndex: 0, newIndex: 1 } as Sortable.SortableEvent);
    optionsOf(chips()).onEnd!({ oldIndex: 1, newIndex: 0 } as Sortable.SortableEvent);
    optionsOf(rail()).onEnd!({ oldIndex: undefined, newIndex: 1 } as Sortable.SortableEvent);
    expect(drops).toEqual([[0, 1], [1, 0]]);
  });
});
