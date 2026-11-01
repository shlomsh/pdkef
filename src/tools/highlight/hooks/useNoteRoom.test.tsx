import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import { useHighlightMarks } from './useHighlightMarks.ts';
import { useNoteRoom } from './useNoteRoom.ts';

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const blank: CommentElement = {
  id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  comment: '', anchor: { kind: 'element', elementId: 'h1' },
};
const saved: CommentElement = { ...blank, comment: 'Check this' };

let host: HTMLElement;
let column: HTMLElement;
let marks: ReturnType<typeof useHighlightMarks>;
let room: ReturnType<typeof useNoteRoom>;
let wide = true;
const order: string[] = [];
const makeRoom = vi.fn((noted: boolean) => { order.push(`room:${noted}`); });

function Probe() {
  marks = useHighlightMarks();
  room = useNoteRoom({
    state: marks.state, dispatch: (action) => { order.push(`dispatch:${action.type}`); marks.dispatch(action); },
    columnRef: { current: column }, zoom: () => ({ zoom: 2, makeRoom }), isWide: () => wide,
  });
  return null;
}

function rectOf(left: number, top: number) {
  return () => ({ left, top, right: left, bottom: top, width: 0, height: 0, x: left, y: top, toJSON() {} }) as DOMRect;
}

beforeEach(() => {
  wide = true;
  order.length = 0;
  makeRoom.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  column = document.createElement('div');
  column.getBoundingClientRect = rectOf(100, 50);
  const node = document.createElement('div');
  node.setAttribute('data-editor-element-id', 'h1');
  node.getBoundingClientRect = rectOf(300, 450);
  column.appendChild(node);
  document.body.appendChild(column);
  act(() => render(<Probe />, host));
  act(() => marks.dispatch({ type: 'LOAD_DOCUMENT', payload: { elements: [mark], actionHistory: [] } }));
  order.length = 0;
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
  column.remove();
});

describe('useNoteRoom', () => {
  it('the first card makes room in the same event as its dispatch, with the point of the mark on screen', () => {
    act(() => {
      room.dispatch({ type: 'ADD_ELEMENT', payload: blank });
      room.dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'c1' });
    });
    expect(makeRoom).toHaveBeenCalledTimes(1);
    expect(makeRoom).toHaveBeenCalledWith(true, { x: 300, y: 450 });
    expect(order).toEqual(['dispatch:ADD_ELEMENT', 'room:true', 'dispatch:SET_ACTIVE_ELEMENT_ID']);
    expect(marks.state.activeElementId).toBe('c1');
  });

  it('the last card going gives the room back, also when the highlight takes its note with it', () => {
    act(() => marks.dispatch({ type: 'LOAD_DOCUMENT', payload: { elements: [mark, saved], actionHistory: [] } }));
    makeRoom.mockClear();
    act(() => room.dispatch({ type: 'DELETE_ELEMENT', payload: 'h1' }));
    expect(makeRoom).toHaveBeenCalledWith(false, { x: 300, y: 450 });
    expect(marks.state.elements).toEqual([]);
  });

  it('closing the open blank card gives the room back', () => {
    act(() => {
      room.dispatch({ type: 'ADD_ELEMENT', payload: blank });
      room.dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'c1' });
    });
    makeRoom.mockClear();
    act(() => room.dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null }));
    expect(makeRoom).toHaveBeenCalledWith(false, { x: 300, y: 450 });
  });

  it('makes no room on a narrow screen, where the sheet opens instead', () => {
    wide = false;
    act(() => {
      room.dispatch({ type: 'ADD_ELEMENT', payload: blank });
      room.dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'c1' });
    });
    expect(makeRoom).not.toHaveBeenCalled();
    expect(marks.state.activeElementId).toBe('c1');
  });

  it('passes every other action straight through', () => {
    act(() => room.dispatch({ type: 'UPDATE_ELEMENT', payload: { id: 'h1', changes: { color: '#FF8080' } } }));
    expect(makeRoom).not.toHaveBeenCalled();
    expect(marks.state.elements[0]).toMatchObject({ color: '#FF8080' });
  });
});
