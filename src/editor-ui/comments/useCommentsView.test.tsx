import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { useCommentsView } from './useCommentsView.tsx';

let container: HTMLElement | null = null;
let view: ReturnType<typeof useCommentsView>;
const observed: Array<() => void> = [];

class FakeResizeObserver {
  constructor(private callback: () => void) {}
  observe() { observed.push(this.callback); this.callback(); }
  disconnect() {}
}

const mark: EditorElement = { id: 'm', type: 'highlight', pageIndex: 0, left: 1, top: 1, width: 10, height: 2, color: '#ff0', bands: [] };
const note = (comment: string): EditorElement => ({
  id: 'c', type: 'comment', pageIndex: 0, left: 1, top: 1, width: 10, height: 2, comment, anchor: { kind: 'element', elementId: 'm' },
});

function Probe({ showContainer, width, elements = [], activeElementId = null, withMark = false }: {
  showContainer: boolean; width: number; elements?: EditorElement[]; activeElementId?: string | null; withMark?: boolean;
}) {
  view = useCommentsView({
    elements, activeElementId, messages: englishSignMessages,
    onSelect: () => {}, onSave: () => {}, onDelete: () => {}, onDiscard: () => {},
  });
  return showContainer ? (
    <div ref={(node) => { if (node) node.getBoundingClientRect = () => ({ width } as DOMRect); view.containerRef(node); }}>
      {withMark && <div data-editor-element-id="m" tabIndex={-1} />}
    </div>
  ) : null;
}

beforeEach(() => { vi.stubGlobal('ResizeObserver', FakeResizeObserver); });
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  observed.length = 0;
  vi.unstubAllGlobals();
});

function mount(props: { showContainer: boolean; width: number; elements?: EditorElement[]; activeElementId?: string | null; withMark?: boolean }) {
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

  describe('focus', () => {
    const open = { showContainer: true, width: 1200, elements: [mark, note('hi')], activeElementId: 'c', withMark: true };
    const markNode = () => container!.querySelector<HTMLElement>('[data-editor-element-id="m"]')!;

    it('returnFocus puts focus on the comment\'s mark', () => {
      document.body.appendChild(container = document.createElement('div'));
      mount(open);
      act(() => view.returnFocus('c'));
      expect(document.activeElement).toBe(markNode());
    });

    it('falls back to the workspace when the mark cannot take focus or is gone', () => {
      document.body.appendChild(container = document.createElement('div'));
      mount({ ...open, withMark: false });
      act(() => view.returnFocus('c'));
      const workspace = container.firstElementChild as HTMLElement;
      expect(document.activeElement).toBe(workspace);
    });

    it('closing the note (Esc, a press elsewhere, delete) leaves focus on the mark, not the body', () => {
      document.body.appendChild(container = document.createElement('div'));
      mount(open);
      (document.activeElement as HTMLElement | null)?.blur();
      mount({ ...open, activeElementId: null });
      expect(document.activeElement).toBe(markNode());
    });

    it('closing does not take focus from a control the person moved to', () => {
      document.body.appendChild(container = document.createElement('div'));
      mount(open);
      const other = document.createElement('button');
      document.body.appendChild(other);
      other.focus();
      mount({ ...open, activeElementId: null });
      expect(document.activeElement).toBe(other);
      other.remove();
    });

    it('a deleted mark sends focus to the workspace', () => {
      document.body.appendChild(container = document.createElement('div'));
      mount(open);
      mount({ ...open, elements: [], activeElementId: null, withMark: false });
      expect(document.activeElement).toBe(container.firstElementChild);
    });
  });
});
