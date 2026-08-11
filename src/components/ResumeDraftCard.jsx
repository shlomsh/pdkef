import { tools } from '../data/tools.js';
import styles from './ResumeDraftCard.module.css';

/**
 * The home page's "you left something open" card, shown above the dropzone
 * when Sign or Redact has a saved draft.
 *
 * It exists because the home page used to give no sign at all that a draft
 * existed: the dropzone said "Drop PDFs here", and the first the user heard of
 * their in-progress file was the discard confirmation *after* they had already
 * picked a replacement. Disclosure has to come before the choice, not after.
 *
 * Deliberately additive - it sits above the dropzone rather than replacing it,
 * so a first-time visitor (the overwhelming majority, and the reader the
 * dropzone's fast path was designed for) sees exactly what they saw before.
 *
 * There is no dismiss control, and that is the point: hiding the card would
 * leave the bytes in IndexedDB while implying they were gone. The card clears
 * when the draft really does - replaced or finished inside the tool, or aged
 * out at draftStore's MAX_AGE_MS.
 *
 * @param {{ drafts: Array<{ tool: string, fileName?: string, savedAt?: number,
 *   preview?: string }> }} props - already filtered to tools with a draft, and
 *   sorted by the caller.
 */
export default function ResumeDraftCard({ drafts }) {
  if (!drafts?.length) return null;

  return (
    <section class={styles.card} aria-labelledby="resume-draft-heading">
      <h2 class={styles.heading} id="resume-draft-heading">
        Pick up where you left off
      </h2>
      <ul class={styles.list}>
        {drafts.map((draft, index) => {
          const meta = tools.find((t) => t.slug === draft.tool);
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <li class={styles.row} key={draft.tool}>
              {draft.preview ? (
                <img
                  class={styles.preview}
                  src={draft.preview}
                  alt=""
                  width="48"
                  height="62"
                />
              ) : (
                // Same box, drawn empty. A draft saved before previews shipped
                // (or one whose preview lost a localStorage quota race) must
                // not make its row a different height than its neighbour's.
                <div class={styles.preview} aria-hidden="true" />
              )}

              <div class={styles.details}>
                <p class={styles.name} title={draft.fileName}>
                  {draft.fileName || 'Untitled document'}
                </p>
                <p class={styles.sub}>
                  <Icon class={styles.toolIcon} size={14} strokeWidth={1.8} aria-hidden="true" />
                  {meta.gridTitle}
                  {formatSavedAt(draft.savedAt) && (
                    <span class={styles.when}>{formatSavedAt(draft.savedAt)}</span>
                  )}
                </p>
              </div>

              {/* A plain navigation: the tool restores its own draft on mount,
                  so there is nothing to hand over. Only the first row gets the
                  filled treatment - two primary buttons side by side would
                  make the more recent draft no easier to pick out. */}
              <a
                class={index === 0 ? styles.continuePrimary : styles.continue}
                href={meta.href}
              >
                Continue
                <span class={styles.srOnly}> editing {draft.fileName || 'your document'}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * "12 minutes ago" from a timestamp, or '' if there isn't a usable one.
 * Intl.RelativeTimeFormat is native, so this costs no dependency.
 */
export function formatSavedAt(savedAt) {
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return '';
  const seconds = Math.round((savedAt - Date.now()) / 1000);
  const magnitude = Math.abs(seconds);
  if (magnitude < 60) return 'just now';

  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  try {
    const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    for (const [unit, size] of units) {
      if (magnitude >= size) return format.format(Math.round(seconds / size), unit);
    }
  } catch {
    // Intl.RelativeTimeFormat is everywhere this app runs, but a missing
    // timestamp label is not worth throwing inside a render.
  }
  return '';
}
