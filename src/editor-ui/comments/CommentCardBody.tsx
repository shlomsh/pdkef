import { useEffect, useRef, useState } from 'preact/hooks';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { CommentCard } from '#editor/highlight/commentCards.ts';
import { commentPatch, type CommentPatch } from '#editor/highlight/commentCommit.ts';
import styles from './CommentRail.module.css';

/** SIGN-44: one comment card's content (rail card, later the phone sheet). Draft is local until Comment.
 * The card shows the comment alone; who and when stay in the saved annotation (/M), not on screen. */
export function CommentCardBody({ card, active, messages, onSelect, onSave, onDelete, onDiscard }: {
  card: CommentCard;
  active: boolean;
  messages: SignMessages;
  onSelect: () => void;
  onSave: (patch: CommentPatch) => void;
  onDelete: () => void;
  onDiscard: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState(card.comment);
  const ref = useRef<HTMLTextAreaElement>(null);
  const showField = card.isNew || editing;
  // Undo, redo or restore changed the comment from outside: follow it unless the person is typing.
  useEffect(() => { if (!showField) setDraft(card.comment); }, [card.comment, showField]);
  useEffect(() => { if (showField) ref.current?.focus(); }, [showField]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey, true); };
  }, [menu]);
  useEffect(() => { if (!active) setMenu(false); }, [active]);

  const cancel = () => {
    setDraft(card.comment);
    if (card.isNew) onDiscard();
    setEditing(false);
  };
  const save = () => {
    const patch = commentPatch(draft, card.comment, Date.now());
    setEditing(false);
    if (patch) onSave(patch);
    else if (!draft.trim()) (card.isNew ? onDiscard : onDelete)();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); }
  };

  const blankNew = card.isNew && !draft.trim();
  return (
    <div class={styles.body} onClick={() => { if (!card.isNew && !active) onSelect(); }}>
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
            <button type="button" class={styles.primary} disabled={blankNew} onClick={save}>{messages.highlightCommentLabel}</button>
          </div>
        </>
      ) : (
        <div class={styles.row}>
          <p class={styles.text} dir="auto">{card.comment}</p>
          {active && (
            <div class={styles.menuWrap} onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" class={styles.more} aria-label={messages.commentMore} aria-haspopup="menu" aria-expanded={menu}
                onClick={() => setMenu((open) => !open)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {menu && (
                <div class={styles.menu} role="menu">
                  <button type="button" role="menuitem" class={styles.menuItem}
                    onClick={() => { setMenu(false); setDraft(card.comment); setEditing(true); }}>{messages.commentEdit}</button>
                  <button type="button" role="menuitem" class={styles.menuItem}
                    onClick={() => { setMenu(false); onDelete(); }}>{messages.commentDelete}</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
