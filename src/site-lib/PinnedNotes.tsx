// SEO-57: approved notes pinned beside the rating (RatingBoard.astro). The notes are read once at build and
// arrive as props, so they are in the page's HTML and nothing is fetched. With none the board is the stars
// alone. Most notes are a vote with no words.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
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

const dateOf = (day: string, locale: string) => {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${day}T00:00:00Z`));
  } catch {
    // expected: a locale this browser cannot format reads as the stored day
    return day;
  }
};

const placeOf = (n: PinnedNote, locale: string) =>
  [n.region, countryName(n.country ?? '', locale)].filter(Boolean).join(', ');

interface Props {
  /** Already the notes for this page's tool, newest first. */
  notes: readonly PinnedNote[];
  byLine: string;
  /** The fold's button, closed and open. */
  more: string;
  less: string;
  locale?: string;
  /** The country codes the flag sprite carries; a note from any other shows no flag. */
  flags?: readonly string[];
  /** Where the sprite is served (`/flags/notes-<hash>.svg`, MEM-42); without one no flag is drawn. */
  spriteUrl?: string;
}

interface NoteProps {
  note: PinnedNote;
  byLine: string;
  more: string;
  less: string;
  locale: string;
  flags: readonly string[];
  spriteUrl?: string;
  open: boolean;
  onToggle: () => void;
}

/** One paper. Words that do not fit are folded; then the whole paper is a button that lifts it over the board, larger. */
function Note({ note: n, byLine, more, less, locale, flags, spriteUrl, open, onToggle }: NoteProps) {
  const words = useRef<HTMLParagraphElement>(null);
  const [folds, setFolds] = useState(false);
  useLayoutEffect(() => {
    const el = words.current;
    if (!el || open) return;
    const measure = () => setFolds(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);
  const [before, after = ''] = byLine.split('{place}');
  const classes = [styles.note, n.comment ? styles.worded : '', folds ? styles.folds : '', open ? styles.open : ''].filter(Boolean).join(' ');
  return (
    <li class={classes}>
      {n.comment && (
        <p ref={words} class={open ? styles.comment : `${styles.comment} ${styles.folded}`}>
          {n.comment}
        </p>
      )}
      <div class={styles.foot}>
        <div class={styles.rate}>
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
          {n.day && (
            <time class={styles.when} dateTime={n.day}>
              {dateOf(n.day, locale)}
            </time>
          )}
        </div>
        <p class={styles.by}>
          {formatMessage(before, { tool: toolLabel(n.tool) })}
          <span class={styles.where}>
            {spriteUrl && n.country && flags.includes(n.country) && (
              <img
                class={styles.flag}
                src={`${spriteUrl}#${n.country}`}
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
      {folds && <button type="button" class={styles.cover} aria-expanded={open} aria-label={open ? less : more} onClick={onToggle} />}
    </li>
  );
}

function PinnedNotes({ notes, byLine, more, less, locale = 'en', flags = [], spriteUrl }: Props) {
  const [openAt, setOpenAt] = useState(-1);
  const list = useRef<HTMLUListElement>(null);
  // One note open at a time; Escape or a press anywhere off it puts it back.
  useEffect(() => {
    if (openAt < 0) return;
    const close = () => setOpenAt(-1);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onPress = (e: PointerEvent) => {
      const opened = list.current?.children[openAt];
      if (!opened?.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [openAt]);
  if (notes.length === 0) return null;
  return (
    <ul ref={list} class={openAt < 0 ? styles.list : `${styles.list} ${styles.lifted}`}>
      {notes.map((n, i) => (
        <Note
          key={i}
          note={n}
          byLine={byLine}
          more={more}
          less={less}
          locale={locale}
          flags={flags}
          spriteUrl={spriteUrl}
          open={openAt === i}
          onToggle={() => setOpenAt(openAt === i ? -1 : i)}
        />
      ))}
    </ul>
  );
}

export default withIslandBoundary(PinnedNotes);
