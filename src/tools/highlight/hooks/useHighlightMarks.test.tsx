import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { captureAddedElement } from '#editor/model/actionHistory.ts';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';
import { useHighlightMarks } from './useHighlightMarks.ts';

type Marks = ReturnType<typeof useHighlightMarks>;
let container: HTMLElement | null = null;
let marks: Marks;

function Probe() {
  marks = useHighlightMarks();
  return null;
}

const mark: HighlightElement = {
  id: 'm1', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 20, height: 2,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};

function addMark() {
  marks.dispatch({ type: 'ADD_ELEMENT', payload: mark });
  marks.logAction('add', 'ADD_SHAPE', 0, 'Added a highlight', [captureAddedElement(mark, 0)]);
}

function mount() {
  container = document.createElement('div');
  act(() => render(<Probe />, container!));
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useHighlightMarks', () => {
  it('starts empty with the default marker and nothing to undo', () => {
    mount();
    expect(marks.state.elements).toEqual([]);
    expect(marks.marker).toEqual(DEFAULT_MARKER);
    expect(marks.canUndo).toBe(false);
    expect(marks.canRedo).toBe(false);
  });

  it('re-arms the marker from a change', () => {
    mount();
    act(() => marks.rearm({ color: '#FF8080', style: 'underline' }));
    expect(marks.marker).toEqual({ color: '#FF8080', style: 'underline', opacity: 1 });
  });

  it('logs an added mark, then undoes and redoes it', () => {
    mount();
    act(() => addMark());
    expect(marks.state.elements).toHaveLength(1);
    expect(marks.canUndo).toBe(true);
    act(() => marks.undo());
    expect(marks.state.elements).toHaveLength(0);
    expect(marks.canRedo).toBe(true);
    act(() => marks.redo());
    expect(marks.state.elements).toHaveLength(1);
    expect(marks.canRedo).toBe(false);
  });

  it('ignores undo and redo when there is nothing to step', () => {
    mount();
    const revision = marks.state.documentRevision;
    act(() => { marks.undo(); marks.redo(); });
    expect(marks.state.documentRevision).toBe(revision);
  });
});
