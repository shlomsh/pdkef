import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { CommentCard } from '#editor/highlight/commentCards.ts';
import styles from './CommentRail.module.css';
import { CommentCardBody } from './CommentCardBody.tsx';

const band = { left: 10, top: 10, width: 30, height: 2 };
const card = (over: Partial<CommentCard> = {}): CommentCard => ({ id: 'h1', direction: 'ltr', comment: 'Check this', isNew: false, firstBand: band, ...over });

let host: HTMLDivElement | null = null;
afterEach(() => { if (host) render(null, host); host?.remove(); host = null; });

function mount(props: { card: CommentCard; active?: boolean; onSelect?: () => void; onSave?: (p: { comment: string; commentedAt: number }) => void; onDelete?: () => void; onDiscard?: () => void; onReturnFocus?: () => void; onEdit?: () => void; label?: string}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const draw = (c: CommentCard, active: boolean) => act(() => render(
    <CommentCardBody card={c} active={active} messages={englishSignMessages} onSelect={props.onSelect ?? (() => {})} onSave={props.onSave ?? (() => {})} onDelete={props.onDelete ?? (() => {})} onDiscard={props.onDiscard ?? (() => {})} onReturnFocus={props.onReturnFocus} onEdit={props.onEdit} label={props.label ?? 'Comment on page 1'} />, host!));
  draw(props.card, props.active ?? false);
  return { redraw: (c: CommentCard, active = props.active ?? false) => draw(c, active) };
}
const q = <T extends Element>(sel: string) => host!.querySelector<T>(sel)!;
const button = (label: string): HTMLButtonElement => [...host!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label)!;
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
const openMenu = () => act(() => q<HTMLElement>('[data-comment-more]').click());
const openEdit = () => { openMenu(); act(() => q<HTMLElement>('[data-comment-menu-edit]').click()); };
const type = (value: string) => act(() => { const t = q<HTMLTextAreaElement>('textarea'); t.value = value; t.dispatchEvent(new Event('input', { bubbles: true })); });

describe('CommentCardBody', () => {
  describe('with onEdit (the phone writes elsewhere)', () => {
    it('Edit calls onEdit and opens no field', () => {
      const onEdit = vi.fn();
      mount({ card: card(), active: true, onEdit });
      openEdit();
      expect(onEdit).toHaveBeenCalledOnce();
      expect(host!.querySelector('textarea')).toBeNull();
    });
    it('a new blank card still renders its read state', () => {
      mount({ card: card({ comment: '', isNew: true }), active: true, onEdit: () => {} });
      expect(host!.querySelector('textarea')).toBeNull();
    });
  });

  it('a closed card shows only its text, clamped, with no buttons or hint; a click and Enter select it', () => {
    const onSelect = vi.fn();
    mount({ card: card(), onSelect });
    const p = q('p');
    expect(p.textContent).toBe('Check this');
    expect(p.classList.contains(styles.clamp)).toBe(true);
    expect(host!.querySelector('button, svg, textarea, [title]')).toBeNull();
    act(() => (p as HTMLElement).click());
    expect(onSelect).toHaveBeenCalledOnce();
    key(q('[role="group"]'), 'Enter');
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(host!.querySelector('textarea')).toBeNull();
  });

  describe('open', () => {
    it('shows the whole text and a ... button with a menu popup', () => {
      mount({ card: card(), active: true });
      expect(q('p').classList.contains(styles.clamp)).toBe(false);
      const more = q('[data-comment-more]');
      expect(more.getAttribute('aria-label')).toBe(englishSignMessages.commentMore);
      expect(more.getAttribute('aria-haspopup')).toBe('menu');
      expect(more.getAttribute('aria-expanded')).toBe('false');
      expect(more.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
      expect(host!.querySelector('[data-comment-menu]')).toBeNull();
    });

    it('the menu carries the interface direction, so its words never decide the dir="auto" note around it', () => {
      mount({ card: card({ comment: 'הערה' }), active: true });
      openMenu();
      expect(q('[data-comment-menu]').getAttribute('dir')).toBe(englishSignMessages.dir);
    });

    it('the menu holds Edit and Delete, and opening it focuses Edit', () => {
      mount({ card: card(), active: true });
      openMenu();
      expect(q('[data-comment-more]').getAttribute('aria-expanded')).toBe('true');
      const items = [...host!.querySelectorAll('[data-comment-menu] [role="menuitem"]')];
      expect(items.map((i) => i.textContent)).toEqual(['Edit', 'Delete']);
      // Each item leads with its own icon, so the two words line up in one column.
      expect(items.map((i) => i.firstElementChild?.tagName.toLowerCase())).toEqual(['svg', 'svg']);
      expect(items[1].className).toContain(styles.danger);
      expect(document.activeElement).toBe(q('[data-comment-menu-edit]'));
    });

    it('Edit opens a prefilled field with Cancel and Save', () => {
      const onSave = vi.fn();
      mount({ card: card(), active: true, onSave });
      openEdit();
      expect(q<HTMLTextAreaElement>('textarea').value).toBe('Check this');
      expect(q('textarea').getAttribute('dir')).toBe('auto');
      type('Changed');
      act(() => button('Save').click());
      expect(onSave).toHaveBeenCalledWith({ comment: 'Changed', commentedAt: expect.any(Number) });
      expect(host!.querySelector('textarea')).toBeNull();
    });

    it('Delete calls onDelete and hands focus back', () => {
      const [onDelete, onReturnFocus] = [vi.fn(), vi.fn()];
      mount({ card: card(), active: true, onDelete, onReturnFocus });
      openMenu();
      act(() => q<HTMLElement>('[data-comment-menu-delete]').click());
      expect(onDelete).toHaveBeenCalledOnce();
      expect(onReturnFocus).toHaveBeenCalledOnce();
    });

    it('Escape in the menu closes only the menu, returns focus to the button and stops there', () => {
      const outer = vi.fn();
      mount({ card: card(), active: true });
      document.addEventListener('keydown', outer);
      openMenu();
      key(q('[data-comment-menu-edit]'), 'Escape');
      expect(host!.querySelector('[data-comment-menu]')).toBeNull();
      expect(document.activeElement).toBe(q('[data-comment-more]'));
      expect(outer).not.toHaveBeenCalled();
      expect(host!.querySelector('p')).not.toBeNull();
      document.removeEventListener('keydown', outer);
    });

    it('a click outside the menu closes it', () => {
      mount({ card: card(), active: true });
      openMenu();
      act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); document.body.click(); });
      expect(host!.querySelector('[data-comment-menu]')).toBeNull();
    });

    it('a click on the text toggles the clamp and aria-expanded; it opens whole again after being re-selected', () => {
      const onSelect = vi.fn();
      const { redraw } = mount({ card: card(), active: true, onSelect });
      const group = () => q('[role="group"]');
      expect(group().getAttribute('aria-expanded')).toBe('true');
      act(() => q<HTMLElement>('p').click());
      expect(group().getAttribute('aria-expanded')).toBe('false');
      expect(q('p').classList.contains(styles.clamp)).toBe(true);
      act(() => q<HTMLElement>('p').click());
      expect(group().getAttribute('aria-expanded')).toBe('true');
      act(() => q<HTMLElement>('p').click());
      redraw(card(), false);
      redraw(card(), true);
      expect(group().getAttribute('aria-expanded')).toBe('true');
      expect(q('p').classList.contains(styles.clamp)).toBe(false);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('a press outside closes the menu even where a parent stops propagation', () => {
      host = document.createElement('div');
      document.body.appendChild(host);
      const stop = (e: Event) => e.stopPropagation();
      act(() => render(
        <div onPointerDown={stop} onClick={stop}>
          <CommentCardBody card={card()} active messages={englishSignMessages} label="x" onSelect={() => {}} onSave={() => {}} onDelete={() => {}} onDiscard={() => {}} />
          <span data-elsewhere>elsewhere</span>
        </div>, host!));
      openMenu();
      expect(host.querySelector('[data-comment-menu]')).not.toBeNull();
      act(() => { const el = q('[data-elsewhere]'); el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(host.querySelector('[data-comment-menu]')).toBeNull();
    });

    it('focus moving out of the menu closes it', () => {
      mount({ card: card(), active: true });
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      openMenu();
      act(() => outside.focus());
      expect(host!.querySelector('[data-comment-menu]')).toBeNull();
      outside.remove();
    });

    it('ArrowDown and ArrowUp move focus between Edit and Delete, wrapping', () => {
      mount({ card: card(), active: true });
      openMenu();
      const edit = q('[data-comment-menu-edit]');
      const del = q('[data-comment-menu-delete]');
      key(edit, 'ArrowDown');
      expect(document.activeElement).toBe(del);
      key(del, 'ArrowDown');
      expect(document.activeElement).toBe(edit);
      key(edit, 'ArrowUp');
      expect(document.activeElement).toBe(del);
    });

    it('Space on the group toggles the fold and is default-prevented; from a child it does not', () => {
      mount({ card: card(), active: true });
      const group = q('[role="group"]');
      const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      act(() => { group.dispatchEvent(ev); });
      expect(ev.defaultPrevented).toBe(true);
      expect(group.getAttribute('aria-expanded')).toBe('false');
      key(q('[data-comment-more]'), ' ');
      expect(group.getAttribute('aria-expanded')).toBe('false');
    });

    it('a click that ends a text selection inside the card does not toggle', () => {
      mount({ card: card(), active: true });
      const text = q('p span').lastChild!;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 5);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      act(() => q<HTMLElement>('p').click());
      expect(q('[role="group"]').getAttribute('aria-expanded')).toBe('true');
      sel.removeAllRanges();
    });

    it('Enter on the group toggles too; the menu button does not', () => {
      mount({ card: card(), active: true });
      key(q('[role="group"]'), 'Enter');
      expect(q('[role="group"]').getAttribute('aria-expanded')).toBe('false');
      openMenu();
      expect(q('[role="group"]').getAttribute('aria-expanded')).toBe('false');
    });

    it('nothing else starts editing: click, double-click and Enter leave the field closed', () => {
      mount({ card: card(), active: true });
      act(() => q<HTMLElement>('p').click());
      act(() => { q('p').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
      key(q('[role="group"]'), 'Enter');
      expect(host!.querySelector('textarea')).toBeNull();
    });
  });

  it('a new note shows the field with Cancel and Comment (disabled while blank), no bin; Cancel discards', () => {
    const onDiscard = vi.fn();
    mount({ card: card({ comment: '', isNew: true }), active: true, onDiscard });
    expect(host!.querySelector('[data-highlight-note-input]')).not.toBeNull();
    expect(button('Comment').disabled).toBe(true);
    expect(host!.textContent).not.toContain('Delete');
    expect(host!.querySelector('[data-comment-more]')).toBeNull();
    act(() => button('Cancel').click());
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('editing a saved note shows Save and no bin', () => {
    mount({ card: card(), active: true });
    openEdit();
    expect(button('Comment')).toBeUndefined();
    expect(button('Save')).toBeDefined();
    expect(host!.querySelector('button[aria-label="Delete"]')).toBeNull();
    expect(host!.textContent).not.toContain('Delete');
  });

  it("Cancel and Save are the card's own quiet buttons, not the dialog's filled ones", () => {
    mount({ card: card(), active: true });
    openEdit();
    expect(button('Cancel').className).toBe(styles.cancel);
    expect(button('Save').className).toBe(styles.save);
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
    it('focusing the field of a card that is not the active one selects it', () => {
      const onSelect = vi.fn();
      mount({ card: card({ comment: '', isNew: true }), active: false, onSelect });
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
  });

  it('Save is disabled while a saved note is blank; Ctrl+Enter then does nothing, and a blank new note still discards', () => {
    const [onSave, onDelete, onDiscard] = [vi.fn(), vi.fn(), vi.fn()];
    mount({ card: card(), active: true, onSave, onDelete, onDiscard });
    openEdit();
    type('   ');
    expect(button('Save').disabled).toBe(true);
    act(() => { q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); });
    expect(host!.querySelector('textarea')).not.toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    render(null, host!);
    mount({ card: card({ comment: '', isNew: true }), active: true, onSave, onDelete, onDiscard });
    act(() => { q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); });
    expect(onDiscard).toHaveBeenCalledOnce();
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

  it('the field opens focused with the caret at the end', () => {
    mount({ card: card(), active: true });
    openEdit();
    const t = q<HTMLTextAreaElement>('textarea');
    expect(document.activeElement).toBe(t);
    expect(t.selectionStart).toBe('Check this'.length);
  });

  it('is a group named by its label', () => {
    mount({ card: card(), label: 'Comment on page 3, "Pay by Friday"' });
    const group = q('[role="group"]');
    expect(group.getAttribute('aria-label')).toBe('Comment on page 3, "Pay by Friday"');
    expect(group.textContent).toContain('Check this');
  });

  it('Save, Cancel and Esc hand focus back to the anchor', () => {
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
});
