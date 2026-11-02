import { useEffect, useRef, useState } from 'preact/hooks';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { CommentCard } from '#editor/highlight/commentCards.ts';
import { commentPatch, type CommentPatch } from '#editor/highlight/commentCommit.ts';
import headerStyles from '../EditorPageHeader.module.css';
import dialogStyles from '#shell/Dialog.module.css';
import { TrashIcon } from '../toolIcons.tsx';
import styles from './CommentRail.module.css';

/** SIGN-44: one comment card's content (rail card, later the phone sheet). Draft is local until Comment.
 * The card shows the comment alone; who and when stay in the saved annotation (/M), not on screen. */
export function CommentCardBody({ card, active, messages, label, onSelect, onSave, onDelete, onDiscard, onReturnFocus, readActions }: {
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
  /** Touch: Delete and Edit show as buttons in the read state, so neither depends on finding a tap on the text. */
  readActions?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.comment);
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
  const onCardKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && event.target === event.currentTarget && !showField) { event.preventDefault(); startEdit(); }
  };

  const blankNew = card.isNew && !draft.trim();
  return (
    <div
      class={showField ? styles.body : `${styles.body} ${styles.editable}`}
      role="group"
      aria-label={label}
      title={active && !showField ? messages.commentEditHint : undefined}
      data-active={active || undefined}
      tabIndex={showField ? undefined : 0}
      onClick={(event) => {
        // Save, Cancel and Delete bubble their click up here; once they have closed the field (and the host has
        // re-rendered in the same task) that click would read as a tap on the text and reopen it.
        if ((event.target as Element).closest('button, textarea')) return;
        if (card.isNew || showField) return;
        if (!active) onSelect(); else startEdit();
      }}
      onDblClick={() => { if (!card.isNew && !showField) startEdit(); }}
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
            onInput={(event) => setDraft((event.currentTarget as HTMLTextAreaElement).value)}
            onKeyDown={onKeyDown}
            onKeyUp={(event) => event.stopPropagation()}
          />
          <div class={styles.actions}>
            {!card.isNew && (
              <button type="button" class={`${headerStyles['page-action']} ${headerStyles['clear-page']} ${styles.delete}`}
                aria-label={messages.commentDelete} title={messages.commentDelete}
                onClick={() => { onDelete(); onReturnFocus?.(); }}><TrashIcon /><span class={styles.deleteLabel}>{messages.commentDelete}</span></button>
            )}
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary} ${styles.cancel}`} onClick={cancel}>{messages.commentCancel}</button>
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.primary} ${styles.save}`} disabled={blankNew} onClick={save}>{messages.highlightCommentLabel}</button>
          </div>
        </>
      ) : (
        <>
          <p class={styles.text} dir="auto">{card.comment}</p>
          {readActions ? (
            <div class={styles.readActions}>
              <button type="button" data-comment-read-delete class={`${headerStyles['page-action']} ${headerStyles['clear-page']} ${styles.delete}`}
                aria-label={messages.commentDelete} title={messages.commentDelete}
                onClick={() => { onDelete(); onReturnFocus?.(); }}><TrashIcon /><span class={styles.deleteLabel}>{messages.commentDelete}</span></button>
              <button type="button" data-comment-read-edit class={styles.readEdit} onClick={startEdit}>{messages.commentEdit}</button>
            </div>
          ) : (
            <svg data-comment-edit-icon class={styles.editIcon} aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          )}
        </>
      )}
    </div>
  );
}
