import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { reportEdit } from '#lib/telemetry/productAnalytics.ts';
import { createActionEntry } from '#editor/model/actionHistory.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { SignToolProvider, useSignTool } from './SignToolContext.tsx';

vi.mock('#lib/telemetry/productAnalytics.ts', () => ({ reportEdit: vi.fn() }));

const text: EditorElement = { id: 't1', type: 'text', pageIndex: 0, left: 0, top: 0, text: 'hi' } as EditorElement;

describe('SignToolProvider and DEBT-58 reportEdit', () => {
  beforeEach(() => vi.mocked(reportEdit).mockClear());

  it('a load or restore is not an edit; a logged, committed change is', () => {
    let dispatch!: ReturnType<typeof useSignTool>['dispatch'];
    function Probe() {
      dispatch = useSignTool().dispatch;
      return null;
    }
    const container = document.createElement('div');
    act(() => render(<SignToolProvider><Probe /></SignToolProvider>, container));

    const entry = createActionEntry({ operation: 'add', type: 'ADD_TEXT', pageIndex: 0, description: 'Added', elements: [{ element: text, index: 0 }] });
    act(() => dispatch({ type: 'LOAD_DOCUMENT', payload: { elements: [text], actionHistory: [entry] } }));
    act(() => dispatch({ type: 'SET_ELEMENTS', payload: [text] }));
    expect(reportEdit).not.toHaveBeenCalled();

    // A gesture's ADD_ELEMENT at pointer-down is not yet a commit; the history entry on release is.
    act(() => dispatch({ type: 'ADD_ELEMENT', payload: { ...text, id: 't2' } }));
    expect(reportEdit).not.toHaveBeenCalled();
    act(() => dispatch({ type: 'ADD_ACTION_HISTORY', payload: entry }));
    expect(reportEdit).toHaveBeenCalledWith('sign');
  });
});
