import { useEffect, useRef, useState } from 'preact/hooks';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { CommentCard } from '#editor/highlight/commentCards.ts';
import { commentPatch, type CommentPatch } from '#editor/highlight/commentCommit.ts';
import headerStyles from '../EditorPageHeader.module.css';
import dialogStyles from '#shell/Dialog.module.css';
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
      class={styles.body}
      role="group"
      aria-label={label}
      title={showField ? undefined : messages.commentEditHint}
      tabIndex={showField ? undefined : 0}
      onClick={() => { if (card.isNew || showField) return; if (active) startEdit(); else onSelect(); }}
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
                onClick={() => { onDelete(); onReturnFocus?.(); }}>{messages.commentDelete}</button>
            )}
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary}`} onClick={cancel}>{messages.commentCancel}</button>
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.primary}`} disabled={blankNew} onClick={save}>{messages.highlightCommentLabel}</button>
          </div>
        </>
      ) : (
        <p class={styles.text} dir="auto">{card.comment}</p>
      )}
    </div>
  );
}
