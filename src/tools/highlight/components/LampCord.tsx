import { useEffect, useRef, useState } from 'preact/hooks';
import { useCordTuck } from '../hooks/useCordTuck.ts';
import { englishHighlightMessages } from '../messages.ts';
import styles from './LampCord.module.css';

/**
 * Full screen as the Reading lamp's pull cord: it hangs from the editor card's bottom edge at the column centre, right
 * under where the capsule appears. A real button named "Full screen"; the bead is the whole 44 px target. The
 * `data-lamp-part` nodes are the ones the entrance and exit animate (lib/lampEntrance); the sway and the drop-in are CSS.
 * Once the page scrolls the cord tucks up into the card, leaving only the bead's tip; a click on the tip pops it back,
 * and the next one goes full screen (a keyboard focus pops it, so one press does).
 */
export default function LampCord({ onPull, labels = englishHighlightMessages.cord }: { onPull(): void; labels?: typeof englishHighlightMessages.cord }) {
  // The drop-in plays once, on the first mount: the lamp hides this cord with display:none, and a CSS animation would replay on every showing.
  const [intro, setIntro] = useState(true);
  const drop = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const { tucked, pop } = useCordTuck(root);
  useEffect(() => {
    const el = drop.current;
    if (!el) return;
    const done = () => setIntro(false);
    el.addEventListener('animationend', done, { once: true });
    return () => el.removeEventListener('animationend', done);
  }, []);
  return (
    <div class={styles.cord} ref={root} data-lamp-part="cord" data-intro={intro ? '' : undefined} data-tucked={tucked ? '' : undefined}>
      <div class={styles.drop} ref={drop}>
        <div class={styles.settle} data-lamp-part="settle">
          <div class={styles.tuck}>
            <div class={styles.swing}>
              <span class={styles.line} data-lamp-part="line" aria-hidden="true">
                <span class={styles.string} />
                <span class={styles.crimp} />
              </span>
              <button type="button" class={styles.pull} data-lamp-part="pull" aria-label={labels.label} onClick={() => (tucked ? pop() : onPull())} onFocus={(e) => { if (tucked && e.currentTarget.matches(':focus-visible')) pop(); }}>
                <span class={styles.bead} data-lamp-bead />
                <span class={styles.tag} data-lamp-part="tag" aria-hidden="true">
                  {labels.label}<em class={styles.hint}>{` · ${labels.hint}`}</em>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
