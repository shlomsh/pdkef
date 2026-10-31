import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, afterEach, vi } from 'vitest';
import ElementToolbar from '../ElementToolbar.tsx';
import { SignToolContext, type SignToolContextValue } from '../SignToolContext.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';

const make = (over: Partial<HighlightElement>): HighlightElement => ({
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 50, height: 10, color: '#FFF34D',
  bands: [{ left: 0, top: 10, width: 100, height: 40 }], ...over,
});

let host: HTMLDivElement;
function mount(node: preact.ComponentChild) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(node, host));
}
afterEach(() => { act(() => render(null, host)); host.remove(); });

describe('toolbar comment button', () => {
  it('shows the generic Comment button for a highlight, and none for a comment', () => {
    const sign = { state: { elements: [make({})] }, dispatch: vi.fn() } as unknown as SignToolContextValue;
    mount(<SignToolContext.Provider value={sign}><ElementToolbar element={make({})} onChange={() => {}} onClone={() => {}} onDelete={() => {}} /></SignToolContext.Provider>);
    expect(host.querySelectorAll('button[title="Comment"]')).toHaveLength(1);
    const comment = { id: 'c1', type: 'comment', pageIndex: 0, left: 0, top: 0, width: 1, height: 1, comment: '', anchor: { kind: 'point' } };
    act(() => render(<SignToolContext.Provider value={sign}><ElementToolbar element={comment} onChange={() => {}} onClone={() => {}} onDelete={() => {}} /></SignToolContext.Provider>, host));
    expect(host.innerHTML).toBe('');
  });
});
