import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { CommentSheet } from './CommentSheet.tsx';

const hl = (id: string, comment: string, pageIndex = 1): EditorElement => ({
  id, type: 'comment', pageIndex, left: 10, top: 20, width: 50, height: 2, comment,
  anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 100 }] },
});
const highlight = (id: string): EditorElement => ({ id, type: 'highlight', pageIndex: 1, left: 10, top: 20, width: 50, height: 2, color: '#ff0', bands: [] });

let host: HTMLDivElement | null = null;
afterEach(() => { if (host) render(null, host); host?.remove(); host = null; });

function mount(elements: EditorElement[], activeElementId: string | null, fns: { onDiscard?: (id: string) => void; onClose?: () => void; onReturnFocus?: (id: string) => void } = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<CommentSheet elements={elements} activeElementId={activeElementId} messages={englishSignMessages}
    onSave={() => {}} onDelete={() => {}} onDiscard={fns.onDiscard ?? (() => {})} onClose={fns.onClose ?? (() => {})} onReturnFocus={fns.onReturnFocus} />, host!));
}
const sheet = () => host!.querySelector<HTMLElement>('[data-comment-sheet]');

describe('CommentSheet', () => {
  it('renders nothing without an active comment', () => {
    mount([hl('a', 'hello'), highlight('b')], null);
    expect(sheet()).toBeNull();
    act(() => render(null, host!));
    mount([hl('a', 'hello'), highlight('b')], 'b');
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
    expect(sheet()!.querySelector('button[aria-label="Edit"]')).not.toBeNull();
  });

  it('scrolls the anchor to the centre when it opens', () => {
    const node = document.createElement('div');
    node.setAttribute('data-editor-element-id', 'a');
    node.scrollIntoView = vi.fn();
    document.body.appendChild(node);
    mount([hl('a', 'hello')], 'a');
    expect(node.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    node.remove();
  });

  it('closes on Escape and on the grab bar', () => {
    const onClose = vi.fn();
    mount([hl('a', 'hello')], 'a', { onClose });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => { host!.querySelector<HTMLElement>('[data-comment-sheet-grab]')!.click(); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Cancel on a new comment discards it', () => {
    const onDiscard = vi.fn();
    mount([hl('a', '')], 'a', { onDiscard });
    const cancel = [...host!.querySelectorAll('button')].find((b) => b.textContent === englishSignMessages.commentCancel)!;
    act(() => cancel.click());
    expect(onDiscard).toHaveBeenCalledWith('a');
  });

  it('keeps clicks from reaching the workspace', () => {
    const outer = vi.fn();
    mount([hl('a', 'hello')], 'a');
    host!.addEventListener('click', outer);
    act(() => sheet()!.click());
    expect(outer).not.toHaveBeenCalled();
  });

  it('is a group naming its page, and opening a note puts the caret in the field', () => {
    mount([hl('a', '')], 'a');
    expect(sheet()!.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Comment on page 2');
    expect(document.activeElement).toBe(host!.querySelector('textarea'));
  });

  it('hands focus back when Cancel closes the note', () => {
    const onReturnFocus = vi.fn();
    mount([hl('a', '')], 'a', { onReturnFocus });
    const cancel = [...host!.querySelectorAll('button')].find((b) => b.textContent === englishSignMessages.commentCancel && b.className.includes('secondary'))
      ?? [...host!.querySelectorAll('button')].filter((b) => b.textContent === englishSignMessages.commentCancel).pop()!;
    act(() => cancel.click());
    expect(onReturnFocus).toHaveBeenCalledWith('a');
  });
});
