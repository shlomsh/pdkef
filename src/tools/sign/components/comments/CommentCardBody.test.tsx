import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { CommentCard } from '../../lib/highlight/commentCards.ts';
import { CommentCardBody } from './CommentCardBody.tsx';

const band = { left: 10, top: 10, width: 30, height: 2 };
const card = (over: Partial<CommentCard> = {}): CommentCard => ({ id: 'h1', color: '#ff0', direction: 'ltr', comment: 'Check this', isNew: false, firstBand: band, ...over });

let host: HTMLDivElement | null = null;
afterEach(() => { if (host) render(null, host); host?.remove(); host = null; });

function mount(props: { card: CommentCard; active?: boolean; onSelect?: () => void; onChange?: (p: { comment: string | undefined }) => void }) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const draw = (c: CommentCard, active: boolean) => act(() => render(
    <CommentCardBody card={c} active={active} messages={englishSignMessages}       onSelect={props.onSelect ?? (() => {})} onChange={props.onChange ?? (() => {})} />, host!));
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
    const onChange = vi.fn();
    mount({ card: card(), active: true, onChange });
    act(() => q<HTMLElement>('[aria-label="More"]').click());
    act(() => menuItem('Edit').click());
    expect(q<HTMLTextAreaElement>('textarea').value).toBe('Check this');
    expect(q('textarea').getAttribute('dir')).toBe('auto');
    type('Changed');
    act(() => button('Comment').click());
    expect(onChange).toHaveBeenCalledWith({ comment: 'Changed', commentedAt: expect.any(Number) });
    expect(host!.querySelector('textarea')).toBeNull();
  });

  it('Cancel on a new card removes the comment; on an edit it only closes', () => {
    const onChange = vi.fn();
    mount({ card: card({ comment: '', isNew: true }), active: true, onChange });
    expect(host!.querySelector('[data-highlight-note-input]')).not.toBeNull();
    act(() => button('Cancel').click());
    expect(onChange).toHaveBeenCalledWith({ comment: undefined });
  });

  it('Cancel while editing keeps the comment', () => {
    const onChange = vi.fn();
    mount({ card: card(), active: true, onChange });
    act(() => q<HTMLElement>('[aria-label="More"]').click());
    act(() => menuItem('Edit').click());
    type('half typed');
    act(() => button('Cancel').click());
    expect(onChange).not.toHaveBeenCalled();
    expect(host!.textContent).toContain('Check this');
  });

  it('a blank save removes the comment, on a new card and on an existing one', () => {
    const onChange = vi.fn();
    mount({ card: card({ comment: '', isNew: true }), active: true, onChange });
    expect(button('Comment').disabled).toBe(true);
    act(() => button('Comment').click());
    render(null, host!);
    mount({ card: card(), active: true, onChange });
    act(() => q<HTMLElement>('[aria-label="More"]').click());
    act(() => menuItem('Edit').click());
    type('   ');
    act(() => button('Comment').click());
    expect(onChange).toHaveBeenLastCalledWith({ comment: undefined, commentedAt: undefined });
  });

  it('Escape cancels and Ctrl+Enter saves, and keys never travel past the field', () => {
    const onChange = vi.fn();
    const outer = vi.fn();
    mount({ card: card({ comment: '', isNew: true }), active: true, onChange });
    document.addEventListener('keydown', outer);
    type('Hello');
    act(() => { q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ comment: 'Hello', commentedAt: expect.any(Number) });
    act(() => { q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
    act(() => { q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ comment: undefined });
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
  });

  it('shows a comment that changed from outside while not editing', () => {
    const { redraw } = mount({ card: card() });
    redraw(card({ comment: 'After undo' }));
    expect(host!.textContent).toContain('After undo');
  });

  it('Delete in the More menu removes the comment and its date, and an inactive or new card has no menu', () => {
    const onChange = vi.fn();
    mount({ card: card(), active: true, onChange });
    act(() => q<HTMLElement>('[aria-label="More"]').click());
    act(() => menuItem('Delete').click());
    expect(onChange).toHaveBeenCalledWith({ comment: undefined, commentedAt: undefined });
    render(null, host!);
    mount({ card: card(), active: false });
    expect(host!.querySelector('[aria-label="More"]')).toBeNull();
    render(null, host!);
    mount({ card: card({ comment: '', isNew: true }), active: true });
    expect(host!.querySelector('[aria-label="More"]')).toBeNull();
  });
});
