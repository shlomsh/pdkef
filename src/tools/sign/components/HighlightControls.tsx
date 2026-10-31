import { CommentIcon } from '#editor-ui/toolIcons.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import styles from '#editor-ui/EditorControls.module.css';
import HighlightSwatches from './HighlightSwatches.tsx';

/** SIGN-44: a selected highlight's toolbar group: colors, then the Comment button. */
export default function HighlightControls({ element, onChange, t }: { element: HighlightElement; onChange: (changes: { color?: string; comment?: string }) => void; t: SignMessages }) {
  const open = element.comment !== undefined;
  const toggle = () => {
    if (element.comment === undefined) onChange({ comment: '' });
    else if (!element.comment.trim()) onChange({ comment: undefined });
    else document.querySelector<HTMLTextAreaElement>('[data-highlight-note-input]')?.focus();
  };
  return (
    <>
      <HighlightSwatches color={element.color} onChange={onChange} t={t} />
      <button
        type="button"
        data-highlight-comment-button
        className={`${styles['element-button']}${open ? ` ${styles.active}` : ''}`}
        aria-label={t.highlightCommentLabel}
        aria-pressed={open}
        title={t.highlightCommentLabel}
        onClick={toggle}
      >
        <CommentIcon size={16} />
      </button>
      <div className={styles.divider} />
    </>
  );
}
