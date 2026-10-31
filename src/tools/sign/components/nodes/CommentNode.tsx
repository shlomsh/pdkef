import type { CommentElement } from '#editor/model/editorModel.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishSignMessages } from '../../messages';
import { CommentIcon } from '#editor-ui/toolIcons.tsx';
import type { ElementNodeProps } from '../nodeProps.ts';
import { CommentMarker } from './HighlightComment.tsx';
import { useCommentMarker, useCommentNumber } from './commentNumbersContext.tsx';
import styles from './CommentNode.module.css';

/* A comment on the page. A passage shows its bands in the comment tint; the draft layer is where the
 * Comment tool's swipe paints live bands, so every non-element comment carries one. A pin is a marker.
 * An element comment (its box is its target's, resolved upstream) shows only its marker, so the target
 * stays clickable; its marker is the pin's bubble, placed by commentMarkers. A passage is its tint alone,
 * as in Google Docs. */
export default function CommentNode({ element, isActive, onSelect, messages }: ElementNodeProps<CommentElement> & {
  onSelect?: (event: Event) => void;
}) {
  const number = useCommentNumber(element.id);
  const at = useCommentMarker(element.id);
  const { anchor } = element;
  const marker = at && <CommentMarker at={at} number={number} focused={isActive} onSelect={onSelect} messages={messages} />;
  if (anchor.kind === 'element') return <div data-comment-overlay class={styles.overlay}>{marker}</div>;
  const t = { ...englishSignMessages, ...messages };
  const bands = anchor.kind === 'passage' ? anchor.bands : [];
  return (
    <>
      <div data-comment-root class={styles.root}>
        <div data-highlight-bands class={styles.layer} data-focused={isActive ? '' : undefined}>
          {bands.map((band, i) => (
            <div
              key={i}
              data-highlight-band
              class={styles.band}
              style={{ left: `${band.left}%`, top: `${band.top}%`, width: `${band.width}%`, height: `${band.height}%` }}
            />
          ))}
        </div>
        <div data-highlight-draft class={styles.draft} />
      </div>
      {anchor.kind === 'point' && (
        <span
          data-comment-pin
          class={styles.pin}
          data-focused={isActive ? '' : undefined}
          role="img"
          aria-label={number === undefined ? t.highlightCommentLabel : formatMessage(t.highlightCommentNumberLabel, { number })}
        >
          <CommentIcon size={12} />
        </span>
      )}
    </>
  );
}
