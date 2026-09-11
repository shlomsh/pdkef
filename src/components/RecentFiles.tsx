import { tools } from '../data/tools.js';
import styles from './RecentFiles.module.css';
import { englishRecentFilesMessages, formatMessage, type RecentFilesMessages } from '../i18n/toolMessages';

/** Recent source documents, or the bundled practice form when the cache is empty. */
export interface RecentFileItem {
  cacheId?: string;
  tool: string;
  fileName: string;
  preview?: string;
  savedAt?: number;
  bundledSample?: boolean;
}

export default function RecentFiles({
  files,
  onOpenSample,
  onOpenRecent,
  busy = false,
  messages = englishRecentFilesMessages,
}: {
  files: RecentFileItem[];
  onOpenSample?: () => void;
  onOpenRecent?: (file: RecentFileItem) => void;
  busy?: boolean;
  messages?: RecentFilesMessages;
}) {
  if (!files.length) return null;

  return (
    <section data-home-recents class={styles.card} aria-labelledby="recent-files-heading">
      <h2 class="sr-only" id="recent-files-heading">{messages.heading}</h2>
      <ul class={styles.list}>
        {files.map((file) => {
          const meta = tools.find(t => t.slug === file.tool);
          if (!meta) return null;
          const isBundledSample = file.bundledSample === true;
          const savedAtLabel = formatSavedAt(file.savedAt, messages);
          const preview = file.preview
            ? <img
                class={styles.preview}
                src={file.preview}
                alt=""
                width="64"
                height="84"
              />
            : <svg class={styles.preview} viewBox="0 0 64 84" aria-hidden="true"><path d="M8 2h32l16 16v64H8zM40 2v18h16" fill="var(--color-surface)" stroke="var(--color-border-strong)"/><text x="32" y="54" text-anchor="middle" fill="var(--color-primary)" font-size="14">PDF</text></svg>;
          const identity = <>
            {preview}
            <span class={styles.name} title={file.fileName}>{file.fileName}</span>
          </>;
          return <li key={file.cacheId || `${file.tool}:${file.fileName}`}>
            {isBundledSample ? (
              <button
                type="button"
                class={styles.document}
                aria-label={formatMessage(messages.openSampleAriaLabel, { name: file.fileName })}
                disabled={busy}
                onClick={onOpenSample}
              >
                {identity}
                <span class={styles.sub}>{meta.gridTitle}</span>
              </button>
            ) : (
              <button
                type="button"
                class={styles.document}
                aria-label={formatMessage(messages.openRecentAriaLabel, { name: file.fileName })}
                disabled={busy}
                onClick={() => onOpenRecent?.(file)}
              >
                {identity}
                <span class={styles.sub}>{meta.gridTitle}</span>
                {savedAtLabel && <span class={styles.sub}>{savedAtLabel}</span>}
              </button>
            )}
          </li>;
        })}
      </ul>
    </section>
  );
}

/**
 * "12 minutes ago" from a timestamp, or '' if there isn't a usable one.
 * Intl.RelativeTimeFormat is native, so this costs no dependency, and it
 * resolves "N minutes/hours/days ago" against the *browser's own* locale
 * (the `undefined` locale argument) rather than the page's content locale on
 * purpose - see RecentFilesMessages' header comment. Only the "just now"
 * fallback below 60 seconds is a literal string this module owns, so it is
 * the one piece `messages` overrides.
 */
export function formatSavedAt(savedAt: number | undefined, messages: RecentFilesMessages = englishRecentFilesMessages) {
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return '';
  const seconds = Math.round((savedAt - Date.now()) / 1000);
  const magnitude = Math.abs(seconds);
  if (magnitude < 60) return messages.justNow;

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
