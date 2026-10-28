import { useReducer } from 'preact/hooks';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/telemetry/IslandErrorBoundary.tsx';
import RedactVerb from './verb/RedactVerb.tsx';
import { getAppStyle, getEditorPreference } from '../../editor/workspace/preferenceStore.ts';
import { resolveWhiteoutColor, resolveRedactBlurStrength } from './lib/redactStyle.ts';
import { resolveBrush } from './components/BrushControls.tsx';
import { initialRedactState, redactReducer } from './state/redactState.ts';
import { redactedFileName } from './lib/redactFileName.ts';
import { useHoldUpdate } from '../../lib/hooks/useHoldUpdate.ts';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import { FileActions } from '../../shell/ToolShell.tsx';
import RatingPrompt from '../../shell/RatingPrompt.tsx';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import { DetailsSheet } from './components/details/DetailsSheet.tsx';
import RedactWorkspaceToolbar from './components/RedactWorkspaceToolbar.tsx';
import RedactPages from './components/RedactPages.tsx';
import RedactFinishRegion from './components/RedactFinishRegion.tsx';
import useRedactArming from './hooks/useRedactArming.ts';
import useRedactPages from './hooks/useRedactPages.ts';
import useRedactExport from './hooks/useRedactExport.ts';
import useRedactFileSession from './hooks/useRedactFileSession.ts';
import useRedactEditing from './hooks/useRedactEditing.ts';
import useRedactFind from './hooks/useRedactFind.ts';
import useRedactDetails from './hooks/useRedactDetails.ts';
import useRedactFinish from './hooks/useRedactFinish.ts';
import workspaceStyles from '../../editor-ui/Workspace.module.css';
import { describeFile } from '../../lib/text/format.js';
import { englishRedactMessages as t } from './messages.ts';

export default withIslandBoundary(function PdfRedactTool() {
  // SNG-08: the island's state lives in redactState.ts; the preferences it
  // starts from are read once, here.
  const [state, dispatch] = useReducer(redactReducer, undefined, () => initialRedactState({
    activeColor: resolveWhiteoutColor(undefined, getAppStyle(), getEditorPreference('lastWhiteoutColor')),
    activeBlurStrength: resolveRedactBlurStrength(undefined, getAppStyle(), getEditorPreference('lastBlurStrength')),
    brush: resolveBrush(undefined, getAppStyle()),
  }));
  const { elements } = state.edits;
  const { announcement, isPseudoFullscreen } = state.view;
  const { file, numPages, pdfDocument, sizedPageCount, status } = state.document;
  const setAnnouncement = (message: string) => dispatch({ type: 'ANNOUNCED', message });
  useHoldUpdate(status === 'redacting'); // finishPhase 'exporting' is this same state

  // activeStyle is null | 'delete' | 'blackout' | 'blur' | 'whiteout'. Null -
  // nothing armed - is the resting state, exactly as it is in the Sign tool: a
  // tool arms for one box and disarms itself once that box is committed, unless
  // it has been locked on. Before this the tool was permanently armed (it even
  // started on Delete), so there was no state in which a drag on the document
  // meant anything but "draw a box" - which on a phone meant the page could not
  // be scrolled.
  const arming = useRedactArming({ state, dispatch });
  const pages = useRedactPages({ state, dispatch });
  const { workspaceRef, needsUnlock, setNeedsUnlock, isFullscreenActive, currentPage } = pages;

  const exp = useRedactExport({
    state, dispatch, setAnnouncement, setNeedsUnlock, getFileBytes: () => fileBytesRef.current,
  });

  const { handleFilesAdded, fileBytesRef, draftSaveState, isRestoring } = useRedactFileSession({
    state, dispatch, setAnnouncement, setNeedsUnlock, renderedPageNumbersRef: pages.renderedPageNumbersRef,
    resetForNewFile: () => {
      editing.deleteTool.clearLifts();
      findKit.find.setOpen(false);
      findKit.find.setTerm('');
      findKit.find.setPreset(null);
    },
  });

  const editing = useRedactEditing({
    state, dispatch, setAnnouncement, fileBytes: fileBytesRef.current, pageWrapperRefs: pages.pageWrapperRefs,
    samplePage: pages.samplePage, arming,
  });
  const findKit = useRedactFind({ state, setAnnouncement, commands: editing.commands, brushArmed: arming.brushKind !== null });
  const details = useRedactDetails({
    state, dispatch, setAnnouncement, fileBytes: fileBytesRef.current, findKit, handleSavePdf: exp.handleSavePdf,
  });
  const finish = useRedactFinish({ state, handleDownloadPdf: exp.handleDownloadPdf });
  // SEO-46's ask, mounted once: in the strip while it is open, else last in the
  // bottom row. Two mounted copies would race for the one device-wide ask.
  const rating = <RatingPrompt tool="redact" downloaded={finish.downloaded} />;


  return (
    <BasePdfTool
      hasFiles={!!file}
      onFilesAdded={handleFilesAdded}
      intake={{ multiple: false, accept: '.pdf,application/pdf' }}
      identity={{
        file,
        // Finding #5/#6: a real page-1 thumbnail (FilePreview.tsx, via `file`)
        // instead of the generic glyph, and the identity row names what
        // Download will actually produce once there is something to redact -
        // rename-in-place is not required, so this stays derived rather than
        // becoming its own editable field the way Merge's output name is.
        label: elements.length > 0 && file ? redactedFileName(file.name) : file?.name,
        meta: describeFile(file, numPages, isFullscreenActive ? currentPage : null),
      }}
      empty={{ art: <RedactVerb />, message: 'Select or drop a PDF to redact' }}
      draft={{ saveState: draftSaveState, checking: isRestoring }}
      analytics={{ tool: 'redact' }}
      owns={{ shell: true, rating: true }}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {/* No loading-state message: pdf.js parses fast enough that a text block
          here just added its own undersized-then-replaced flicker (see
          Workspace.module.css's fade-in on .workspace, which softens the real
          jump from nothing to a loaded document instead). */}

      {needsUnlock && <NeedsUnlock kind={needsUnlock} file={file} bytes={fileBytesRef.current} from="redact" toolName="Redact" verb="redact" />}

      {!needsUnlock && (status === 'editing' || status === 'redacting') && pdfDocument && (
        <div
          className={`${workspaceStyles.workspace}${isPseudoFullscreen ? ` ${workspaceStyles['pseudo-fullscreen']}` : ''}${status === 'redacting' ? ` ${workspaceStyles['is-processing']}` : ''}`}
          ref={workspaceRef}
          data-workspace
          data-processing={status === 'redacting' || undefined}
          data-pseudo-fullscreen={isPseudoFullscreen || undefined}
          aria-busy={status === 'redacting'}
          data-redact-workspace-ready={numPages > 0 && sizedPageCount === numPages ? 'true' : 'false'}
        >
          <RedactWorkspaceToolbar
            state={state} dispatch={dispatch} setAnnouncement={setAnnouncement} pages={pages} arming={arming}
            editing={editing} findKit={findKit} exp={exp} finish={finish} rating={rating}
          />
          <RedactPages state={state} dispatch={dispatch} pages={pages} arming={arming} editing={editing} findKit={findKit} />
          <RedactFinishRegion state={state} exp={exp} finish={finish} details={details} rating={rating} />
        </div>
      )}

      <DetailsSheet
        open={details.detailsOpen}
        rows={details.rows}
        edits={state.edits.details}
        onEdit={(id, edit) => dispatch({ type: 'DETAIL_EDITED', id, edit })}
        onRestore={(id) => dispatch({ type: 'DETAIL_RESTORED', id })}
        onClose={details.closeDetails}
      />

      {/* Error */}
      {status === 'error' && !needsUnlock && (
        <ErrorMessage title={t.didntOpen} fullWidth>
          <LoadErrorBody />
        </ErrorMessage>
      )}

    </BasePdfTool>
  );
});

// RED-39: a failed load used to leave no way out on a phone - the file is
// already set, so no dropzone shows, and Replace lives in the toolbar that
// never mounted. It renders inside BasePdfTool, so the shell's own Replace
// (FileActions, through useToolShell().requestReplace) is in reach.
function LoadErrorBody() {
  return (
    <>
      {t.loadErrorLead} <a href="/unlock/">{t.loadErrorUnlock}</a> {t.loadErrorTail}
      <FileActions />
    </>
  );
}
