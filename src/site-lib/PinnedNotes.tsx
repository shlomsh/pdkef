// SEO-57: approved notes pinned on the home page and the Redact page. Renders nothing, on the server too,
// until notes arrive, so with none approved the page looks as it does without the island.
import { useEffect, useId, useState } from 'preact/hooks';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { TOOL_PAGES } from '#lib/app/toolIds.ts';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import type { RatingTool } from '#lib/telemetry/ratingSchema.ts';
import { NOTES_PATH, parseNotes, type PinnedNote } from './pinnedNote';
import styles from './PinnedNotes.module.css';

const SHOWN = 4;
const STAR_PATH = 'M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.6l6.1-.8z';

/** @testSeam */
// The notes for that tool, or all when no tool; they arrive newest first.
export function notesToShow(notes: readonly PinnedNote[], tool?: RatingTool): readonly PinnedNote[] {
  return (tool ? notes.filter((n) => n.tool === tool) : notes).slice(0, SHOWN);
}

const toolLabel = (id: string) => TOOL_PAGES.find((p) => p.id === id)?.label ?? id;

interface Props {
  tool?: RatingTool;
  heading: string;
  intro: string;
  byLine: string;
  /** In the home stack: an opaque card, so it slides over the pinned card before it. */
  card?: boolean;
}

function PinnedNotes({ tool, heading, intro, byLine, card }: Props) {
  const [notes, setNotes] = useState<readonly PinnedNote[]>([]);
  const headingId = useId();

  useEffect(() => {
    let live = true;
    fetch(NOTES_PATH)
      .then((r) => r.json())
      .then((body) => {
        if (live) setNotes(parseNotes(body));
      })
      .catch(() => {
        // expected: offline, the dev server or no function; the page simply has no notes
      });
    return () => {
      live = false;
    };
  }, []);

  const shown = notesToShow(notes, tool);
  if (shown.length === 0) return null;

  return (
    <section class={card ? `${styles.section} ${styles.card}` : styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} class={styles.heading}>{heading}</h2>
      <p class={styles.intro}>{intro}</p>
      <ul class={styles.list}>
        {shown.map((n, i) => (
          <li class={styles.note} key={i}>
            <p class={styles.comment}>{n.comment}</p>
            <svg class={styles.stars} viewBox="0 0 120 24" role="img" aria-label={`${n.stars} / 5`}>
              {[0, 1, 2, 3, 4].map((s) => (
                <path
                  key={s}
                  d={STAR_PATH}
                  transform={`translate(${s * 24} 0)`}
                  class={s < n.stars ? styles.on : styles.off}
                  stroke-width="1.2"
                  stroke-linejoin="round"
                  aria-hidden="true"
                />
              ))}
            </svg>
            <p class={styles.by}>{formatMessage(byLine, { tool: toolLabel(n.tool), place: n.place })}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default withIslandBoundary(PinnedNotes);
