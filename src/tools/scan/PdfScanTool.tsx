import { useReducer, useState } from 'preact/hooks';
import { useHoldUpdate } from '#lib/hooks/useHoldUpdate.ts';
import { usePhotoTileList } from '#lib/hooks/usePhotoTileList.ts';
import { SCAN_ACCEPT } from './lib/scanAccept.ts';
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
import ScanPhoneTable from './components/ScanPhoneTable.tsx';
import ScanPageViewer from './components/ScanPageViewer.tsx';
import ScanUndoChip from './components/ScanUndoChip.tsx';
import ScanCamera from './components/ScanCamera.tsx';
import StartScanButton from './components/StartScanButton.tsx';
import { useScanBoard } from './hooks/useScanBoard.ts';
import { useScanExport } from './hooks/useScanExport.ts';
import { useScanPages } from './hooks/useScanPages.ts';
import { useScanRefs } from './hooks/useScanRefs.ts';
import { useScanRating } from './hooks/useScanRating.tsx';
import { useScanSettings } from './hooks/useScanSettings.ts';
import { useScanView } from './hooks/useScanView.ts';
import { resultKey } from './lib/scanPages.ts';
import { initialScanState, reduceScan } from './state/scanState.ts';
import { createEditActions, createPageActions, pageViewActions } from './state/scanActions.ts';
import { cameraProps } from './state/cameraProps.ts';
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
  const { selectedId, finding, findMissed, failedIds } = state;
  /** The table of all the pages, one page as it will download, or that page's corners. */
  const view = state.phase;
  const settings = useScanSettings();
  const board = useScanBoard();
  const { results, turnedPreviews } = board;
  // The queues, caches and latest-render values async callbacks read (state/scanWork.ts).
  const { work, editorRef, headingRef, unmountedRef } = useScanRefs();
  // A forced update waits while there are photos, as an open document's would.
  useHoldUpdate(pages.length > 0, 'open');
  work.pages = pages;
  work.defaultFilter = settings.defaultFilter;
  const { rating, wide } = useScanRating();

  const { processed, addFiles, retakeFile, draft } = useScanPages({ pages, setPages, work, unmountedRef, dispatch, settings, ...board });

  const { key, prepared, outputName, fileName, downloadFlow } = useScanExport({
    pages, failedIds, ...settings, work, processed, unmountedRef, ...board, quietPolicy, navigate,
  });


  const { listRef, focusIdRef } = usePhotoTileList({
    // Each of these is its own list on screen: the phone grid and the desktop table.
    active: pages.length > 0 && (wide ? 'table' : 'phone'),
    items: pages,
    ghostClass: styles['is-ghost'],
    onReorder: (oldIndex, newIndex) => {
      setPages((current) => reorderEntries(current, oldIndex, newIndex));
      recordAction('reorder');
    },
  });

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const selectedIndex = selected ? pages.indexOf(selected) : -1;
  const { showResult } = useScanView({
    state, dispatch, work, hasPages: pages.length > 0, selected, editorRef, headingRef, listRef, unmountedRef, ...board,
  });

  const { findPage, removePage, undoRemove, reset } = createPageActions({ pages, view, failedIds, setPages, work, unmountedRef, dispatch, focusIdRef, ...board, ...settings });
  const edit = createEditActions({ pages, selected, selectedIndex, failedIds, setPages, dispatch, focusIdRef, showResult, retakeFile, removePage, ...board, ...settings });

  const viewfinder = cameraProps({ camera: state.camera, pages, results, dispatch, addFiles, retakePage: edit.retakePage, view });
  const openMany = () => dispatch({ type: 'cameraOpened', camera: { mode: 'many' } });
  const viewerMode = view === 'table' ? null : view;

  const shown = key === null ? undefined : work.shown.get(key);
  const limitNote = key !== null && work.missedKeys.has(key) ? t.limitMissed : undefined;
  const output = {
    prepared,
    flow: downloadFlow,
    fileName,
    detail: downloadDetail(prepared, pages.length, englishShellMessages, t.dir),
    outputName,
    isRenaming: settings.isRenaming,
    onRename: settings.rename,
    onEditingChange: settings.setIsRenaming,
    onShowFailedPage: edit.showFailedPage,
    draftStatus: draft.status,
  };
  const options = { pageSize: settings.pageSize, limit: settings.limit, onPageSize: settings.choosePageSize, onLimit: settings.chooseLimit, limitNote };
  /** What the page viewer shows and does. */
  const onePage = {
    pages, selectedIndex, results, turnedPreviews, finding, findMissed, failedIds, pageSize: settings.pageSize,
    built: { shown, ready: prepared.status === 'ready', size: prepared.size },
  };
  const pageActions = pageViewActions({ edit, findPage, removePage, selected, dispatch });
  /** What the desktop workspace and the phone's table both read. */
  const loaded = {
    pages,
    results,
    resultKeyOf: resultKey,
    failedIds,
    listRef,
    onOpen: edit.openPage,
    onTileKeyDown: edit.onTileKeyDown,
    onRotate: edit.rotatePage,
    onRemove: removePage,
    onFiles: addFiles,
    onCamera: openMany,
    output,
    options,
    rating,
  };

  return (
    <BasePdfTool
      hasFiles={pages.length > 0}
      onFilesAdded={addFiles}
      intake={{ accept: SCAN_ACCEPT, needsPdfjs: false }}
      identity={{ label: pagesLabel(pages.length, englishShellMessages), hidden: true }}
      empty={{ art: <ScanVerb />, action: <StartScanButton onFiles={addFiles} onStart={openMany} />, actionLeads: true, pickLabel: t.choosePhotos, message: t.dropHere }}
      draft={{ checking: pages.length === 0 && draft.checking }}
      clearAll={{ onClear: reset, summary: pagesLabel(pages.length, englishShellMessages) }}
      analytics={{ tool: 'scan-to-pdf', status: prepared.status === 'error' ? 'error' : downloadFlow.tap }}
      owns={{ rating: true }}
    >
      <ScanSkippedNotice names={board.rejectedFiles} />

      {pages.length > 0 && selected && (
        <ToolShellBridge>
          {(bridge) => (wide ? (
            <ScanWorkspace {...loaded} bridge={bridge} />
          ) : (
            <ScanPhoneTable {...loaded} onPickMore={bridge.requestReplace} onClear={bridge.requestClear} />
          ))}
        </ToolShellBridge>
      )}

      {viewerMode && selected && (
        <ScanPageViewer
          {...onePage}
          refs={{ editor: editorRef, heading: headingRef }}
          selected={selected}
          view={viewerMode}
          actions={{ ...pageActions, onSelect: edit.selectPage }}
          undo={board.removal && { position: board.removal.index + 1, onUndo: undoRemove }}
        />
      )}

      {board.removal && !(viewerMode && selected) && <ScanUndoChip position={board.removal.index + 1} onUndo={undoRemove} />}

      {viewfinder && <ScanCamera {...viewfinder} />}

      <p class="sr-only" role="status" aria-live="polite">{board.announcement}</p>
    </BasePdfTool>
  );
});
