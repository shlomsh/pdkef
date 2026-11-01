import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import { captureAddedElement, captureElementSnapshots } from '#editor/model/actionHistory.ts';
import { deletedWith } from '#editor/model/elementsReducer.ts';
import { createPageGeometry } from '#editor/geometry/coords.ts';
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

  it('R27: deleting a highlight takes its comment in the same undo step, and one undo brings both back', () => {
    const comment: CommentElement = {
      id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 10, width: 20, height: 2,
      comment: 'Check this', anchor: { kind: 'element', elementId: 'm1' },
    };
    mount();
    act(() => { addMark(); marks.dispatch({ type: 'ADD_ELEMENT', payload: comment }); });
    const stepsBefore = marks.state.actionHistory.length;
    act(() => {
      const snapshots = captureElementSnapshots(marks.state.elements, deletedWith('m1'));
      marks.dispatch({ type: 'DELETE_ELEMENT', payload: 'm1' });
      marks.logAction('delete', 'DELETE_ELEMENT', 0, 'Deleted a highlight', snapshots);
    });
    expect(marks.state.elements).toEqual([]);
    expect(marks.state.actionHistory).toHaveLength(stepsBefore + 1);
    act(() => marks.undo());
    expect(marks.state.elements.map((el) => el.id).sort()).toEqual(['c1', 'm1']);
  });

  describe('page turns and clearing', () => {
    const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });
    const onPage1: HighlightElement = { ...mark, id: 'm2', pageIndex: 1 };
    const comment = (id: string, elementId: string, pageIndex: number): CommentElement => ({
      id, type: 'comment', pageIndex, left: 10, top: 10, width: 20, height: 2,
      comment: 'Note', anchor: { kind: 'element', elementId },
    });

    it('rotatePage turns a page a quarter at a time', () => {
      mount();
      expect(marks.pageTurns).toEqual({});
      act(() => marks.rotatePage(0, geometry));
      expect(marks.pageTurns[0]).toBe(1);
      act(() => marks.rotatePage(0, geometry));
      expect(marks.pageTurns[0]).toBe(2);
    });

    it('one undo reverses one rotate, with the mark geometry it changed', () => {
      mount();
      act(() => addMark());
      const before = marks.state.elements[0];
      act(() => marks.rotatePage(0, geometry));
      expect(marks.state.elements[0]).not.toEqual(before);
      act(() => marks.undo());
      expect(marks.pageTurns[0] ?? 0).toBe(0);
      expect(marks.state.elements[0]).toEqual(before);
      act(() => marks.redo());
      expect(marks.pageTurns[0]).toBe(1);
    });

    it('clearPage removes only that page marks and their comments, and undo brings them back', () => {
      mount();
      act(() => {
        addMark();
        marks.dispatch({ type: 'ADD_ELEMENT', payload: onPage1 });
        marks.dispatch({ type: 'ADD_ELEMENT', payload: comment('c1', 'm2', 1) });
      });
      act(() => marks.clearPage(1));
      expect(marks.state.elements.map((el) => el.id)).toEqual(['m1']);
      act(() => marks.undo());
      expect(marks.state.elements.map((el) => el.id).sort()).toEqual(['c1', 'm1', 'm2']);
    });
  });
});
