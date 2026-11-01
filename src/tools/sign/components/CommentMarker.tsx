import { formatMessage } from '#lib/text/formatMessage.ts';
import { CommentIcon } from '#editor-ui/toolIcons.tsx';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { CommentMarker as Marker } from '#editor/comments/anchors.ts';
import styles from './CommentMarker.module.css';

const stop = (event: Event) => event.stopPropagation();

/** SIGN-44: the comment bubble beside a passage or element (percent of the node's box), the same mark a pin
 * wears; it sits past the anchor in reading order. A click selects the comment. */
export function CommentMarker({ at, number, focused, onSelect, messages }: {
  at: Marker;
  number?: number;
  focused?: boolean;
  onSelect?: (event: Event) => void;
  messages?: Partial<SignMessages>;
}) {
  const t = { ...englishSignMessages, ...messages };
  return (
    <button
      type="button"
      data-comment-marker
      class={styles.marker}
      data-side={at.direction === 'rtl' ? 'end' : 'start'}
      data-focused={focused ? '' : undefined}
      style={{ left: `${at.left}%`, top: `${at.top}%` }}
      aria-label={number === undefined ? t.highlightCommentLabel : formatMessage(t.highlightCommentNumberLabel, { number })}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={(event) => { event.stopPropagation(); onSelect?.(event); }}
    >
      <CommentIcon size={12} />
    </button>
  );
}
