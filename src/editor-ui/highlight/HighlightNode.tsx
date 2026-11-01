import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { ElementNodeChange, ElementNodeProps } from '../nodeProps.ts';
import { underlineInk } from '#editor/model/underlineInk.ts';
import styles from './HighlightNode.module.css';

/* SIGN-46: bands are percents of the element's own box. The draft container
 * stays empty in render - the swipe gesture paints live bands into it.
 * Comments are their own elements now (CommentNode), so a highlight draws no dot. */
export default function HighlightNode({ element, isActive }: ElementNodeProps<HighlightElement> & {
  onChange?: ElementNodeChange<HighlightElement>;
  onSelect?: (event: Event) => void;
}) {
  const underline = element.style === 'underline';
  const ink = underline ? underlineInk(element.color) : undefined;
  return (
    <div data-highlight-root class={styles.root}>
      <div data-highlight-bands class={styles.layer} data-focused={isActive ? '' : undefined} style={element.opacity === undefined ? undefined : { opacity: element.opacity }}>
        {element.bands.map((band, i) => (
          <div
            key={i}
            data-highlight-band
            data-highlight-underline={underline ? '' : undefined}
            class={underline ? `${styles.band} ${styles.underline}` : styles.band}
            style={{
              left: `${band.left}%`, top: `${band.top}%`, width: `${band.width}%`, height: `${band.height}%`,
              ...(underline ? { '--highlight-ink': ink } : { background: element.color }),
            }}
          />
        ))}
      </div>
      <div data-highlight-draft class={styles.layer} />
    </div>
  );
}
