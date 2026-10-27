import PdfPageCanvas from '../../../editor-ui/PdfPageCanvas.tsx';
import EditorPageHeader from '../../../editor-ui/EditorPageHeader.tsx';
import { recordAction } from '../../../lib/actionTrail.ts';
import { redactionDrawingPreviewStyle, renderRedactionDrawingPreviewContent } from '../../../editor/registry/redactionSurface.ts';
import type { RedactAction, RedactState } from '../state/redactState.ts';
import type { RedactArming } from '../hooks/useRedactArming.ts';
import type { RedactEditing } from '../hooks/useRedactEditing.ts';
import type { RedactPages } from '../hooks/useRedactPages.ts';
import type { RedactFind } from '../hooks/useRedactFind.ts';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import styles from '../PdfRedactTool.module.css';
import RedactPageBoxes from './RedactPageBoxes.tsx';
import DeletableObjectOverlay from './DeletableObjectOverlay.tsx';
import DeleteLift from './DeleteLift.tsx';
import DeleteMarquee from './DeleteMarquee.tsx';
import FindHighlights from './FindHighlights.tsx';
import BrushLayer from './BrushLayer.tsx';

/** One page card: its header, the page canvas, and every layer drawn over it. */
export default function RedactPage({ index: i, state, dispatch, pages, arming, editing, findKit }: {
  index: number;
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  pages: RedactPages;
  arming: RedactArming;
  editing: RedactEditing;
  findKit: RedactFind;
}) {
  const { elements } = state.edits;
  const { pdfDocument } = state.document;
  const { activeStyle, activeColor, activeBlurStrength, brush, drawingState } = state.tool;
  const { peekAll, brushKind } = arming;
  const { deleteTool } = editing;
  const { find, pageSizesPt } = findKit;
  return (
    <div data-editor-page-card>
      <EditorPageHeader
        pageNumber={i + 1}
        onClear={elements.some(el => el.pageIndex === i) ? () => editing.clearPage(i) : null}
        clearOptions={editing.clearPageOptions(i)}
        clearTitle="Clear every box on this page"
      />
      <div
        className={`${workspaceStyles['page-wrapper']} redact-draw-area`}
        data-eyedropper-surface
        ref={(el) => { pages.pageWrapperRefs.current[i] = el; }}
        onMouseDown={(e) => editing.handlePointerDown(e, i)}
        onTouchStart={(e) => editing.handlePointerDown(e, i)}
        /* touch-action is armed with the tool, not left off wholesale.
           A drawing tool has to own the touch so a drag draws instead
           of scrolling - but this used to be unconditional, and since
           a style was always selected, that meant a phone could never
           scroll the document at all. Delete places by tapping, so it
           keeps the browser's own panning. */
        style={{
          touchAction: activeStyle && activeStyle !== 'delete' ? 'none' : 'auto',
          cursor: activeStyle && activeStyle !== 'delete' ? 'crosshair' : 'default',
        }}
      >
        <PdfPageCanvas
          pdfDocument={(!peekAll && deleteTool.deletePreviews.get(i)) || pdfDocument}
          pageNum={!peekAll && deleteTool.deletePreviews.has(i) ? 1 : i + 1}
          onViewportReady={pages.handlePageViewportReady}
        />

        <RedactPageBoxes index={i} state={state} dispatch={dispatch} pages={pages} arming={arming} editing={editing} pageSizesPt={pageSizesPt} />

        {/* RED-13: an object queued for deletion has no mark of its own. The
            page is drawn without it (useDeletePreviews), so what you see is
            what you save, and the toolbar's Undo brings it back. */}
        {deleteTool.lifts.filter((lift) => lift.pageIndex === i).map((lift) => (
          <DeleteLift key={lift.id} lift={lift} onDone={deleteTool.finishLift} />
        ))}

        {/* Delete tool's hover targets: only shown while that tool is active,
            and only for objects still on the page. */}
        {activeStyle === 'delete' && (
          <DeletableObjectOverlay
            objects={deleteTool.deletableObjects.filter((object) => object.pageIndex === i)}
            markedIds={deleteTool.markedForDeletionIds}
            onSelect={(...args) => { deleteTool.markObject(...args); recordAction('delete_mark'); }}
          />
        )}
        {activeStyle === 'delete' && (
          <DeleteMarquee
            objects={deleteTool.deletableObjects.filter((object) => object.pageIndex === i && !deleteTool.markedForDeletionIds.has(object.id))}
            onCommit={(...args) => { deleteTool.markObjects(...args); recordAction('delete_mark'); }}
          />
        )}

        {find.open && (
          <FindHighlights
            matches={find.matchesOnPage(i)}
            currentId={find.currentId}
            coveredIds={find.coveredIds}
            onPick={find.setCurrentId}
          />
        )}

        {brushKind && (
          <BrushLayer
            pageIndex={i}
            kind={brushKind}
            sizePt={brush.size}
            color={brushKind === 'whiteout' ? activeColor : undefined}
            strength={brushKind === 'blur' ? activeBlurStrength : undefined}
            pageWidthPt={pageSizesPt[i]?.width}
            pageHeightPt={pageSizesPt[i]?.height}
            onCommit={editing.addStroke}
          />
        )}

        {/* Render active drawing box */}
        {drawingState && drawingState.pageIndex === i && (
          <div
            ref={editing.drawingPreviewRef}
            className={`redact-drawing-preview ${styles['drawing-preview']}`}
            style={{
              left: `${drawingState.startX}%`, top: `${drawingState.startY}%`, width: 0, height: 0,
              ...redactionDrawingPreviewStyle(drawingState.type, drawingState.color),
            }}
          >
            {/* No boxHeightPt here (RED-24): this preview's width/height are
                written straight to the DOM by the drag gesture (writeDOM
                in useRedactDrawing), never through drawingState/React, so there is no
                live, correct box height to give at render time. Omitting it
                reads as "not known yet" to blurFraction and falls back to
                the plain factor, same as before RED-24. */}
            {renderRedactionDrawingPreviewContent(drawingState.type, drawingState.strength)}
          </div>
        )}
      </div>
    </div>
  );
}
