import { useReducer, useState } from 'preact/hooks';
import { PHOTO_ACCEPT as ACCEPT, usePhotoTileList } from '#lib/hooks/usePhotoTileList.ts';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import { reorderEntries } from '#lib/pages/pageOrder.js';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import BasePdfTool from '#shell/BasePdfTool.tsx';
import ToolShellBridge from '#shell/ToolShellBridge.tsx';
import { downloadDetail, pagesLabel } from '#shell/pageWorkspace/pageCounts.ts';
import { englishShellMessages } from '#shell/shellMessages.ts';
import ScanSkippedNotice from './components/ScanSkippedNotice.tsx';
import ScanWorkspace from './components/ScanWorkspace.tsx';
import StartScanButton from './components/StartScanButton.tsx';
import { useScanCamera } from './hooks/useScanCamera.ts';
import { useScanBoard } from './hooks/useScanBoard.ts';
import { useScanExport } from './hooks/useScanExport.ts';
import { useScanPages } from './hooks/useScanPages.ts';
import { useScanRefs } from './hooks/useScanRefs.ts';
import { useScanRating } from './hooks/useScanRating.tsx';
import { useScanSettings } from './hooks/useScanSettings.ts';
import { useScanStage } from './hooks/useScanStage.ts';
import { useScanView } from './hooks/useScanView.ts';
import { resultKey } from './lib/scanPages.ts';
import { initialScanState, reduceScan } from './state/scanState.ts';
import { createEditActions, createPageActions } from './state/scanActions.ts';
import type { ScanPage } from './state/scanWork.ts';
import { englishScanMessages as t } from './messages.ts';
import styles from './PdfScanTool.module.css';
import ScanVerb from './verb/ScanVerb.tsx';

export interface PdfScanToolProps {
  quietPolicy?: QuietPolicy;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

export default withIslandBoundary(function PdfScanTool({ quietPolicy, navigate }: PdfScanToolProps = {}) {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [state, dispatch] = useReducer(reduceScan, initialScanState);
  const { selectedId, finding, findMissed, failedIds, full } = state;
  /** The table of all the pages, one page as it will download, or that page's corners. */
  const view = state.phase;
  const settings = useScanSettings();
  const board = useScanBoard();
  const { results, turnedPreviews } = board;
  // The queues, caches and latest-render values async callbacks read (state/scanWork.ts).
  const { work, editorRef, workbenchRef, headingRef, unmountedRef } = useScanRefs();
  const stageHeight = useScanStage(workbenchRef, pages.length > 0);
  work.pages = pages;
  work.defaultFilter = settings.defaultFilter;
  const { rating, wide } = useScanRating();

  const { processed, addFiles, retakeFile } = useScanPages({ pages, setPages, work, unmountedRef, dispatch, ...board });

  const { key, prepared, outputName, fileName, downloadFlow } = useScanExport({
    pages, failedIds, ...settings, work, processed, unmountedRef, ...board, quietPolicy, navigate,
  });

  const { listRef, focusIdRef } = usePhotoTileList({
    active: pages.length > 0,
    items: pages,
    ghostClass: styles['is-ghost'],
    onReorder: (oldIndex, newIndex) => {
      setPages((current) => reorderEntries(current, oldIndex, newIndex));
      recordAction('reorder');
    },
  });

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const selectedIndex = selected ? pages.indexOf(selected) : -1;
  const { enterFull, exitFull, showResult } = useScanView({
    state, dispatch, work, hasPages: pages.length > 0, selected, editorRef, headingRef, listRef, unmountedRef, ...board,
  });

  const { findPage, removePage, reset } = createPageActions({ pages, view, setPages, work, unmountedRef, dispatch, focusIdRef, ...board, ...settings });
  const edit = createEditActions({ pages, selected, selectedIndex, failedIds, setPages, dispatch, focusIdRef, showResult, retakeFile, ...board, ...settings });

  const { Viewfinder, viewfinderProps, openMany, openOne } = useScanCamera({ pages, results, unmountedRef, dispatch, addFiles, retakePage: edit.retakePage, removePage });

  const shown = key === null ? undefined : work.shown.get(key);
  const limitNote = key !== null && work.missedKeys.has(key) ? t.limitMissed : undefined;

  return (
    <BasePdfTool
      hasFiles={pages.length > 0}
      onFilesAdded={addFiles}
      intake={{ accept: ACCEPT, needsPdfjs: false }}
      identity={{ label: pagesLabel(pages.length, englishShellMessages), hidden: true }}
      empty={{ art: <ScanVerb />, action: <StartScanButton onFiles={addFiles} onStart={openMany} />, actionLeads: true, pickLabel: t.choosePhotos, message: t.dropHere }}
      clearAll={{ onClear: reset, summary: pagesLabel(pages.length, englishShellMessages) }}
      analytics={{ tool: 'scan-to-pdf', status: prepared.status === 'error' ? 'error' : downloadFlow.tap }}
      owns={{ rating: true }}
    >
      <ScanSkippedNotice names={board.rejectedFiles} />

      {pages.length > 0 && selected && (
        <ToolShellBridge>
          {(bridge) => (
            <ScanWorkspace
              bridge={bridge}
              view={view}
              onOpen={edit.openPage}
              results={results}
              resultKeyOf={resultKey}
              pages={pages}
              failedIds={failedIds}
              addFiles={addFiles}
              onCamera={openMany}
              rating={rating}
              wide={wide}
              output={{
                prepared,
                flow: downloadFlow,
                fileName,
                detail: downloadDetail(prepared, pages.length, englishShellMessages, t.dir),
                outputName,
                isRenaming: settings.isRenaming,
                onRename: settings.rename,
                onEditingChange: settings.setIsRenaming,
                onShowFailedPage: edit.showFailedPage,
              }}
              options={{ pageSize: settings.pageSize, limit: settings.limit, onPageSize: settings.choosePageSize, onLimit: settings.chooseLimit, limitNote }}
              workbench={{
                refs: { workbench: workbenchRef, editor: editorRef, heading: headingRef, list: listRef },
                stageHeight,
                pages,
                selected,
                selectedIndex,
                view,
                results,
                turnedPreviews,
                failedIds,
                finding,
                findMissed,
                full,
                pageSize: settings.pageSize,
                built: { shown, ready: prepared.status === 'ready', size: prepared.size },
                resultKeyOf: resultKey,
                actions: {
                  onRotate: edit.rotatePage,
                  onToggleFull: full ? exitFull : enterFull,
                  onAdjustCorners: edit.adjustCorners,
                  onCommit: edit.commitCorners,
                  onFind: findPage,
                  onApprove: edit.approveCorners,
                  onDone: edit.closePage,
                  onRetake: (file) => edit.retakePage(selected.id, file),
                  onRetakeCamera: () => openOne(selected.id),
                  onRemovePage: removePage,
                  onChooseLook: edit.chooseLook,
                  onSelect: edit.openPage,
                  onTileKeyDown: edit.onTileKeyDown,
                  onRemove: removePage,
                  onFiles: addFiles,
                },
              }}
            />
          )}
        </ToolShellBridge>
      )}

      {Viewfinder && viewfinderProps && <Viewfinder {...viewfinderProps} />}

      <p class="sr-only" role="status" aria-live="polite">{board.announcement}</p>
    </BasePdfTool>
  );
});
