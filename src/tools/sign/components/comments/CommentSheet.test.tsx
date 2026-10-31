import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { CommentSheet } from './CommentSheet.tsx';

const hl = (id: string, comment?: string, pageIndex = 1): EditorElement => ({
  id, type: 'highlight', pageIndex, left: 10, top: 20, width: 50, height: 2, color: '#ff0', comment,
  bands: [{ left: 0, top: 0, width: 100, height: 100 }],
} as unknown as EditorElement);

let host: HTMLDivElement | null = null;
afterEach(() => { if (host) render(null, host); host?.remove(); host = null; });

function mount(elements: EditorElement[], activeElementId: string | null, fns: { onChange?: (id: string, patch: { comment: string | undefined }) => void; onClose?: () => void } = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<CommentSheet elements={elements} activeElementId={activeElementId} messages={englishSignMessages}
    onChange={fns.onChange ?? (() => {})} onClose={fns.onClose ?? (() => {})} />, host!));
}
const sheet = () => host!.querySelector<HTMLElement>('[data-comment-sheet]');

describe('CommentSheet', () => {
  it('renders nothing without an active commented highlight', () => {
    mount([hl('a', 'hello'), hl('b')], null);
    expect(sheet()).toBeNull();
    act(() => render(null, host!));
    mount([hl('a', 'hello'), hl('b')], 'b');
    expect(sheet()).toBeNull();
  });

  it('renders the new-comment field when the comment is empty', () => {
    mount([hl('a', '')], 'a');
    expect(sheet()).not.toBeNull();
    expect(host!.querySelector('[data-highlight-note-input]')).not.toBeNull();
  });

  it('shows the text and Edit for an existing comment', () => {
    mount([hl('a', 'hello there')], 'a');
    expect(sheet()!.textContent).toContain('hello there');
    expect(sheet()!.textContent).toContain(englishSignMessages.commentEdit);
  });

  it('closes on Escape and on the grab bar', () => {
    const onClose = vi.fn();
    mount([hl('a', 'hello')], 'a', { onClose });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => { host!.querySelector<HTMLElement>('[data-comment-sheet-grab]')!.click(); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Cancel on a new comment removes it', () => {
    const onChange = vi.fn();
    mount([hl('a', '')], 'a', { onChange });
    const cancel = [...host!.querySelectorAll('button')].find((b) => b.textContent === englishSignMessages.commentCancel)!;
    act(() => cancel.click());
    expect(onChange).toHaveBeenCalledWith('a', { comment: undefined });
  });

  it('keeps clicks from reaching the workspace', () => {
    const outer = vi.fn();
    mount([hl('a', 'hello')], 'a');
    host!.addEventListener('click', outer);
    act(() => sheet()!.click());
    expect(outer).not.toHaveBeenCalled();
  });
});
