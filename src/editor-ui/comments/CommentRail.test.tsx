import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { CommentRail } from './CommentRail.tsx';

const hl = (id: string, top: number, comment: string, pageIndex = 0): EditorElement => ({
  id, type: 'comment', pageIndex, left: 10, top, width: 50, height: 2, comment,
  anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 100 }] },
});

let host: HTMLDivElement | null = null;
afterEach(() => { if (host) render(null, host); host?.remove(); host = null; vi.restoreAllMocks(); });

function mount(elements: EditorElement[], activeElementId: string | null = null, extra: { onSelect?: (id: string) => void; onReturnFocus?: (id: string) => void; pageIndex?: number } = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<CommentRail pageIndex={extra.pageIndex ?? 0} onReturnFocus={extra.onReturnFocus} elements={elements} activeElementId={activeElementId} messages={englishSignMessages}
    onSelect={extra.onSelect ?? (() => {})} onSave={() => {}} onDelete={() => {}} onDiscard={() => {}} />, host!));
}
const cards = () => [...host!.querySelectorAll<HTMLElement>('[data-comment-card]')];

describe('CommentRail', () => {
  it('renders one card per comment in reading order', () => {
    mount([hl('b', 50, 'second'), hl('a', 10, 'first'), hl('x', 30, '  '), hl('o', 5, 'other page', 1)]);
    expect(cards().map((c) => c.dataset.commentCard)).toEqual(['a', 'b']);
    expect(host!.querySelector('[data-comment-rail]')).not.toBeNull();
  });

  it('a saved card has no buttons in read mode; a double-click opens it with Delete', () => {
    mount([hl('a', 10, 'first')], 'a');
    expect(host!.querySelector('button')).toBeNull();
    expect(host!.querySelector('[aria-haspopup]')).toBeNull();
    act(() => { host!.querySelector('p')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect([...host!.querySelectorAll('button')].some((b) => b.textContent === 'Delete')).toBe(true);
  });

  it('adds the active comment that was just opened for a comment, and marks the active card', () => {
    mount([hl('a', 10, 'first'), hl('n', 40, '')], 'n');
    expect(cards().map((c) => c.dataset.commentCard)).toEqual(['a', 'n']);
    expect(cards()[1].dataset.active).toBe('true');
    expect(cards()[0].dataset.active).toBeUndefined();
    expect(host!.querySelector('[data-highlight-note-input]')).not.toBeNull();
  });

  it('stacks cards below each other when their passages are close, and grows the rail', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 1000 } as DOMRect);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80);
    mount([hl('a', 10, 'one'), hl('b', 11, 'two')]);
    const [a, b] = cards();
    expect(a.style.top).toBe('94px');
    expect(b.style.top).toBe('182px');
    expect((host!.querySelector('[data-comment-rail]') as HTMLElement).style.minHeight).toBe('262px');
  });

  it('keeps clicks from reaching the workspace', () => {
    const outer = vi.fn();
    mount([hl('a', 10, 'one')]);
    host!.addEventListener('click', outer);
    act(() => cards()[0].click());
    expect(outer).not.toHaveBeenCalled();
  });

  it('clicking an idle card selects it and scrolls its passage into view', () => {
    const onSelect = vi.fn();
    const node = document.createElement('div');
    node.setAttribute('data-editor-element-id', 'a');
    const scroll = vi.fn();
    node.scrollIntoView = scroll;
    document.body.appendChild(node);
    mount([hl('a', 10, 'one')], null, { onSelect });
    act(() => host!.querySelector<HTMLElement>('p')!.click());
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    node.remove();
  });

  it('selecting or hovering an element comment acts on its target node', () => {
    const target = document.createElement('div');
    target.setAttribute('data-editor-element-id', 'box');
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    const onSelect = vi.fn();
    const box = { id: 'box', type: 'whiteout', pageIndex: 0, left: 5, top: 30, width: 10, height: 4 } as unknown as EditorElement;
    const onBox: EditorElement = { id: 'c', type: 'comment', pageIndex: 0, left: 0, top: 0, width: 0, height: 0, comment: 'hi', anchor: { kind: 'element', elementId: 'box' } };
    mount([box, onBox], null, { onSelect });
    act(() => { cards()[0].dispatchEvent(new MouseEvent('mouseenter')); });
    expect(target.hasAttribute('data-comment-hover')).toBe(true);
    act(() => host!.querySelector<HTMLElement>('p')!.click());
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(target.scrollIntoView).toHaveBeenCalled();
    target.remove();
  });

  it('hovering a card marks its passage', () => {
    const node = document.createElement('div');
    node.setAttribute('data-editor-element-id', 'a');
    document.body.appendChild(node);
    mount([hl('a', 10, 'one')]);
    act(() => { cards()[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); cards()[0].dispatchEvent(new MouseEvent('mouseenter')); });
    expect(node.hasAttribute('data-comment-hover')).toBe(true);
    act(() => { cards()[0].dispatchEvent(new MouseEvent('mouseleave')); });
    expect(node.hasAttribute('data-comment-hover')).toBe(false);
    node.remove();
  });

  it('names each card as a group for its page, quoting the anchored text when the element has one', () => {
    const text = { id: 't', type: 'text', pageIndex: 2, left: 5, top: 10, text: 'Pay by Friday', width: 20, height: 4 } as unknown as EditorElement;
    const onText: EditorElement = { id: 'c', type: 'comment', pageIndex: 2, left: 0, top: 0, width: 0, height: 0, comment: 'hi', anchor: { kind: 'element', elementId: 't' } };
    mount([text, onText, hl('a', 10, 'plain', 2)], null, { pageIndex: 2 });
    const labels = cards().map((c) => c.querySelector('[role="group"]')!.getAttribute('aria-label'));
    expect(labels).toEqual(['Comment on page 3, "Pay by Friday"', 'Comment on page 3']);
  });

  it('opening a note puts the caret in its field', () => {
    mount([hl('n', 40, '')], 'n');
    expect(document.activeElement).toBe(host!.querySelector('textarea'));
  });

  it('hands focus back to the card\'s comment id when a card closes by Cancel', () => {
    const onReturnFocus = vi.fn();
    mount([hl('n', 40, '')], 'n', { onReturnFocus });
    act(() => [...host!.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click());
    expect(onReturnFocus).toHaveBeenCalledWith('n');
  });
});
