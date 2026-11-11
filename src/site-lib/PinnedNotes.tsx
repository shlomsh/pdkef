// SEO-57: approved notes pinned beside the rating (RatingBoard.astro). The notes are read once at build and
// arrive as props, so they are in the page's HTML and nothing is fetched. With none the board is the stars
// alone. Most notes are a vote with no words.
import { formatMessage } from '#lib/text/formatMessage.ts';
import { TOOL_PAGES } from '#lib/app/toolIds.ts';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import type { PinnedNote } from './pinnedNote';
import styles from './PinnedNotes.module.css';

const STAR_PATH = 'M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.6l6.1-.8z';

const toolLabel = (id: string) => TOOL_PAGES.find((p) => p.id === id)?.label ?? id;

const countryName = (code: string, locale: string) => {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    // expected: a code or locale this browser cannot name reads as the code
    return code;
  }
};

const placeOf = (n: PinnedNote, locale: string) =>
  [n.region, countryName(n.country ?? '', locale)].filter(Boolean).join(', ');

interface Props {
  /** Already the notes for this page's tool, newest first. */
  notes: readonly PinnedNote[];
  byLine: string;
  locale?: string;
}

function PinnedNotes({ notes, byLine, locale = 'en' }: Props) {
  if (notes.length === 0) return null;
  const [before, after = ''] = byLine.split('{place}');

  return (
    <ul class={styles.list}>
      {notes.map((n, i) => (
        <li class={styles.note} key={i}>
          {n.comment && <p class={styles.comment}>{n.comment}</p>}
          <div class={styles.foot}>
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
            <p class={n.comment ? styles.by : styles.byHand}>
              {formatMessage(before, { tool: toolLabel(n.tool) })}
              <span class={styles.where}>
                {n.country && (
                  <img
                    class={styles.flag}
                    src={`/flags/${n.country}.svg`}
                    alt=""
                    width="36"
                    height="24"
                    loading="lazy"
                    onError={(e) => e.currentTarget.remove()}
                  />
                )}
                {n.place ?? placeOf(n, locale)}
              </span>
              {formatMessage(after, { tool: toolLabel(n.tool) })}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default withIslandBoundary(PinnedNotes);
