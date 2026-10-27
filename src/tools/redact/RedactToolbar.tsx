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
import UndoRedoButtons from '../../editor-ui/UndoRedoButtons.tsx';
import redactStyles from './PdfRedactTool.module.css';
import barStyles from './RedactToolbar.module.css';
import { englishRedactMessages as t } from './messages.ts';
import { formatMessage } from '../../lib/formatMessage.ts';

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
const TOOL_COPY: Record<RedactToolType, ToolCopy> = t.toolCopy;

// RED-32: the same tools armed as a brush. The brush stays on until Esc or a
// second press of its tool, so it shows no keep-on switch (RED-42).
const BRUSH_COPY: Record<'blur' | 'whiteout', ToolCopy> = t.brushCopy;

const isRedactToolType = (tool: string): tool is RedactToolType => tool in TOOL_COPY;

/** iOS starts a text selection from a long press on the label; `selectstart`
 * is not in Preact's JSX types, so it is bound by ref. Same function every
 * render, so addEventListener never stacks a duplicate. */
const stopSelect = (e: Event) => e.preventDefault();
const blockSelection = (el: HTMLButtonElement | null) => el?.addEventListener('selectstart', stopSelect);

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
  downloadConfirmed = false,
  doneStrip = null,
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
  /** RED-66: the toolbar Download says "Saved" for a moment after it saved. */
  downloadConfirmed?: boolean;
  /** RED-66: the done strip, hung under this sticky card so it stays where the person clicked. */
  doneStrip?: ComponentChildren;
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
        setAnnouncement(formatMessage(t.toolActive, { tool: TOOL_COPY[next].button, action: TOOL_COPY[next].action }));
        noteArmed(next);
      }
    },
    lock: (tool: string) => {
      if (isRedactToolType(tool)) lockTool(tool);
    },
  });

  const lockTool = (tool: RedactToolType) => {
    setTool(tool, true);
    setAnnouncement(formatMessage(t.toolStaysOn, { tool: TOOL_COPY[tool].button }));
  };

  // The switch's other half, and deliberately not `setTool(null)`: switching off
  // has to land back in the state switching on was entered from, which is armed
  // for one. Disarming here is what made the old chip a one-way door.
  const unlockTool = (tool: RedactToolType) => {
    setTool(tool, false);
    setAnnouncement(formatMessage(t.toolBackToOne, { tool: TOOL_COPY[tool].button }));
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
      inlineStatus
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
              <button type="button" className={`${redactStyles['undo-chip-btn']} ${barStyles['chip-hit']}`} onClick={onUndoAction}>{t.undo}</button>
            </span>
          ) : (statusMessage ?? undefined)}
        />
      }
    >
      <div className={`${styles.toolbar} ${barStyles.bar}`} role="toolbar" aria-label={t.toolbarLabel} dir="ltr" lang="en">
        <ArmHint tool="blur" label={TOOL_COPY.blur.button} action={TOOL_COPY.blur.action} locked={activeStyle === 'blur' && toolLocked} autoShowTool={autoShowTool}>
          <button
            type="button"
            className={toolClass('blur')}
            onClick={armTool('blur')}
            aria-pressed={activeStyle === 'blur'}
          >
            <BlurToolIcon />
            <span className={styles.label}>{TOOL_COPY.blur.button}</span>
          </button>
        </ArmHint>

        <ArmHint tool="blackout" label={TOOL_COPY.blackout.button} action={TOOL_COPY.blackout.action} locked={activeStyle === 'blackout' && toolLocked} autoShowTool={autoShowTool}>
          <button
            type="button"
            className={toolClass('blackout')}
            onClick={armTool('blackout')}
            aria-pressed={activeStyle === 'blackout'}
          >
            <BlackoutToolIcon />
            <span className={styles.label}>{TOOL_COPY.blackout.button}</span>
          </button>
        </ArmHint>

        <ArmHint tool="whiteout" label={TOOL_COPY.whiteout.button} action={TOOL_COPY.whiteout.action} locked={activeStyle === 'whiteout' && toolLocked} autoShowTool={autoShowTool}>
          <button
            type="button"
            className={toolClass('whiteout')}
            onClick={armTool('whiteout')}
            aria-pressed={activeStyle === 'whiteout'}
          >
            <WhiteoutIcon />
            <span className={styles.label}>{TOOL_COPY.whiteout.button}</span>
          </button>
        </ArmHint>

        <ArmHint tool="delete" label={TOOL_COPY.delete.button} action={TOOL_COPY.delete.action} locked={activeStyle === 'delete' && toolLocked} autoShowTool={autoShowTool}>
          <button
            type="button"
            className={toolClass('delete')}
            onClick={armTool('delete')}
            aria-pressed={activeStyle === 'delete'}
          >
            <EraserIcon />
            <span className={styles.label}>{TOOL_COPY.delete.button}</span>
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
            title={t.findTitle}
            data-redact-find-toggle
          >
            <Search size={18} aria-hidden="true" />
            <span className={styles.label}>{t.find}</span>
          </button>
        )}

        {/* RED-31: hold to see what is under every box; release covers it again. */}
        {onPeekChange && (
          <button
            type="button"
            className={`${styles.button} ${redactStyles['peek-button']}${peeking ? ` ${styles.active}` : ''}`}
            onPointerDown={(e) => { e.preventDefault(); onPeekChange(true); }}
            onPointerUp={() => onPeekChange(false)}
            onPointerCancel={() => onPeekChange(false)}
            onPointerLeave={() => onPeekChange(false)}
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            ref={blockSelection}
            aria-pressed={peeking}
            title={t.peekTitle}
            data-redact-peek
          >
            <Eye size={18} aria-hidden="true" />
            <span className={styles.label}>{t.peek}</span>
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
        <UndoRedoButtons onUndo={onUndo} onRedo={onRedo} canUndo={actionHistory.length > 0} canRedo={canRedo} />

        <ViewControl isFullscreen={isFullscreen} toggleFullscreen={toggleFullscreen} />

        {/* The united file action, in the exact slot Start over used to hold.
            Both meant "I want a different file"; this one says it once. */}
        <button
          type="button"
          className={styles.button}
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
          keepDownloadOnPhone
          canShare={canSharePdf}
          shareReady={shareReady}
          disabled={elementsCount === 0 || exporting}
          onDownload={handleDownloadPdf}
          confirmed={downloadConfirmed}
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
      {doneStrip}
    </ToolShell>
  );
}
