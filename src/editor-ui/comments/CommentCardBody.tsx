import { useEffect, useRef, useState } from 'preact/hooks';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { CommentCard } from '#editor/highlight/commentCards.ts';
import { commentPatch, type CommentPatch } from '#editor/highlight/commentCommit.ts';
import dialogStyles from '#shell/Dialog.module.css';
import { TrashIcon } from '../toolIcons.tsx';
import styles from './CommentRail.module.css';

/** SIGN-44: one comment card's content (rail card, later the phone sheet). Draft is local until Comment.
 * The card shows the comment alone; who and when stay in the saved annotation (/M), not on screen. */
export function CommentCardBody({ card, active, messages, label, onSelect, onSave, onDelete, onDiscard, onReturnFocus }: {
  card: CommentCard;
  active: boolean;
  messages: SignMessages;
  /** The group's accessible name: which passage this note belongs to. */
  label: string;
  onSelect: () => void;
  onSave: (patch: CommentPatch) => void;
  onDelete: () => void;
  onDiscard: () => void;
  /** Called once the person is done with the note (Save, Cancel, Esc, Delete): focus goes back to its anchor. */
  onReturnFocus?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.comment);
  // READ-17: an open note shows whole and a tap on it folds it to four lines and back; it opens whole each time it becomes active.
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const showField = card.isNew || editing;
  // Undo, redo or restore changed the comment from outside: follow it unless the person is typing.
  useEffect(() => { if (!showField) setDraft(card.comment); }, [card.comment, showField]);
  useEffect(() => {
    const field = ref.current;
    if (!showField || !field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [showField]);

  // Another note took over while this one was open for editing: keep what was typed (an emptied or unchanged field
  // keeps the old comment), close the field, and leave focus with the note that was picked.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) setCollapsed(false);
    if (wasActive.current && !active && editing) {
      const patch = commentPatch(draft, card.comment, Date.now());
      setEditing(false);
      if (patch) onSave(patch);
    }
    wasActive.current = active;
  }, [active]);

  const cancel = () => {
    setDraft(card.comment);
    if (card.isNew) onDiscard();
    setEditing(false);
    onReturnFocus?.();
  };
  const save = () => {
    const patch = commentPatch(draft, card.comment, Date.now());
    setEditing(false);
    if (patch) onSave(patch);
    else if (!draft.trim()) (card.isNew ? onDiscard : onDelete)();
    onReturnFocus?.();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); }
  };

  const startEdit = () => { setDraft(card.comment); setEditing(true); };
  const open = active && !showField;
  const onCardKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.target !== event.currentTarget || showField) return;
    event.preventDefault();
    if (open) setCollapsed((value) => !value); else onSelect();
  };

  const blankNew = card.isNew && !draft.trim();
  return (
    <div
      class={styles.body}
      role="group"
      aria-label={label}
      aria-expanded={open ? !collapsed : undefined}
      data-active={active || undefined}
      tabIndex={showField ? undefined : 0}
      onClick={(event) => {
        // Buttons and the menu bubble their click up here; none of them is a tap on the text.
        if ((event.target as Element).closest('button, textarea, [role="menu"]')) return;
        if (card.isNew || showField) return;
        if (!active) onSelect(); else setCollapsed((value) => !value);
      }}
      onKeyDown={onCardKeyDown}
    >
      {showField ? (
        <>
          <textarea
            ref={ref}
            data-highlight-note-input
            class={styles.input}
            dir="auto"
            rows={3}
            value={draft}
            placeholder={messages.highlightCommentPlaceholder}
            aria-label={messages.highlightCommentLabel}
            onFocus={() => { if (!active) onSelect(); }}
            onInput={(event) => setDraft((event.currentTarget as HTMLTextAreaElement).value)}
            onKeyDown={onKeyDown}
            onKeyUp={(event) => event.stopPropagation()}
          />
          <div class={styles.actions}>
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary} ${styles.cancel}`} onClick={cancel}>{messages.commentCancel}</button>
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.primary} ${styles.save}`} disabled={blankNew} onClick={save}>{card.isNew ? messages.highlightCommentLabel : messages.commentSave}</button>
          </div>
        </>
      ) : (
        <>
          <p class={`${styles.text}${open ? ` ${styles.open}` : ''}${!open || collapsed ? ` ${styles.clamp}` : ''}`} data-comment-text dir="auto">{card.comment}</p>
          {open && <MoreMenu messages={messages} onEdit={startEdit} onDelete={() => { onDelete(); onReturnFocus?.(); }} />}
        </>
      )}
    </div>
  );
}

/** The top layer, where the browser has it; without it the menu stays an absolute box inside the card. */
const TOP_LAYER = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

/** READ-17: the open note's ... button and its Edit / Delete menu. Edit takes focus on open; Escape closes only the menu. */
function MoreMenu({ messages, onEdit, onDelete }: { messages: SignMessages; onEdit: () => void; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const menu = menuRef.current;
    const more = moreRef.current;
    if (!menuOpen || !menu || !more) return;
    // The menu opens in the top layer: the phone pane's cards scroll, and any scroll container would cut it off.
    // It stays in the card's DOM, so focus and presses on it still count as inside the note.
    let stopPlacing = () => {};
    if (TOP_LAYER) {
      menu.showPopover();
      const place = () => computePosition(more, menu, {
        strategy: 'fixed',
        placement: getComputedStyle(more).direction === 'rtl' ? 'bottom-start' : 'bottom-end',
        middleware: [offset(4), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => Object.assign(menu.style, { left: `${x}px`, top: `${y}px` }));
      stopPlacing = autoUpdate(more, menu, place);
    }
    menu.querySelector<HTMLElement>('[data-comment-menu-edit]')?.focus();
    const away = (event: Event) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !moreRef.current?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('click', away);
    return () => {
      stopPlacing();
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('click', away);
    };
  }, [menuOpen]);
  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
    moreRef.current?.focus();
  };
  return (
    <>
      <button ref={moreRef} type="button" data-comment-more class={styles.more} aria-label={messages.commentMore} title={messages.commentMore}
        aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {menuOpen && (
        <div ref={menuRef} role="menu" data-comment-menu popover={TOP_LAYER ? 'manual' : undefined} class={styles.menu} onKeyDown={onMenuKeyDown}>
          <button type="button" role="menuitem" data-comment-menu-edit class={styles.menuItem} onClick={onEdit}>{messages.commentEdit}</button>
          <button type="button" role="menuitem" data-comment-menu-delete class={styles.menuItem} onClick={onDelete}><TrashIcon />{messages.commentDelete}</button>
        </div>
      )}
    </>
  );
}
