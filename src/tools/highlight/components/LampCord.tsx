import { englishHighlightMessages } from '../messages.ts';
import styles from './LampCord.module.css';

/**
 * Full screen as the Reading lamp's pull cord: it hangs from the editor card's bottom edge at the column centre, right
 * under where the capsule appears. A real button named "Full screen"; the bead is the whole 44 px target. The
 * `data-lamp-part` nodes are the ones the entrance and exit animate (lib/lampEntrance); the sway and the drop-in are CSS.
 */
export default function LampCord({ onPull, labels = englishHighlightMessages.cord }: { onPull(): void; labels?: typeof englishHighlightMessages.cord }) {
  return (
    <div class={styles.cord} data-lamp-part="cord">
      <div class={styles.drop}>
        <div class={styles.settle} data-lamp-part="settle">
          <div class={styles.swing}>
            <span class={styles.line} data-lamp-part="line" aria-hidden="true">
              <span class={styles.string} />
              <span class={styles.crimp} />
            </span>
            <button type="button" class={styles.pull} data-lamp-part="pull" aria-label={labels.label} onClick={onPull}>
              <span class={styles.bead} data-lamp-bead />
            </button>
            <span class={styles.tag} data-lamp-part="tag" aria-hidden="true">
              {labels.label}<em class={styles.hint}>{` · ${labels.hint}`}</em>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
