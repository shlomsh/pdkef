import { tools } from '../data/tools.js';
import styles from './RecentFiles.module.css';
import { englishRecentFilesMessages, formatMessage, type RecentFilesMessages } from '../i18n/toolMessages';
import { getDraftExpiry } from '../lib/drafts/draftPolicy.js';
import { MAX_RECENT_FILES } from '../lib/drafts/draftStore.js';

/** Recent source documents, or the bundled practice form when the cache is empty. */
export interface RecentFileItem {
  cacheId?: string;
  tool: string;
  fileName: string;
  preview?: string;
  savedAt?: number;
  bundledSample?: boolean;
  /** Output page count, e.g. a Merge entry's planned page total
   * (draftStore's recency index). Shown as a second detail line when present. */
  pageCount?: number;
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
        {files.map((file, index) => {
          const meta = tools.find(t => t.slug === file.tool);
          if (!meta) return null;
          const isBundledSample = file.bundledSample === true;
          const notice = retentionNotice(file, index, files.length, messages);
          const savedAtLabel = notice || formatSavedAt(file.savedAt, messages);
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
              // MEM-03: every recent entry, Merge's file set included, opens
              // through the same button now - the tool it belongs to already
              // has its own work on it (draftStore.js's one memory space), so
              // there is no per-tool draft it could collide with. See
              // openRecent in FileDropzone.tsx for how a Merge row and an
              // ordinary source file each resume from here.
              <button
                type="button"
                class={styles.document}
                aria-label={formatMessage(messages.openRecentAriaLabel, { name: file.fileName })}
                disabled={busy}
                onClick={() => onOpenRecent?.(file)}
              >
                {identity}
                <span class={styles.sub}>{meta.gridTitle}</span>
                {typeof file.pageCount === 'number' && (
                  <span class={styles.sub}>
                    {file.pageCount === 1 ? messages.pageCountOne : formatMessage(messages.pageCountOther, { count: file.pageCount })}
                  </span>
                )}
                {savedAtLabel && (
                  // formatSavedAt resolves against the browser's locale, so
                  // this is often an LTR "2 days ago" on an RTL page (/he/),
                  // where the page's base direction would reorder it to
                  // "days ago 2". <bdi> defaults to dir="auto": the string
                  // keeps its own direction, and the localized "just now"
                  // fallback comes through the same wrapper.
                  <span class={styles.sub}><bdi>{savedAtLabel}</bdi></span>
                )}
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

const DAY_MS = 24 * 60 * 60 * 1000;
// 3 days: long enough to be seen and acted on before a draft's last day,
// short enough that it only ever shows for the last ~10% of the 28-day
// window - most of a draft's life this line stays the ordinary "N days ago".
const EXPIRY_WARNING_DAYS = 3;

/**
 * What to show in place of the relative "saved N days ago" line when this
 * entry is close to falling out of the recents cache - by age (about to hit
 * the 28-day limit) or by rank (the oldest of a full 6-entry list, the next
 * one a newly opened file would evict). Age wins when both apply. Returns ''
 * when neither applies, so the caller keeps the ordinary savedAtLabel.
 */
export function retentionNotice(
  file: RecentFileItem,
  index: number,
  total: number,
  messages: RecentFilesMessages,
  now: number = Date.now(),
): string {
  if (typeof file.savedAt === 'number' && Number.isFinite(file.savedAt)) {
    const daysLeft = Math.max(1, Math.ceil((getDraftExpiry(file.savedAt) - now) / DAY_MS));
    if (daysLeft <= EXPIRY_WARNING_DAYS) {
      return daysLeft === 1 ? messages.expiresInDaysOne : formatMessage(messages.expiresInDaysOther, { count: daysLeft });
    }
  }
  if (total === MAX_RECENT_FILES && index === total - 1) {
    return formatMessage(messages.oldestKeptFile, { count: total });
  }
  return '';
}
