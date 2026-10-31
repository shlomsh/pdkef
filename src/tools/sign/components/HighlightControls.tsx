import { CommentIcon } from '#editor-ui/toolIcons.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import styles from '#editor-ui/EditorControls.module.css';
import { PAGE_HEIGHT_DEFAULT_PTS } from '#editor/model/signGeometry.js';
import { flipChanges } from '../lib/highlight/flip.ts';
import { createSwipeReader } from '../lib/highlight/swipeReader.ts';
import HighlightSwatches from './HighlightSwatches.tsx';
import DirectionButton from './DirectionButton.tsx';

type HighlightChanges = { color?: string; comment?: string; direction?: 'ltr' | 'rtl' } & Partial<Pick<HighlightElement, 'left' | 'top' | 'width' | 'height' | 'bands'>>;

/** SIGN-44: a selected highlight's toolbar group: colors, the Comment button, then the reading direction. */
export default function HighlightControls({ element, onChange, t }: { element: HighlightElement; onChange: (changes: HighlightChanges) => void; t: SignMessages }) {
  const open = element.comment !== undefined;
  const toggle = () => {
    if (element.comment === undefined) onChange({ comment: '' });
    else if (!element.comment.trim()) onChange({ comment: undefined });
    else document.querySelector<HTMLTextAreaElement>('[data-highlight-note-input]')?.focus();
  };
  const direction = element.direction ?? 'ltr';
  // The page's own pixels give the new first and last rows, so the canvas is found from the highlight's node.
  const flip = () => {
    const node = document.querySelector(`[data-editor-element-id="${CSS.escape(element.id)}"]`);
    const canvas = node?.closest('[data-page-wrapper]')?.querySelector<HTMLCanvasElement>('canvas') ?? null;
    const reader = createSwipeReader(canvas, PAGE_HEIGHT_DEFAULT_PTS, direction === 'rtl' ? 'ltr' : 'rtl');
    onChange(flipChanges(element, reader ? (a, b) => reader.bandsBetween(a, b) : undefined));
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
      <DirectionButton direction={direction} onFlip={flip} t={t} className={styles['element-button']} />
      <div className={styles.divider} />
    </>
  );
}
