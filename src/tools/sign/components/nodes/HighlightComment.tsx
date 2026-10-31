import type { HighlightElement } from '#editor/model/editorModel.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishSignMessages } from '../../messages';
import type { SignMessages } from '#editor/registry/messages.ts';
import { passageEnd } from '../../lib/highlight/commentCards.ts';
import styles from './HighlightComment.module.css';

const stop = (event: Event) => event.stopPropagation();

/** SIGN-44: the small dot just past a commented passage's end; a click selects the highlight. */
export function HighlightDot({ element, number, onSelect, messages }: {
  element: HighlightElement;
  number?: number;
  onSelect?: (event: Event) => void;
  messages?: Partial<SignMessages>;
}) {
  const t = { ...englishSignMessages, ...messages };
  const end = passageEnd(element);
  // passageEnd is page percent; the node renders inside the element's own box.
  const left = ((end.x - element.left) / element.width) * 100;
  const top = ((end.y - element.top) / element.height) * 100;
  return (
    <button
      type="button"
      data-highlight-badge
      data-highlight-dot
      class={styles.dot}
      data-side={element.direction === 'rtl' ? 'end' : 'start'}
      style={{ left: `${left}%`, top: `${top}%` }}
      aria-label={number === undefined ? t.highlightCommentLabel : formatMessage(t.highlightCommentNumberLabel, { number })}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={(event) => { event.stopPropagation(); onSelect?.(event); }}
    />
  );
}
