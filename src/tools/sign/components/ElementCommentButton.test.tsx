import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { englishSignMessages } from '../messages';
import { SignToolContext, type SignToolContextValue } from './SignToolContext.tsx';
import ElementCommentButton from './ElementCommentButton.tsx';

const target = { id: 'r1', type: 'rectangle', pageIndex: 1, left: 5, top: 6, width: 7, height: 8 } as EditorElement;
const existing = { id: 'c9', type: 'comment', pageIndex: 1, left: 5, top: 6, width: 7, height: 8, comment: 'hi', anchor: { kind: 'element', elementId: 'r1' } } as EditorElement;

let host: HTMLDivElement;
function mount(elements: EditorElement[], dispatch = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const value = { state: { elements }, dispatch } as unknown as SignToolContextValue;
  act(() => render(
    <SignToolContext.Provider value={value}>
      <ElementCommentButton element={target} className="b" t={englishSignMessages} />
    </SignToolContext.Provider>, host));
  return dispatch;
}
afterEach(() => { act(() => render(null, host)); host.remove(); });
const click = () => act(() => host.querySelector<HTMLButtonElement>('button[title="Comment"]')!.click());

describe('ElementCommentButton', () => {
  it('adds a blank anchored comment without a history entry, then opens it', () => {
    const dispatch = mount([target]);
    click();
    expect(dispatch).toHaveBeenCalledTimes(2);
    const added = dispatch.mock.calls[0][0];
    expect(added.type).toBe('ADD_ELEMENT');
    expect(added.payload).toMatchObject({ type: 'comment', comment: '', pageIndex: 1, anchor: { kind: 'element', elementId: 'r1' } });
    expect(dispatch.mock.calls[1][0]).toEqual({ type: 'SET_ACTIVE_ELEMENT_ID', payload: added.payload.id });
  });
  it('selects the existing comment instead of adding another', () => {
    const dispatch = mount([target, existing]);
    click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'c9' });
  });
});
