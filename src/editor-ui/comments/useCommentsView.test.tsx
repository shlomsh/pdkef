import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { useCommentsView } from './useCommentsView.tsx';

let container: HTMLElement | null = null;
let view: ReturnType<typeof useCommentsView>;
const observed: Array<() => void> = [];

class FakeResizeObserver {
  constructor(private callback: () => void) {}
  observe() { observed.push(this.callback); this.callback(); }
  disconnect() {}
}

function Probe({ showContainer, width }: { showContainer: boolean; width: number }) {
  view = useCommentsView({
    elements: [], activeElementId: null, messages: englishSignMessages,
    onSelect: () => {}, onSave: () => {}, onDelete: () => {}, onDiscard: () => {},
  });
  return showContainer ? (
    <div ref={(node) => { if (node) node.getBoundingClientRect = () => ({ width } as DOMRect); view.containerRef(node); }} />
  ) : null;
}

beforeEach(() => { vi.stubGlobal('ResizeObserver', FakeResizeObserver); });
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  observed.length = 0;
  vi.unstubAllGlobals();
});

function mount(props: { showContainer: boolean; width: number }) {
  container ??= document.createElement('div');
  act(() => render(<Probe {...props} />, container!));
}

describe('useCommentsView', () => {
  it('uses the rail on a wide container', () => {
    mount({ showContainer: true, width: 1200 });
    expect(view.sheet).toBeNull();
  });

  it('uses the sheet on a narrow container', () => {
    mount({ showContainer: true, width: 600 });
    expect(view.sheet).not.toBeNull();
  });

  it('measures a container that mounts after the view, as Highlight\'s workspace does once a file opens', () => {
    mount({ showContainer: false, width: 1200 });
    expect(view.sheet).not.toBeNull();
    mount({ showContainer: true, width: 1200 });
    expect(view.sheet).toBeNull();
  });
});
