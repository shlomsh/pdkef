import { tools } from '../data/tools.js';
import { SAMPLE_FILE_NAME } from './sampleDocument.ts';
import styles from './ResumeDraftCard.module.css';

/** Standalone document icons from the two existing editor draft slots.
 * Navigation lets each tool restore its own draft; this view never writes it.
 */
export default function ResumeDraftCard({ drafts }: { drafts: any[] }) {
  if (!drafts?.length) return null;

  return (
    <section data-home-recents class={styles.card} aria-labelledby="resume-draft-heading">
      {/* Visually hidden, not removed. A desktop does not caption its own
          files, and on a page whose whole first screen is the workspace the
          line was labelling the obvious. The heading itself has to stay: it is
          this section's accessible name (aria-labelledby above) and its only
          landmark for a screen reader, which has no layout to infer the
          grouping from. */}
      <h2 class="sr-only" id="resume-draft-heading">Pick up where you left off</h2>
      <ul class={styles.list}>
        {drafts.map((draft: any) => {
          const meta = tools.find(t => t.slug === draft.tool);
          if (!meta) return null;
          return <li key={draft.tool}>
            <a class={styles.document} href={meta.href}
              onClick={event => {
                // Keyboard activation emits detail=0; touch opens with one tap.
                if (event.detail > 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !window.matchMedia('(pointer: coarse)').matches) event.preventDefault();
              }}
              onDblClick={() => { window.location.href = meta.href; }}>
              {draft.preview
                ? <img class={styles.preview} src={draft.preview} alt="" width="64" height="84" />
                : <svg class={styles.preview} viewBox="0 0 64 84" aria-hidden="true"><path d="M8 2h32l16 16v64H8zM40 2v18h16" fill="var(--color-surface)" stroke="var(--color-border-strong)"/><text x="32" y="54" text-anchor="middle" fill="var(--color-primary)" font-size="14">PDF</text></svg>}
              <span class={styles.name} title={draft.fileName || undefined}>{draft.fileName || 'Untitled document'}</span>
              <span class={styles.sub}>{meta.gridTitle}</span>
              {draft.fileName === SAMPLE_FILE_NAME && <span class={styles.sub}>Bundled sample</span>}
            </a>
          </li>;
        })}
      </ul>
      <p class={styles.hint}>Double-click to open · Enter on keyboard</p>
    </section>
  );
}

/**
 * "12 minutes ago" from a timestamp, or '' if there isn't a usable one.
 * Intl.RelativeTimeFormat is native, so this costs no dependency.
 */
export function formatSavedAt(savedAt: number) {
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return '';
  const seconds = Math.round((savedAt - Date.now()) / 1000);
  const magnitude = Math.abs(seconds);
  if (magnitude < 60) return 'just now';

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
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
