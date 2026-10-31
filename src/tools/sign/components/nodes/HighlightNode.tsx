import type { HighlightElement } from '#editor/model/editorModel.ts';
import { hasComment } from '../../lib/highlight/commentNumbers.ts';
import type { ElementNodeChange, ElementNodeProps } from '../nodeProps.ts';
import { HighlightBadge, HighlightNote } from './HighlightComment.tsx';
import { useCommentNumber } from './commentNumbersContext.tsx';
import styles from './HighlightNode.module.css';

/* SIGN-42: bands are percents of the element's own box. The draft container
 * stays empty in render - the swipe gesture paints live bands into it.
 * SIGN-44: the note and badge are siblings of the multiply root, never inside it. */
export default function HighlightNode({ element, isActive, onChange, onSelect, messages }: ElementNodeProps<HighlightElement> & {
  onChange?: ElementNodeChange<HighlightElement>;
  onSelect?: (event: Event) => void;
}) {
  const number = useCommentNumber(element.id);
  return (
    <>
      <div data-highlight-root class={styles.root}>
        <div data-highlight-bands class={styles.layer}>
          {element.bands.map((band, i) => (
            <div
              key={i}
              data-highlight-band
              class={styles.band}
              style={{ left: `${band.left}%`, top: `${band.top}%`, width: `${band.width}%`, height: `${band.height}%`, background: element.color }}
            />
          ))}
        </div>
        <div data-highlight-draft class={styles.layer} />
      </div>
      {hasComment(element) && number !== undefined && (
        <HighlightBadge element={element} number={number} onSelect={onSelect} messages={messages} />
      )}
      {isActive && element.comment !== undefined && onChange && (
        <HighlightNote element={element} onChange={onChange} messages={messages} />
      )}
    </>
  );
}
