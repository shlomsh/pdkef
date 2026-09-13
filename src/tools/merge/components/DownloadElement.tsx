import { useEffect, useRef } from 'preact/hooks';
import styles from './DownloadElement.module.css';
import { formatMessage, type MergeMessages } from '../../../i18n/toolMessages';

export type DownloadElementState = 'one-file' | 'preparing' | 'ready' | 'saved' | 'error';

export interface DownloadElementProps {
  state: DownloadElementState;
  href?: string | null;
  fileName?: string;
  /** "18 pages · 9.6 MB", already localized by the parent. */
  detail?: string;
  /** How many cells still need a thumbnail, and out of how many - includes
   * skipped pages, which still render. */
  renderedCount?: number;
  totalCount?: number;
  /** PART 2 (browser check): the "Preparing N pages…" label counts the
   * merge OUTPUT (skipped pages excluded), same as the document heading -
   * never `totalCount`, which is the render-progress total. */
  pagesToMerge?: number;
  progress?: number;
  errorMessage?: string;
  messages: MergeMessages;
  /** BasePdfTool's shared "Choose files" picker label (ShellMessages'
   * `chooseFilesMany`, the same word every tool's own Add/Choose files
   * control uses) - the one-file state's real nested button, never the
   * MergeMessages catalogue, which has no shell-level string of its own. */
  chooseFilesLabel?: string;
  onChooseFiles?: () => void;
  onPreparingTap?: () => void;
  onDownloadClick?: (event: MouseEvent) => void;
}

/**
 * MERGE-18: one element, four states, same size and place. A Playwright
 * guard asserts the SAME node across preparing -> ready, so this never
 * conditionally renders a different component per state - one <a>, content
 * swapped inside it, `href` present only once a blob exists to download.
 *
 * The check-draw animation and the first-ready focus both fire only on this
 * component's very first transition into 'ready', tracked in refs that live
 * for the component's whole mount (unaffected by prop changes), so a
 * re-prepare after an edit swaps the label without replaying either.
 */
export default function DownloadElement({
  state,
  href = null,
  fileName = '',
  detail,
  renderedCount = 0,
  totalCount = 0,
  pagesToMerge = 0,
  progress = 0,
  errorMessage,
  messages: t,
  chooseFilesLabel,
  onChooseFiles,
  onPreparingTap,
  onDownloadClick,
}: DownloadElementProps) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  const hasBeenReadyRef = useRef(false);
  const hasFocusedRef = useRef(false);
  const isFirstReady = state === 'ready' && !hasBeenReadyRef.current;

  useEffect(() => {
    if (state === 'ready') hasBeenReadyRef.current = true;
  }, [state]);

  useEffect(() => {
    if (state === 'ready' && !hasFocusedRef.current) {
      hasFocusedRef.current = true;
      ref.current?.focus({ preventScroll: true });
    }
  }, [state]);

  const isLink = (state === 'ready' || state === 'saved') && !!href;
  // One-file: the box itself is a plain surface, never a button in its own
  // right (no role, no tabIndex, never aria-disabled) - the nested "Choose
  // files" button below is the only control, so a click on the box outside
  // that button does nothing.
  const isPlainSurface = state === 'one-file';

  const onClick = (event: MouseEvent) => {
    if (isPlainSurface) {
      return;
    } else if (state === 'preparing') {
      event.preventDefault();
      onPreparingTap?.();
    } else if (state === 'error') {
      event.preventDefault();
    } else {
      // ready / saved: the browser's own anchor download happens through
      // `href`/`download`; the tool only observes the tap.
      onDownloadClick?.(event);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isLink) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      (event.currentTarget as HTMLElement).click();
    }
  };

  return (
    <a
      ref={ref}
      class={styles.box}
      data-state={state}
      href={isLink ? href ?? undefined : undefined}
      download={isLink ? fileName : undefined}
      role={isLink || isPlainSurface ? undefined : 'button'}
      tabIndex={isLink || isPlainSurface ? undefined : 0}
      aria-busy={state === 'preparing' || undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {state === 'one-file' && (
        <>
          <span class={styles.label}>{t.addOneMore}</span>
          <button
            type="button"
            class={styles['choose-button']}
            onClick={(event) => { event.stopPropagation(); onChooseFiles?.(); }}
          >
            {chooseFilesLabel}
          </button>
        </>
      )}

      {state === 'preparing' && (
        <>
          <span class={styles.row}>
            <svg class={styles.spinner} width="20" height="20" viewBox="0 0 40 40" aria-hidden="true">
              <circle class={styles['spinner-track']} cx="20" cy="20" r="16" />
              <circle
                class={styles['spinner-fill']}
                cx="20"
                cy="20"
                r="16"
                stroke-dasharray={2 * Math.PI * 16}
                stroke-dashoffset={2 * Math.PI * 16 - progress * 2 * Math.PI * 16}
              />
            </svg>
            <span class={styles.label}>{formatMessage(t.preparingPages, { count: pagesToMerge })}</span>
          </span>
          <span class={styles.detail}>{formatMessage(t.renderProgress, { done: renderedCount, total: totalCount })}</span>
        </>
      )}

      {state === 'ready' && (
        <span class={styles.column}>
          <span class={styles.label}>
            <svg class={styles.check} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" class={styles['check-circle']} />
              <path
                d="M7.5 12.5l3 3 6-6.5"
                class={isFirstReady ? styles['check-mark-animated'] : styles['check-mark-static']}
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
            {t.downloadLabel}
          </span>
          {detail && <span class={styles.detail}>{detail}</span>}
        </span>
      )}

      {state === 'saved' && (
        <span class={styles.column}>
          <span class={styles.label}>{t.savedLabel}</span>
          {/* MERGE-11 (2026-09-13, Shlomi): the output name has one home now,
              the document heading - this element states only "N pages · size",
              same as the 'ready' state, never the file name a second time. */}
          <span class={styles.detail}>
            {detail} · <span class={styles['inline-link']}>{t.downloadAgain}</span>
          </span>
        </span>
      )}

      {state === 'error' && (
        <span class={styles.label}>{errorMessage || t.fixFileToMerge}</span>
      )}
    </a>
  );
}
