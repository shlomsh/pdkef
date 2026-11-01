import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { CommentCard } from '#editor/highlight/commentCards.ts';
import { CommentCardBody } from './CommentCardBody.tsx';

const band = { left: 10, top: 10, width: 30, height: 2 };
const card = (over: Partial<CommentCard> = {}): CommentCard => ({ id: 'h1', direction: 'ltr', comment: 'Check this', isNew: false, firstBand: band, ...over });

let host: HTMLDivElement | null = null;
afterEach(() => { if (host) render(null, host); host?.remove(); host = null; });

function mount(props: { card: CommentCard; active?: boolean; onSelect?: () => void; onSave?: (p: { comment: string; commentedAt: number }) => void; onDelete?: () => void; onDiscard?: () => void }) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const draw = (c: CommentCard, active: boolean) => act(() => render(
    <CommentCardBody card={c} active={active} messages={englishSignMessages}       onSelect={props.onSelect ?? (() => {})} onSave={props.onSave ?? (() => {})} onDelete={props.onDelete ?? (() => {})} onDiscard={props.onDiscard ?? (() => {})} />, host!));
  draw(props.card, props.active ?? false);
  return { redraw: (c: CommentCard, active = props.active ?? false) => draw(c, active) };
}
const q = <T extends Element>(sel: string) => host!.querySelector<T>(sel)!;
const button = (label: string): HTMLButtonElement => [...host!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label)!;
const menuItem = (label: string) => [...host!.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === label) as HTMLElement;
const type = (value: string) => act(() => { const t = q<HTMLTextAreaElement>('textarea'); t.value = value; t.dispatchEvent(new Event('input', { bubbles: true })); });

describe('CommentCardBody', () => {
  it('an inactive comment shows only its text (no author, date or page line); a click selects', () => {
    const onSelect = vi.fn();
    mount({ card: card({ commentedAt: new Date(2000, 0, 3, 9, 5).getTime() }), onSelect });
    expect(host!.textContent).toBe('Check this');
    expect(host!.querySelector('textarea')).toBeNull();
    expect(host!.querySelector('button')).toBeNull();
    act(() => q<HTMLElement>('p').click());
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('active existing card has a More menu with Edit, which opens a prefilled field with Cancel and Comment', () => {
    const onSave = vi.fn();
    mount({ card: card(), active: true, onSave });
    act(() => q<HTMLElement>('[aria-label="More"]').click());
    act(() => menuItem('Edit').click());
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
    act(() => q<HTMLElement>('[aria-label="More"]').click());
    act(() => menuItem('Edit').click());
    type('half typed');
    act(() => button('Cancel').click());
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(host!.textContent).toContain('Check this');
  });

  it('a blank save discards a new card and deletes an existing comment', () => {
    const [onSave, onDelete, onDiscard] = [vi.fn(), vi.fn(), vi.fn()];
    mount({ card: card({ comment: '', isNew: true }), active: true, onSave, onDelete, onDiscard });
    expect(button('Comment').disabled).toBe(true);
    render(null, host!);
    mount({ card: card(), active: true, onSave, onDelete, onDiscard });
    act(() => q<HTMLElement>('[aria-label="More"]').click());
    act(() => menuItem('Edit').click());
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

  it('Delete in the More menu deletes the comment, and an inactive or new card has no menu', () => {
    const onDelete = vi.fn();
    mount({ card: card(), active: true, onDelete });
    act(() => q<HTMLElement>('[aria-label="More"]').click());
    act(() => menuItem('Delete').click());
    expect(onDelete).toHaveBeenCalledOnce();
    render(null, host!);
    mount({ card: card(), active: false });
    expect(host!.querySelector('[aria-label="More"]')).toBeNull();
    render(null, host!);
    mount({ card: card({ comment: '', isNew: true }), active: true });
    expect(host!.querySelector('[aria-label="More"]')).toBeNull();
  });
});
