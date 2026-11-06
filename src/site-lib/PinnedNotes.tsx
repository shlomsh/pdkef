// SEO-57: approved notes pinned beside the rating (RatingBoard.astro). Renders nothing, on the server too,
// until notes arrive, so with none the board is the stars alone. Most notes are a vote with no words.
import { useEffect, useState } from 'preact/hooks';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { TOOL_PAGES } from '#lib/app/toolIds.ts';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import type { RatingTool } from '#lib/telemetry/ratingSchema.ts';
import { NOTES_PATH, NOTES_PER_TOOL, parseNotes, type PinnedNote } from './pinnedNote';
import styles from './PinnedNotes.module.css';

const STAR_PATH = 'M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.6l6.1-.8z';

/** @testSeam */
// The notes for that tool, or all when no tool; they arrive newest first.
export function notesToShow(notes: readonly PinnedNote[], tool?: RatingTool): readonly PinnedNote[] {
  return (tool ? notes.filter((n) => n.tool === tool) : notes).slice(0, NOTES_PER_TOOL);
}

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
  tool?: RatingTool;
  byLine: string;
  locale?: string;
}

function PinnedNotes({ tool, byLine, locale = 'en' }: Props) {
  const [notes, setNotes] = useState<readonly PinnedNote[]>([]);

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
  const [before, after = ''] = byLine.split('{place}');

  return (
    <ul class={styles.list}>
      {shown.map((n, i) => (
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
