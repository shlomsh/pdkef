import { useEffect } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { commentCards } from '../../lib/highlight/commentCards.ts';
import { CommentCardBody } from './CommentCardBody.tsx';
import { PassageCrop } from './PassageCrop.tsx';
import styles from './CommentSheet.module.css';

const stop = (event: Event) => event.stopPropagation();

/** SIGN-44: on a phone the active highlight's comment slides up from the bottom instead of a margin rail. */
export function CommentSheet({ elements, activeElementId, messages, onChange, onClose }: {
  elements: readonly EditorElement[];
  activeElementId: string | null;
  messages: SignMessages;
  onChange: (id: string, patch: { comment: string | undefined }) => void;
  onClose: () => void;
}) {
  const active = elements.find((el) => el.id === activeElementId && el.type === 'highlight');
  const card = active ? commentCards(elements, active.pageIndex, activeElementId).find((c) => c.id === active.id) : undefined;
  const open = !!card;

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
      <CommentCardBody
        card={card}
        active
        pageNumber={active.pageIndex + 1}
        messages={messages}
        crop={<PassageCrop pageIndex={active.pageIndex} band={card.firstBand} direction={card.direction} />}
        onSelect={() => {}}
        onChange={(patch) => onChange(card.id, patch)}
      />
    </div>
  );
}
