import { useEffect, useRef, useState } from 'preact/hooks';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { CommentCard } from '#editor/highlight/commentCards.ts';
import { commentPatch, type CommentPatch } from '#editor/highlight/commentCommit.ts';
import { TrashIcon } from '#editor-ui/toolIcons.tsx';
import dialogStyles from '#shell/Dialog.module.css';
import styles from './CommentRail.module.css';

/* Feather's pencil, at the same 18 px / stroke 2 as the trash beside it (no pencil exists in toolIcons). */
const PencilIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

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
  useEffect(() => { if (showField) ref.current?.focus(); }, [showField]);

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

  const blankNew = card.isNew && !draft.trim();
  return (
    <div class={styles.body} role="group" aria-label={label} onClick={() => { if (!card.isNew && !active) onSelect(); }}>
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
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary}`} onClick={cancel}>{messages.commentCancel}</button>
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.primary}`} disabled={blankNew} onClick={save}>{messages.highlightCommentLabel}</button>
          </div>
        </>
      ) : (
        <div class={styles.row}>
          <p class={styles.text} dir="auto">{card.comment}</p>
          <div class={styles.tools} data-active={active}>
            <button type="button" class={styles.tool} aria-label={messages.commentEdit} title={messages.commentEdit}
              onClick={() => { setDraft(card.comment); setEditing(true); }}>
              <PencilIcon />
            </button>
            <button type="button" class={`${styles.tool} ${styles.toolDelete}`} aria-label={messages.commentDelete} title={messages.commentDelete}
              onClick={() => { onDelete(); onReturnFocus?.(); }}>
              <TrashIcon size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
