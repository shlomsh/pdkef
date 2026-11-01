import styles from './SignToolbar.module.css';

/** `iconOnly` is Sign's `data-icon-only`, as in UndoRedoButtons: four corners is a convention and its labelled desktop row has no width to spare. Redact keeps the label. */
export default function FullscreenButton({
  isFullscreen,
  toggleFullscreen,
  label = 'Full screen',
  exitLabel = 'Exit full screen',
  iconOnly = false,
  title,
}: {
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  label?: string;
  exitLabel?: string;
  iconOnly?: boolean;
  /** The tooltip: the label by default, `null` for none (a tool row that already shows the word). */
  title?: string | null;
}) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={toggleFullscreen}
      title={title === null ? undefined : title ?? (isFullscreen ? exitLabel : label)}
      {...(iconOnly ? { 'data-icon-only': true } : {})}
    >
      {isFullscreen ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3" />
          <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      )}
      <span className={styles.label}>{isFullscreen ? exitLabel : label}</span>
    </button>
  );
}
