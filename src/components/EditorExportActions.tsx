import styles from './SignTool/SignToolbar.module.css';
import workspaceStyles from './SignTool/Workspace.module.css';
import pdfToolStyles from './PdfTool.module.css';

// The two export surfaces every editor tool has - the sticky toolbar's own
// Download/Share pair, and the always-present pair below the document - drawn
// from one contract so Sign and Redact cannot drift on button order, icons,
// ready-state handling, or the responsive assumption that makes the toolbar
// pair safe to compress on a phone: the completion pair below the document
// never hides either control, so it is always the reliable way to finish,
// even where the sticky toolbar drops Download for space (see the
// `.desktop-download` rule in SignToolbar.module.css, reused unmodified here).
//
// PDF generation stays out of this component on purpose (CLAUDE.md's styling
// boundary and ARCH §3.2): Sign calls its signing exporter, Redact calls
// applyPageEdits, and neither's generation logic belongs in a shared visual
// component. This component only ever receives already-decided callbacks.
export type EditorExportVariant = 'toolbar' | 'completion';

export interface EditorExportActionsProps {
  variant: EditorExportVariant;
  /** Whether the browser can accept a native Share sheet for a PDF file at all. */
  canShare: boolean;
  /** Whether a file is already prepared and Share can fire immediately. */
  shareReady: boolean;
  /** True while exporting, or while nothing exists yet to export - guards both
   * controls against re-entry and against a no-op export. */
  disabled: boolean;
  onDownload: () => void;
  /** Generates the file and readies it for Share; called when Share is tapped
   * before a prepared file exists. */
  onPrepareShare: () => void;
  /** Opens the native share sheet on an already-prepared file. */
  onShare: () => void;
  /** Tool-specific tooltip/title text - what each control means right now,
   * including any blocked-export explanation. Omit to render no title. */
  downloadTitle?: string;
  shareTitle?: string;
  /** id of a readiness notice both controls point screen readers at while
   * export is blocked. Sign wires this to ExportReadinessNotice; Redact has
   * no such notice and leaves it undefined. */
  describedBy?: string;
}

function ShareReadyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
    </svg>
  );
}

function SharePendingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function EditorExportActions({
  variant,
  canShare,
  shareReady,
  disabled,
  onDownload,
  onPrepareShare,
  onShare,
  downloadTitle,
  shareTitle,
  describedBy,
}: EditorExportActionsProps) {
  const isToolbar = variant === 'toolbar';

  // Label stays "Share" in both states (MOBI-07): the icon carries ready-vs-
  // pending instead, so the button's own min-content width never changes and
  // reflows nothing around it every time an export finishes.
  const shareButton = canShare && (
    <button
      type="button"
      className={isToolbar
        ? `${styles.button} ${styles.share}`
        : `${pdfToolStyles['tool-primary-action']} ${workspaceStyles['export-action']} ${workspaceStyles['export-share']}`}
      onClick={shareReady ? onShare : onPrepareShare}
      disabled={disabled}
      title={shareTitle}
      aria-describedby={describedBy}
    >
      {shareReady ? <ShareReadyIcon /> : <SharePendingIcon />}
      {isToolbar ? <span className={styles.label}>Share</span> : 'Share'}
    </button>
  );

  // The toolbar's Download carries `.desktop-download`, hidden below 920px
  // (only once Share exists to take its place) - the one intentional gap
  // between the two surfaces. It never carries that class in the completion
  // row, which is why that pair is the reliable way to finish on a phone.
  const downloadButton = (
    <button
      type="button"
      className={isToolbar
        ? `${styles.button} ${styles.download}${canShare ? ` ${styles['desktop-download']}` : ''}`
        : `${pdfToolStyles['tool-primary-action']} ${workspaceStyles['export-action']}`}
      onClick={onDownload}
      disabled={disabled}
      title={downloadTitle}
      aria-describedby={describedBy}
    >
      {isToolbar && <DownloadIcon />}
      {isToolbar ? <span className={styles.label}>Download</span> : 'Download'}
    </button>
  );

  if (isToolbar) {
    // Rendered unwrapped, as a Fragment: both controls stay direct children of
    // `.toolbar`, exactly like every other button (see ViewControl.tsx for the
    // same reasoning). A wrapping element here would count as one child instead
    // of two for the module's `:has(> :nth-child(N of :not(.desktop-download)))`
    // responsive math, and silently mis-measure every wrap threshold it drives.
    return <>{shareButton}{downloadButton}</>;
  }

  return (
    <div className={workspaceStyles['export-actions']}>
      {downloadButton}
      {shareButton}
    </div>
  );
}
