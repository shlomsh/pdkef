import ViewControl from './ViewControl.jsx';
import EditorToolStatus from './EditorToolStatus.jsx';
import ToolShell, { FILE_ACTIONS, useToolShell } from './ToolShell.jsx';
import { makeArmTool } from '../lib/toolArming.js';
import styles from './SignTool/SignToolbar.module.css';

// What each tool is called in front of a user and what it is waiting for -
// the same contract SignToolbar's TOOL_COPY holds, for the same reason: every
// visible string and every announcement reads from here, so the two cannot
// drift and an internal id rename cannot rewrite the UI copy.
//
// Nothing here mentions hovering. Delete's copy used to open with "Hover to
// find...", which describes a gesture half this tool's users do not have.
const TOOL_COPY = {
  delete:   { action: 'Click a highlighted image or text run to delete it from the file.', button: 'Delete' },
  blackout: { action: 'Click and drag on a page to draw a blackout box.',                  button: 'Blackout' },
  whiteout: { action: 'Click and drag on a page to draw a whiteout box.',                  button: 'Whiteout' },
  blur:     { action: 'Click and drag on a page to blur an area.',                         button: 'Blur' },
};

export default function RedactToolbar({
  activeStyle,
  toolLocked,
  setTool,
  setAnnouncement,
  activeColor,
  setActiveColor,
  toggleFullscreen,
  isFullscreen,
  handleDownloadPdf,
  handlePrepareShare,
  handleSharePdf,
  canSharePdf = false,
  shareReady = false,
  elementsCount,
  actionHistory,
  setUndoModalOpen
}) {
  const { requestReplace } = useToolShell();

  // One-shot arming, double-click to lock - the same gesture the Sign toolbar
  // uses, from the same module. This tool used to have no such model at all:
  // a style stayed selected forever, which on a phone meant every drag on the
  // document drew a box and the page could not be scrolled at all.
  const armTool = makeArmTool({
    selectedTool: activeStyle,
    arm: (next) => {
      setTool(next);
      if (next) setAnnouncement(`${TOOL_COPY[next].button} tool active. ${TOOL_COPY[next].action}`);
    },
    lock: (tool) => lockTool(tool),
  });

  const lockTool = (tool) => {
    setTool(tool, true);
    setAnnouncement(`${TOOL_COPY[tool].button} tool stays on. Choose Stop, or press Escape, when you are done.`);
  };

  const stopTool = () => {
    setTool(null);
    setAnnouncement('Stopped adding.');
  };

  // Absent when no tool is armed, which is also what a tool missing from
  // TOOL_COPY looks like: the status line falls back to the idle tip rather
  // than rendering a half-built sentence.
  const activeToolCopy = activeStyle ? TOOL_COPY[activeStyle] : null;

  const toolClass = (tool) =>
    `${styles.button}${activeStyle === tool ? ` ${styles.active}` : ''}${activeStyle === tool && toolLocked ? ` ${styles.locked}` : ''}`;

  return (
    // No inline margin here any more. This file used to add one and SignToolbar
    // did not, which is the entire reason the two tools disagreed about the gap
    // above their toolbars; spacing belongs to the shared shell.
    <ToolShell
      editor
      status={
        <EditorToolStatus
          copy={activeToolCopy}
          locked={toolLocked}
          onKeepAdding={() => activeStyle && lockTool(activeStyle)}
          onStop={stopTool}
          idle="Tip: pick a tool to start. Delete takes an image or text run out of the file itself."
        />
      }
    >
      <div className={styles.toolbar} role="toolbar" aria-label="PDF redaction">
        <button
          type="button"
          className={toolClass('delete')}
          onClick={armTool('delete')}
          title="Delete an image or text run from the PDF. Double-click to keep deleting"
          aria-pressed={activeStyle === 'delete'}
          data-label-priority="2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span className={styles.label}>Delete</span>
        </button>

        <button
          type="button"
          className={toolClass('blackout')}
          onClick={armTool('blackout')}
          title="Draw a black redaction box. Double-click to keep adding"
          aria-pressed={activeStyle === 'blackout'}
          data-label-priority="2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="4" y1="5" x2="15" y2="5" />
            <rect x="3" y="9.5" width="18" height="5" rx="1" fill="currentColor" stroke="none" />
            <line x1="4" y1="19" x2="12" y2="19" />
          </svg>
          <span className={styles.label}>Blackout</span>
        </button>

        <button
          type="button"
          className={toolClass('whiteout')}
          onClick={armTool('whiteout')}
          title="Draw a whiteout box to erase content. Double-click to keep adding"
          aria-pressed={activeStyle === 'whiteout'}
          data-label-priority="2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
            <path d="M22 21H7" />
            <path d="m13.3 4 5.3 5.3" />
          </svg>
          <span className={styles.label}>Whiteout</span>
        </button>

        <button
          type="button"
          className={toolClass('blur')}
          onClick={armTool('blur')}
          title="Draw a blur redaction box. Double-click to keep adding"
          aria-pressed={activeStyle === 'blur'}
          data-label-priority="2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="4" y1="5" x2="15" y2="5" />
            <rect x="3" y="9.5" width="18" height="5" rx="1" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2.5 2" />
            <line x1="4" y1="19" x2="12" y2="19" />
          </svg>
          <span className={styles.label}>Blur</span>
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={() => setUndoModalOpen(true)}
          title="Undo changes"
          disabled={actionHistory.length === 0}
          data-label-priority="1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
          <span className={styles.label}>Undo</span>
        </button>

        <ViewControl isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} />

        {/* The united file action, in the exact slot Start over used to hold.
            Both meant "I want a different file"; this one says it once. */}
        <button
          type="button"
          className={`${styles.button} ${styles.highlight}`}
          onClick={requestReplace}
          title={FILE_ACTIONS.replace.title}
          aria-label={FILE_ACTIONS.replace.label}
          data-label-priority="1"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d={FILE_ACTIONS.replace.icon} />
          </svg>
          <span className={styles.label}>{FILE_ACTIONS.replace.shortLabel}</span>
        </button>

        <button
          type="button"
          className={`${styles.button} ${styles.download}${canSharePdf ? ` ${styles['desktop-download']}` : ''}`}
          onClick={handleDownloadPdf}
          disabled={elementsCount === 0}
          title={elementsCount === 0 ? 'Add at least one redaction box first' : 'Apply redactions and download'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span className={styles.label}>Download</span>
        </button>

        {canSharePdf && (
          <button
            type="button"
            className={`${styles.button} ${styles.share}`}
            onClick={shareReady ? handleSharePdf : handlePrepareShare}
            disabled={elementsCount === 0}
            title={elementsCount === 0
              ? 'Add at least one redaction box first'
              : (shareReady ? 'Share the redacted PDF' : 'Apply redactions and prepare the PDF for sharing')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
              <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            </svg>
            <span className={styles.label}>{shareReady ? 'Share now' : 'Share'}</span>
          </button>
        )}
      </div>
    </ToolShell>
  );
}
