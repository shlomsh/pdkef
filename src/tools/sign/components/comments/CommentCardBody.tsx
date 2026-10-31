import type { ComponentChild } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { CommentCard } from '../../lib/highlight/commentCards.ts';
import { commentPatch } from '../../lib/highlight/commentCommit.ts';
import styles from './CommentRail.module.css';

type Patch = { comment: string | undefined };

/** SIGN-44: one comment card's content (rail card, later the phone sheet). Draft is local until Comment. */
export function CommentCardBody({ card, active, pageNumber, messages, crop, onSelect, onChange }: {
  card: CommentCard;
  active: boolean;
  pageNumber: number;
  messages: SignMessages;
  crop: ComponentChild;
  onSelect: () => void;
  onChange: (patch: Patch) => void;
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
    if (card.isNew) onChange({ comment: undefined });
    setEditing(false);
  };
  const save = () => {
    const patch = commentPatch(draft, card.comment || undefined);
    setEditing(false);
    if (patch) onChange(patch);
    else if (card.isNew) onChange({ comment: undefined });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); }
  };

  return (
    <div class={styles.body} onClick={() => { if (!card.isNew && !active) onSelect(); }}>
      <div class={styles.head}>
        <span class={styles.dot} style={{ background: card.color }} />
        {crop}
      </div>
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
            <button type="button" class={styles.secondary} onClick={cancel}>{messages.commentCancel}</button>
            <button type="button" class={styles.primary} onClick={save}>{messages.highlightCommentLabel}</button>
          </div>
        </>
      ) : (
        <>
          <p class={styles.text} dir="auto">{card.comment}</p>
          {active && (
            <div class={styles.actions}>
              <button type="button" class={styles.secondary} onClick={() => { setDraft(card.comment); setEditing(true); }}>{messages.commentEdit}</button>
            </div>
          )}
        </>
      )}
      <p class={styles.meta}>{formatMessage(messages.commentsPageEntry, { page: pageNumber })}</p>
    </div>
  );
}
