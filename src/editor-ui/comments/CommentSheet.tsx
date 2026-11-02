import { useEffect } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { isComment, resolveCommentBoxes } from '#editor/comments/anchors.ts';
import type { CommentPatch } from '#editor/highlight/commentCommit.ts';
import { commentCards } from '#editor/highlight/commentCards.ts';
import { anchorNode } from './anchorNode.ts';
import { commentCardLabel } from './commentLabel.ts';
import { CommentCardBody } from './CommentCardBody.tsx';
import styles from './CommentSheet.module.css';

const stop = (event: Event) => event.stopPropagation();

/** SIGN-44: on a phone the active comment slides up from the bottom instead of a margin rail. */
export function CommentSheet({ elements, activeElementId, messages, onSave, onDelete, onDiscard, onClose, onReturnFocus }: {
  elements: readonly EditorElement[];
  activeElementId: string | null;
  messages: SignMessages;
  onSave: (id: string, patch: CommentPatch) => void;
  onDelete: (id: string) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
  onReturnFocus?: (id: string) => void;
}) {
  const active = resolveCommentBoxes(elements).find((el) => el.id === activeElementId && isComment(el));
  const card = active ? commentCards(elements, active.pageIndex, activeElementId).find((c) => c.id === active.id) : undefined;
  const open = !!card;
  const openId = card?.id;

  // The anchor sits above the sheet while its comment is open.
  useEffect(() => {
    if (!openId) return;
    anchorNode(elements, openId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [openId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!active || !card) return null;
  return (
    <div class={styles.sheet} data-comment-sheet dir={messages.dir}
      onClick={stop} onMouseDown={stop} onTouchStart={stop}>
      <button type="button" class={styles.grab} data-comment-sheet-grab aria-label={messages.commentCancel} onClick={onClose}>
        <span class={styles.bar} />
      </button>
      {/* Keyed by comment: its draft is local state, so a second note must not open with the first one's text. */}
      <CommentCardBody
        key={card.id}
        card={card}
        active
        messages={messages}
        label={commentCardLabel(elements, card.id, active.pageIndex, messages)}
        onSelect={() => {}}
        onSave={(patch) => onSave(card.id, patch)}
        onDelete={() => onDelete(card.id)}
        onDiscard={() => onDiscard(card.id)}
        onReturnFocus={() => onReturnFocus?.(card.id)}
      />
    </div>
  );
}
