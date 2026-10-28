import type { ComponentChildren } from 'preact';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { canRedo as canRedoOf, restoredNoteVisible, type RedactAction, type RedactState } from '../state/redactState.ts';
import { finishStatusText } from '../lib/finishState.ts';
import type { RedactArming } from '../hooks/useRedactArming.ts';
import type { RedactEditing } from '../hooks/useRedactEditing.ts';
import type { RedactPages } from '../hooks/useRedactPages.ts';
import type { RedactFind } from '../hooks/useRedactFind.ts';
import type { RedactFinishState } from '../hooks/useRedactFinish.ts';
import type useRedactExport from '../hooks/useRedactExport.ts';
import RedactToolbar from './RedactToolbar.tsx';
import FindBar from './FindBar.tsx';
import BrushControls from './BrushControls.tsx';
import RedactDoneStrip from './RedactDoneStrip.tsx';

/** The toolbar with its find bar, brush controls and (once saved) the done strip slotted in. */
export default function RedactWorkspaceToolbar({ state, dispatch, setAnnouncement, pages, arming, editing, findKit, exp, finish, rating }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  setAnnouncement: (message: string) => void;
  pages: RedactPages;
  arming: RedactArming;
  editing: RedactEditing;
  findKit: RedactFind;
  exp: ReturnType<typeof useRedactExport>;
  finish: RedactFinishState;
  rating: ComponentChildren;
}) {
  const { activeStyle, toolLocked, activeColor, brush, eyedropping } = state.tool;
  const { undoAction } = state.edits;
  const { showStrip } = finish;
  const { find, redactMatches } = findKit;
  return (
    <RedactToolbar
      tool={{ active: activeStyle, locked: toolLocked, set: arming.setTool, brushMode: arming.brushKind !== null }}
      announce={setAnnouncement}
      fullscreen={{ active: pages.isFullscreenActive, toggle: pages.toggleFullscreen }}
      output={{
        download: finish.handleToolbarDownload,
        prepareShare: () => exp.handleSavePdf('share'),
        share: exp.handleSharePdf,
        canShare: exp.canSharePdf,
        shareReady: exp.shareReady,
        exporting: state.document.status === 'redacting',
        downloadConfirmed: finish.downloadConfirmed,
      }}
      history={{ entries: state.edits.history.past, undo: editing.undoLast, redo: editing.redoLast, canRedo: canRedoOf(state) }}
      undoChip={{
        action: undoAction && {
          message: undoAction.message,
          extra: undoAction.extra && {
            label: undoAction.extra.label,
            // Pressing it spends the chip, like Undo; the action it runs may register its own.
            onSelect: () => { const run = undoAction.extra!.onSelect; editing.clearUndoChip(); run(); },
          },
        },
        run: editing.runUndoChip,
      }}
      elementsCount={state.edits.elements.length}
      status={{
        message: showStrip ? null : finishStatusText(finish.finishFacts),
        welcomeTip: state.document.showWelcomeTip,
        restoredNote: restoredNoteVisible(state),
      }}
      find={{
        open: find.open,
        toggle: () => find.setOpen(!find.open),
        bar: find.open && (
          <FindBar
            term={find.term}
            preset={find.preset}
            onTermChange={find.setTerm}
            onPresetChange={find.setPreset}
            summary={find.summary}
            onPrev={find.prev}
            onNext={find.next}
            redactStyle={find.redactStyle}
            onRedactStyleChange={find.setRedactStyle}
            onRedactCurrent={() => { if (find.current) redactMatches([find.current]); }}
            onRedactAll={() => redactMatches(find.openMatches)}
            onClose={() => find.setOpen(false)}
          />
        ),
      }}
      slots={{
        brushControls: (activeStyle === 'blur' || activeStyle === 'whiteout') && (
          <BrushControls
            tool={activeStyle}
            settings={brush}
            onSettings={(next) => { arming.changeBrush(next); recordAction('change_setting'); }}
            color={activeColor}
            onColor={(color) => { arming.rememberColor(color); recordAction('change_setting'); }}
            eyedropping={eyedropping === 'brush'}
            onToggleEyedropper={() => dispatch({ type: 'EYEDROPPER_TOGGLED', target: 'brush' })}
          />
        ),
        doneStrip: showStrip && (
          <RedactDoneStrip
            facts={finish.finishFacts}
            handoffBusy={exp.handoffBusy}
            handoffFailed={state.finish.handoffFailed}
            onHandoff={(tool) => { void exp.requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
            onClose={finish.closeStrip}
          >
            {rating}
          </RedactDoneStrip>
        ),
      }}
      peek={{ active: arming.peekAll, onChange: arming.setPeekAll }}
    />
  );
}
