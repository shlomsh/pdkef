import type { ComponentChildren } from 'preact';
import { Search, Eye } from 'lucide-preact';
import ViewControl from '../../editor-ui/ViewControl.tsx';
import EditorToolStatus, { type ToolCopy } from '../../editor-ui/EditorToolStatus.tsx';
import ArmHint from '../../editor-ui/ArmHint.tsx';
import EditorExportActions from '../../editor-ui/EditorExportActions.tsx';
import ToolShell, { FILE_ACTIONS, useToolShell } from '../../shell/ToolShell.tsx';
import { useArmTool, useAutoArmHint } from '../../editor-ui/hooks/toolArming.js';
import { WhiteoutIcon, EraserIcon, BlurToolIcon, BlackoutToolIcon } from '../../editor-ui/toolIcons.tsx';
import type { ActionHistoryEntry } from '../../editor/model/actionHistory.ts';
import type { RedactToolType } from '../../editor/model/editorModel.ts';
import styles from '../../editor-ui/SignToolbar.module.css';
import redactStyles from './PdfRedactTool.module.css';
import barStyles from './RedactToolbar.module.css';

// What each tool is called in front of a user and what it is waiting for -
// the same contract SignToolbar's TOOL_COPY holds, for the same reason: every
// visible string and every announcement reads from here, so the two cannot
// drift and an internal id rename cannot rewrite the UI copy.
//
// Nothing here mentions hovering. Delete's copy used to open with "Hover to
// find...", which describes a gesture half this tool's users do not have.
//
// Delete's sentence stops at "delete it": "from the file" was the idle tip's
// job ("Delete takes text or an image out of the file"), and on a
// phone every sentence here shares one fixed-height row with the keep-on
// switch beside it, sized by the longest of them - the extra clause was a
// third line that every tool's row then paid for (e2e/tool-toolbars/
// toolbar-phone-row.spec.js).
const TOOL_COPY: Record<RedactToolType, ToolCopy> = {
  delete:   { action: 'Click text or an image to delete it, or drag across several.', actionTouch: 'Tap outlined text or an image to delete it.', button: 'Delete' },
  blackout: { action: 'Click and drag to draw a blackout box.',           actionTouch: 'Drag to draw a blackout box.',                button: 'Blackout' },
  whiteout: { action: 'Click and drag to draw a whiteout box.',           actionTouch: 'Drag to draw a whiteout box.',                button: 'Whiteout' },
  blur:     { action: 'Click and drag to draw a blur box.',               actionTouch: 'Drag to draw a blur box.',                    button: 'Blur' },
};

// RED-32: the same tools armed as a brush. The brush stays on until Esc or a
// second press of its tool, so it shows no keep-on switch (RED-42).
const BRUSH_COPY: Record<'blur' | 'whiteout', ToolCopy> = {
  blur:     { action: 'Click and drag to paint a blur.',    actionTouch: 'Drag to paint a blur.',    button: 'Blur' },
  whiteout: { action: 'Click and drag to paint whiteout.', actionTouch: 'Drag to paint whiteout.', button: 'Whiteout' },
};

const isRedactToolType = (tool: string): tool is RedactToolType => tool in TOOL_COPY;

export default function RedactToolbar({
  activeStyle,
  toolLocked,
  setTool,
  setAnnouncement,
  toggleFullscreen,
  isFullscreen,
  handleDownloadPdf,
  handlePrepareShare,
  handleSharePdf,
  canSharePdf = false,
  shareReady = false,
  elementsCount,
  actionHistory,
  onUndo,
  onRedo,
  canRedo,
  exporting = false,
  undoAction = null,
  onUndoAction,
  showWelcomeTip = true,
  restoredNote = false,
  brushControls = null,
  brushMode = false,
  findOpen = false,
  onToggleFind,
  findBar = null,
  statusMessage,
  peeking = false,
  onPeekChange,
}: {
  activeStyle: RedactToolType | null;
  toolLocked: boolean;
  setTool: (tool: RedactToolType | null, locked?: boolean) => void;
  setAnnouncement: (msg: string) => void;
  toggleFullscreen: () => void;
  isFullscreen: boolean;
  handleDownloadPdf: () => void;
  handlePrepareShare: () => void;
  handleSharePdf: () => void;
  canSharePdf?: boolean;
  shareReady?: boolean;
  elementsCount: number;
  /** Newest-first log of the add/delete commands Undo can step back through;
   * the toolbar reads only its length, to disable Undo at the start. */
  actionHistory: ActionHistoryEntry[];
  /** One tap, one step back - the same thing Cmd/Ctrl+Z does. The toolbar's
   * Undo used to open a change-history dialog instead, which meant a phone
   * had no single-step undo at all and no way to reach Redo, since the dialog
   * was the only place it lived and reverting closed it. */
  onUndo: () => void;
  onRedo: () => void;
  /** Whether anything has been undone that Redo could bring back. Required,
   * not defaulted: a caller that wired the handlers and forgot the flag would
   * typecheck and ship a Redo button that never enables. */
  canRedo: boolean;
  /** True while a redacted PDF is being generated - guards Download/Share
   * against re-entry so a second click can't start an overlapping export. */
  exporting?: boolean;
  /** Finding #3: a pending short-lived undo (a box removed, or a page
   * cleared). Present, this wins the status line's slot over the armed-tool
   * hint, the same way Merge's own undo chip wins its header slot. */
  undoAction?: { message: string; extra?: { label: string; onSelect: () => void } } | null;
  onUndoAction?: () => void;
  /** A restored document is already in progress, so omit the newcomer-only
   * idle tip until the person selects a tool. */
  showWelcomeTip?: boolean;
  /** RED-45: true while a reopened document's work is untouched. */
  restoredNote?: boolean;
  /** RED-02: whether the find row is open, and the row itself. It renders
   * inside this sticky card, under the buttons, so it stays in reach while
   * the pages scroll. */
  /** RED-32: the Box / Brush row for Blur and Whiteout, under the buttons. */
  brushControls?: ComponentChildren;
  /** Blur or Whiteout is armed as a brush: the status line says how to paint. */
  brushMode?: boolean;
  findOpen?: boolean;
  onToggleFind?: () => void;
  findBar?: ComponentChildren;
  /** A message from the island (export progress, done, an export cancelled by
   * an edit) for the status slot. The undo chip wins the slot when both exist. */
  statusMessage?: ComponentChildren;
  /** RED-31: the Peek button is held down (or Space is). View state only. */
  peeking?: boolean;
  onPeekChange?: (on: boolean) => void;
}) {
  const { requestReplace } = useToolShell();

  // One-shot arming, double-click to lock - the same gesture the Sign toolbar
  // uses, from the same module. This tool used to have no such model at all:
  // a style stayed selected forever, which on a phone meant every drag on the
  // document drew a box and the page could not be scrolled at all.
  const { autoShowTool, noteArmed } = useAutoArmHint();
  const armTool = useArmTool({
    selectedTool: activeStyle,
    arm: (next: string | null) => {
      if (next !== null && !isRedactToolType(next)) return;
      setTool(next);
      if (next) {
        setAnnouncement(`${TOOL_COPY[next].button} tool active. ${TOOL_COPY[next].action}`);
        noteArmed(next);
      }
    },
    lock: (tool: string) => {
      if (isRedactToolType(tool)) lockTool(tool);
    },
  });

  const lockTool = (tool: RedactToolType) => {
    setTool(tool, true);
    setAnnouncement(`${TOOL_COPY[tool].button} stays on after each one. Switch it off, or press Escape, when you are done.`);
  };

  // The switch's other half, and deliberately not `setTool(null)`: switching off
  // has to land back in the state switching on was entered from, which is armed
  // for one. Disarming here is what made the old chip a one-way door.
  const unlockTool = (tool: RedactToolType) => {
    setTool(tool, false);
    setAnnouncement(`${TOOL_COPY[tool].button} is back to one at a time.`);
  };

  // Absent when no tool is armed, which is also what a tool missing from
  // TOOL_COPY looks like: the status line falls back to the idle tip rather
  // than rendering a half-built sentence.
  const brushArmed = brushMode && (activeStyle === 'blur' || activeStyle === 'whiteout');
  const activeToolCopy = activeStyle
    ? (brushArmed ? BRUSH_COPY[activeStyle] : TOOL_COPY[activeStyle])
    : null;

  const toolClass = (tool: RedactToolType) =>
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
          onToggleKeepOn={() => activeStyle && (toolLocked ? unlockTool(activeStyle) : lockTool(activeStyle))}
          showKeepOn={!brushArmed}
          // QUAL-10: restored work is not a newcomer's first visit, so it gets
          // no tip; the empty idle row still holds the stack's reserved height.
          idle={showWelcomeTip
            ? 'Tip: pick a tool. A box covers what is under it; Delete takes text or an image out of the file.'
            : restoredNote ? 'Your changes from last time are back. Undo still works.' : ''}
          reserveCopies={[...Object.values(TOOL_COPY), ...Object.values(BRUSH_COPY)]}
          // Finding #3: one slot, and the undo chip wins it - matching
          // PdfMergeTool.tsx's own `undoAction ? <chip/> : <otherHint/>`. While
          // it is showing, the armed-tool hint is not lost, just deferred: it
          // comes back the moment the chip's 5s timer clears or Undo is
          // pressed. It rides inside EditorToolStatus's stack rather than
          // replacing it so the slot keeps its reserved height while the chip
          // comes and goes (see that component's `override`). Nothing reserves
          // height for the chip itself, so it must never be taller than the
          // rows that are reserved: one line, ellipsised, never wrapped
          // (`.undo-chip-text`).
          override={undoAction ? (
            <span className={redactStyles['undo-chip']}>
              <span className={redactStyles['undo-chip-text']}>{undoAction.message}</span>
              {undoAction.extra && (
                <button type="button" className={`${redactStyles['undo-chip-btn']} ${barStyles['chip-hit']}`} onClick={undoAction.extra.onSelect}>{undoAction.extra.label}</button>
              )}
              <button type="button" className={`${redactStyles['undo-chip-btn']} ${barStyles['chip-hit']}`} onClick={onUndoAction}>Undo</button>
            </span>
          ) : (statusMessage ?? undefined)}
        />
      }
    >
      <div className={`${styles.toolbar} ${barStyles.bar}`} role="toolbar" aria-label="PDF redaction" dir="ltr" lang="en">
        <ArmHint tool="blur" label="Blur" action={TOOL_COPY.blur.action} locked={activeStyle === 'blur' && toolLocked} autoShowTool={autoShowTool}>
          <button
            type="button"
            className={toolClass('blur')}
            onClick={armTool('blur')}
            aria-pressed={activeStyle === 'blur'}
          >
            <BlurToolIcon />
            <span className={styles.label}>Blur</span>
          </button>
        </ArmHint>

        <ArmHint tool="blackout" label="Blackout" action={TOOL_COPY.blackout.action} locked={activeStyle === 'blackout' && toolLocked} autoShowTool={autoShowTool}>
          <button
            type="button"
            className={toolClass('blackout')}
            onClick={armTool('blackout')}
            aria-pressed={activeStyle === 'blackout'}
          >
            <BlackoutToolIcon />
            <span className={styles.label}>Blackout</span>
          </button>
        </ArmHint>

        <ArmHint tool="whiteout" label="Whiteout" action={TOOL_COPY.whiteout.action} locked={activeStyle === 'whiteout' && toolLocked} autoShowTool={autoShowTool}>
          <button
            type="button"
            className={toolClass('whiteout')}
            onClick={armTool('whiteout')}
            aria-pressed={activeStyle === 'whiteout'}
          >
            <WhiteoutIcon />
            <span className={styles.label}>Whiteout</span>
          </button>
        </ArmHint>

        <ArmHint tool="delete" label="Delete" action={TOOL_COPY.delete.action} locked={activeStyle === 'delete' && toolLocked} autoShowTool={autoShowTool}>
          <button
            type="button"
            className={toolClass('delete')}
            onClick={armTool('delete')}
            aria-pressed={activeStyle === 'delete'}
          >
            <EraserIcon />
            <span className={styles.label}>Delete</span>
          </button>
        </ArmHint>

        {/* RED-02: Find is an action, not a tool to arm - it opens a row of
            its own under these buttons and never draws on a page. */}
        {onToggleFind && (
          <button
            type="button"
            className={`${styles.button}${findOpen ? ` ${styles.active}` : ''}`}
            onClick={onToggleFind}
            aria-pressed={findOpen}
            title="Find text to redact"
            data-redact-find-toggle
          >
            <Search size={18} aria-hidden="true" />
            <span className={styles.label}>Find</span>
          </button>
        )}

        {/* RED-31: hold to see what is under every box; release covers it again. */}
        {onPeekChange && (
          <button
            type="button"
            className={`${styles.button}${peeking ? ` ${styles.active}` : ''}`}
            onPointerDown={(e) => { e.preventDefault(); onPeekChange(true); }}
            onPointerUp={() => onPeekChange(false)}
            onPointerCancel={() => onPeekChange(false)}
            onPointerLeave={() => onPeekChange(false)}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={peeking}
            title="Hold to see what is under the boxes"
            data-redact-peek
          >
            <Eye size={18} aria-hidden="true" />
            <span className={styles.label}>Peek</span>
          </button>
        )}

        {/* Undo and Redo are the whole history model, one tap each, plus the
            keyboard shortcuts (src/lib/history/useHistoryShortcuts.js). A
            third "History" control used to sit beside them and open a
            change-history dialog whose checklist could revert an arbitrary
            set; it was removed because a real Undo/Redo pair makes the
            timeline redundant and its selective revert fought linear redo. Do
            not bring it back. Folding undo and redo into one button is what
            once left a phone unable to redo at all - keep them as two. */}
        <button
          type="button"
          className={styles.button}
          onClick={onUndo}
          title="Undo"
          disabled={actionHistory.length === 0}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
          <span className={styles.label}>Undo</span>
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={onRedo}
          title="Redo"
          disabled={!canRedo}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
          </svg>
          <span className={styles.label}>Redo</span>
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
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d={FILE_ACTIONS.replace.icon} />
          </svg>
          <span className={styles.label}>{FILE_ACTIONS.replace.shortLabel}</span>
        </button>

        <EditorExportActions
          variant="toolbar"
          canShare={canSharePdf}
          shareReady={shareReady}
          disabled={elementsCount === 0 || exporting}
          onDownload={handleDownloadPdf}
          onPrepareShare={handlePrepareShare}
          onShare={handleSharePdf}
          downloadTitle={elementsCount === 0 ? 'Draw a box or delete something first' : 'Download the redacted PDF'}
          shareTitle={elementsCount === 0
            ? 'Draw a box or delete something first'
            : (shareReady ? 'Share the redacted PDF' : 'Apply redactions and prepare the PDF for sharing')}
        />

      </div>
      {brushControls}
      {findBar}
    </ToolShell>
  );
}
