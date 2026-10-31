import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { ElementNodeProps } from '../nodeProps.ts';
import styles from './HighlightNode.module.css';

/* SIGN-42: bands are percents of the element's own box. The draft container
 * stays empty in render - the swipe gesture paints live bands into it. */
export default function HighlightNode({ element }: ElementNodeProps<HighlightElement>) {
  return (
    <div class={styles.root}>
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
  );
}
