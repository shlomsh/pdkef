import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { CommentCard } from '#editor/highlight/commentCards.ts';
import headerStyles from '../EditorPageHeader.module.css';
import { CommentCardBody } from './CommentCardBody.tsx';

const band = { left: 10, top: 10, width: 30, height: 2 };
const card = (over: Partial<CommentCard> = {}): CommentCard => ({ id: 'h1', direction: 'ltr', comment: 'Check this', isNew: false, firstBand: band, ...over });

let host: HTMLDivElement | null = null;
afterEach(() => { if (host) render(null, host); host?.remove(); host = null; });

function mount(props: { card: CommentCard; active?: boolean; onSelect?: () => void; onSave?: (p: { comment: string; commentedAt: number }) => void; onDelete?: () => void; onDiscard?: () => void; onReturnFocus?: () => void; label?: string }) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const draw = (c: CommentCard, active: boolean) => act(() => render(
    <CommentCardBody card={c} active={active} messages={englishSignMessages}       onSelect={props.onSelect ?? (() => {})} onSave={props.onSave ?? (() => {})} onDelete={props.onDelete ?? (() => {})} onDiscard={props.onDiscard ?? (() => {})} onReturnFocus={props.onReturnFocus} label={props.label ?? 'Comment on page 1'} />, host!));
  draw(props.card, props.active ?? false);
  return { redraw: (c: CommentCard, active = props.active ?? false) => draw(c, active) };
}
const q = <T extends Element>(sel: string) => host!.querySelector<T>(sel)!;
const button = (label: string): HTMLButtonElement => [...host!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label)!;
const dbl = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
const openEdit = () => dbl(q('p'));
const type = (value: string) => act(() => { const t = q<HTMLTextAreaElement>('textarea'); t.value = value; t.dispatchEvent(new Event('input', { bubbles: true })); });

describe('CommentCardBody', () => {
  const stubPointer = (coarse: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query.includes('coarse'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));

  it('an inactive comment shows only its text (no author, date or page line); a click selects', () => {
    const onSelect = vi.fn();
    mount({ card: card({ commentedAt: new Date(2000, 0, 3, 9, 5).getTime() }), onSelect });
    expect(host!.querySelector('p')!.textContent).toBe('Check this');
    expect(host!.querySelector('textarea')).toBeNull();
    expect(host!.querySelector('[aria-haspopup]')).toBeNull();
    act(() => q<HTMLElement>('p').click());
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('only the active card carries the edit hint title', () => {
    mount({ card: card(), active: false });
    expect(q('[role="group"]').getAttribute('title')).toBeNull();
    mount({ card: card(), active: true });
    expect(q('[role="group"]').getAttribute('title')).toBe(englishSignMessages.commentEditHint);
  });

  it('on a fine pointer, one click on an active saved card opens the field', () => {
    stubPointer(false);
    const onSelect = vi.fn();
    mount({ card: card(), active: true, onSelect });
    act(() => q<HTMLElement>('p').click());
    expect(host!.querySelector('textarea')).not.toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('on a fine pointer, one click on an inactive card selects and does not edit', () => {
    stubPointer(false);
    const onSelect = vi.fn();
    mount({ card: card(), active: false, onSelect });
    act(() => q<HTMLElement>('p').click());
    expect(onSelect).toHaveBeenCalledOnce();
    expect(host!.querySelector('textarea')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('a double-click on a saved card opens a prefilled field with Cancel and Comment', () => {
    const onSave = vi.fn();
    mount({ card: card(), active: true, onSave });
    openEdit();
    expect(q<HTMLTextAreaElement>('textarea').value).toBe('Check this');
    expect(q('textarea').getAttribute('dir')).toBe('auto');
    type('Changed');
    act(() => button('Comment').click());
    expect(onSave).toHaveBeenCalledWith({ comment: 'Changed', commentedAt: expect.any(Number) });
    expect(host!.querySelector('textarea')).toBeNull();
  });

  it('Cancel on a new card discards the comment; on an edit it only closes', () => {
    const onDiscard = vi.fn();
    mount({ card: card({ comment: '', isNew: true }), active: true, onDiscard });
    expect(host!.querySelector('[data-highlight-note-input]')).not.toBeNull();
    act(() => button('Cancel').click());
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('Cancel while editing keeps the comment', () => {
    const [onSave, onDelete, onDiscard] = [vi.fn(), vi.fn(), vi.fn()];
    mount({ card: card(), active: true, onSave, onDelete, onDiscard });
    openEdit();
    type('half typed');
    act(() => button('Cancel').click());
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(host!.textContent).toContain('Check this');
  });

  describe('moving from one note to another', () => {
    it('opening the field of a card that is not the active one (it takes the caret) selects it', () => {
      const onSelect = vi.fn();
      mount({ card: card(), active: false, onSelect });
      openEdit();
      expect(onSelect).toHaveBeenCalledOnce();
    });

    it('focusing the field of the active card selects nothing', () => {
      const onSelect = vi.fn();
      mount({ card: card(), active: true, onSelect });
      openEdit();
      act(() => { q<HTMLTextAreaElement>('textarea').dispatchEvent(new FocusEvent('focus')); });
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('a note being edited saves what was typed when another note takes over, closes, and leaves focus where it went', () => {
      const [onSave, onReturnFocus] = [vi.fn(), vi.fn()];
      const { redraw } = mount({ card: card(), active: true, onSave, onReturnFocus });
      openEdit();
      type('Check this, and more');
      redraw(card(), false);
      expect(onSave).toHaveBeenCalledWith({ comment: 'Check this, and more', commentedAt: expect.any(Number) });
      expect(host!.querySelector('textarea')).toBeNull();
      expect(onReturnFocus).not.toHaveBeenCalled();
    });

    it('closes without saving or deleting when nothing changed, or when the field was emptied', () => {
      const [onSave, onDelete] = [vi.fn(), vi.fn()];
      const first = mount({ card: card(), active: true, onSave, onDelete });
      openEdit();
      first.redraw(card(), false);
      expect(host!.querySelector('textarea')).toBeNull();
      first.redraw(card(), true);
      openEdit();
      type('  ');
      first.redraw(card(), false);
      expect(host!.querySelector('textarea')).toBeNull();
      expect(onSave).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('a note opened by double-click while inactive stays open', () => {
      const onSave = vi.fn();
      mount({ card: card(), active: false, onSave });
      openEdit();
      expect(host!.querySelector('textarea')).not.toBeNull();
    });
  });

  it('a blank save discards a new card and deletes an existing comment', () => {
    const [onSave, onDelete, onDiscard] = [vi.fn(), vi.fn(), vi.fn()];
    mount({ card: card({ comment: '', isNew: true }), active: true, onSave, onDelete, onDiscard });
    expect(button('Comment').disabled).toBe(true);
    render(null, host!);
    mount({ card: card(), active: true, onSave, onDelete, onDiscard });
    openEdit();
    type('   ');
    act(() => button('Comment').click());
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Escape cancels and Ctrl+Enter saves, and keys never travel past the field', () => {
    const [onSave, onDiscard] = [vi.fn(), vi.fn()];
    const outer = vi.fn();
    mount({ card: card({ comment: '', isNew: true }), active: true, onSave, onDiscard });
    document.addEventListener('keydown', outer);
    type('Hello');
    act(() => { q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); });
    expect(onSave).toHaveBeenLastCalledWith({ comment: 'Hello', commentedAt: expect.any(Number) });
    act(() => { q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
    act(() => { q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
  });

  it('shows a comment that changed from outside while not editing', () => {
    const { redraw } = mount({ card: card() });
    redraw(card({ comment: 'After undo' }));
    expect(host!.textContent).toContain('After undo');
  });

  it('a saved card in read mode has no buttons and says how to edit', () => {
    mount({ card: card(), active: true });
    expect(host!.querySelector('button')).toBeNull();
    expect(q('[role="group"]').getAttribute('title')).toBe(englishSignMessages.commentEditHint);
  });

  it('a double-click on the text opens the field, focused with the caret at the end', () => {
    mount({ card: card() });
    openEdit();
    const t = q<HTMLTextAreaElement>('textarea');
    expect(document.activeElement).toBe(t);
    expect(t.selectionStart).toBe('Check this'.length);
  });

  it('Enter on the focused card opens the field', () => {
    mount({ card: card(), active: true });
    const group = q<HTMLElement>('[role="group"]');
    act(() => { group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(host!.querySelector('textarea')).not.toBeNull();
  });

  it('a mouse double-click on an active card still opens the field', () => {
    stubPointer(false);
    mount({ card: card(), active: true });
    openEdit();
    expect(host!.querySelector('textarea')).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it('a touch tap on the active card opens the field; on an inactive card it only selects', () => {
    stubPointer(true);
    const onSelect = vi.fn();
    mount({ card: card(), active: false, onSelect });
    act(() => q<HTMLElement>('p').click());
    expect(onSelect).toHaveBeenCalledOnce();
    expect(host!.querySelector('textarea')).toBeNull();
    render(null, host!);
    mount({ card: card(), active: true });
    act(() => q<HTMLElement>('p').click());
    expect(host!.querySelector('textarea')).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it('editing a saved comment offers Delete, styled like Clear page, before Cancel; it deletes and returns focus', () => {
    const [onDelete, onReturnFocus] = [vi.fn(), vi.fn()];
    mount({ card: card(), active: true, onDelete, onReturnFocus });
    openEdit();
    const del = button('Delete');
    expect(del.classList.contains(headerStyles['page-action'])).toBe(true);
    expect(del.classList.contains(headerStyles['clear-page'])).toBe(true);
    expect(del.compareDocumentPosition(button('Cancel')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => del.click());
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onReturnFocus).toHaveBeenCalledOnce();
  });

  it('a new comment has no Delete', () => {
    mount({ card: card({ comment: '', isNew: true }), active: true });
    expect(host!.querySelector('textarea')).not.toBeNull();
    expect(host!.textContent).not.toContain('Delete');
  });

  it('is a group named by its label', () => {
    mount({ card: card(), label: 'Comment on page 3, "Pay by Friday"' });
    const group = q('[role="group"]');
    expect(group.getAttribute('aria-label')).toBe('Comment on page 3, "Pay by Friday"');
    expect(group.textContent).toContain('Check this');
  });

  it('opening a new note puts the caret in its field', () => {
    mount({ card: card({ comment: '', isNew: true }), active: true });
    expect(document.activeElement).toBe(q('textarea'));
  });

  it('Save, Cancel and Esc hand focus back to the anchor; so does a blank save', () => {
    const onReturnFocus = vi.fn();
    mount({ card: card({ comment: '', isNew: true }), active: true, onReturnFocus });
    type('Hello');
    act(() => button('Comment').click());
    expect(onReturnFocus).toHaveBeenCalledTimes(1);
    act(() => button('Cancel').click());
    expect(onReturnFocus).toHaveBeenCalledTimes(2);
    type('again');
    act(() => { q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onReturnFocus).toHaveBeenCalledTimes(3);
  });

  it('Delete hands focus back too', () => {
    const onReturnFocus = vi.fn();
    mount({ card: card(), active: true, onReturnFocus });
    openEdit();
    act(() => button('Delete').click());
    expect(onReturnFocus).toHaveBeenCalledOnce();
  });

  it('Delete is an icon button named Delete, and the saved card carries an aria-hidden edit pencil', () => {
    mount({ card: card(), active: true });
    expect(host!.querySelector('[data-comment-edit-icon]')!.getAttribute('aria-hidden')).toBe('true');
    openEdit();
    const del = q<HTMLButtonElement>('button[aria-label="Delete"]');
    expect(del.querySelector('svg')).not.toBeNull();
  });
});
