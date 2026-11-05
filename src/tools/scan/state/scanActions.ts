import type { MutableRef } from 'preact/hooks';
import { moveEntry } from '#lib/pages/pageOrder.js';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { reportEdit } from '#lib/telemetry/productAnalytics.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { ScanDispatch, SetPages } from '../hooks/scanHost.ts';
import { loadPipeline } from '../lib/loadPipeline.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { afterRemoval, patchPage, restoredPages, tileDelta, turnPage } from '../lib/scanPages.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { HeldRemoval, PageResult, ScanPage, ScanWork } from './scanWork.ts';

interface DropHost {
  work: ScanWork;
  setResults: (results: Record<number, PageResult>) => void;
  forgetTurned: (match: (key: string) => boolean) => void;
}

/** Let go of everything a page owns: its preview, turned previews, bytes, cached runs and result.
 * A removed page and a retaken one (replaced by a new photo) both end this way. */
export function dropPageWork({ work, setResults, forgetTurned }: DropHost, page: ScanPage) {
  const id = page.id;
  if (page.preview) URL.revokeObjectURL(page.preview);
  forgetTurned((k) => k.startsWith(`${id}|`));
  work.previewBlobs.delete(id);
  work.removed.add(id);
  work.dropCached(id);
  if (work.results[id]) {
    URL.revokeObjectURL(work.results[id].url);
    URL.revokeObjectURL(work.results[id].thumbUrl);
    const { [id]: _gone, ...rest } = work.results;
    work.results = rest;
    setResults(rest);
  }
}

/** How long Remove can be taken back (docs/ux-design-guidelines.md, guideline 6). */
const UNDO_MS = 5000;

interface PageActionsInput {
  pages: ScanPage[];
  view: 'table' | 'corners' | 'result';
  setPages: SetPages;
  setResults: (results: Record<number, PageResult>) => void;
  setRemoval: (removal: HeldRemoval | null) => void;
  failedIds: number[];
  setCustomName: (name: string | null) => void;
  setRejectedFiles: (names: string[]) => void;
  forgetTurned: (match: (key: string) => boolean) => void;
  work: ScanWork;
  unmountedRef: MutableRef<boolean>;
  dispatch: ScanDispatch;
  announce: (text: string) => void;
  focusIdRef: MutableRef<number | null>;
}

/** The actions that find a page again, take a page away, or start over. */
export function createPageActions(input: PageActionsInput) {
  const { pages, failedIds, setPages, setResults, setRemoval, setCustomName, setRejectedFiles, forgetTurned, work, unmountedRef, dispatch, announce, focusIdRef } = input;

  // Find the page again, on request: the person asked, so what it finds becomes their corners.
  const findPage = (page: ScanPage) => {
    dispatch({ type: 'findStarted', id: page.id });
    work.enqueue(async () => (work.removed.has(page.id) ? null : (await loadPipeline()).guessPage(work.previewBlobs.get(page.id) ?? page.file)))
      .then((quad) => quad, (err) => {
        reportError('pdf_tool_run', err, 'scan_find_page');
        return null;
      })
      .then((quad) => {
        if (unmountedRef.current) return;
        dispatch({ type: 'findEnded' });
        // A page taken out (even if Undo could bring it back) has no use for a guess.
        if (work.removed.has(page.id) || work.removal?.page.id === page.id) return;
        if (!quad) {
          dispatch({ type: 'findMissed', id: page.id });
          announce(t.findMissed);
          return;
        }
        dispatch({ type: 'findFound', id: page.id });
        setPages((current) => patchPage(current, page.id, { quad, edited: true, found: true }));
        announce(t.pageFoundAnnounce);
        recordAction('change_setting');
      });
  };

  // Let the held page go for good. It reads `work`, not this render's values, so a timer from an older render settles right.
  const settleRemoval = () => {
    clearTimeout(work.removalTimer);
    const held = work.removal;
    if (!held) return;
    work.removal = null;
    setRemoval(null);
    dropPageWork(input, held.page);
  };

  const reset = () => {
    settleRemoval();
    for (const url of work.urls) URL.revokeObjectURL(url);
    work.processing.clear();
    for (const page of work.pages) work.removed.add(page.id);
    work.results = {};
    work.forgetShown();
    work.previewBlobs.clear();
    forgetTurned(() => true);
    setPages([]);
    setResults({});
    dispatch({ type: 'cleared' });
    setCustomName(null);
    setRejectedFiles([]);
    work.resetDownloadFlow();
    announce(t.announceCleared);
  };

  const removePage = (id: number) => {
    settleRemoval();
    const { index, removed, left, neighbour } = afterRemoval(pages, id);
    if (!removed) return;
    // The last page ends the scan, and a photo still being read has nothing to bring back: both go at once.
    const held = left.length > 0 && removed.guessed;
    if (!held) dropPageWork(input, removed);
    setPages(left);
    dispatch({ type: 'pageRemoved', id, neighbourId: neighbour?.id ?? null });
    focusIdRef.current = neighbour?.id ?? null;
    announce(formatMessage(t.announceRemoved, { position: index + 1 }));
    recordAction('remove_file');
    if (left.length === 0) { reset(); return; }
    if (!held) return;
    const removal: HeldRemoval = { page: removed, index, failed: failedIds.includes(id) };
    work.removal = removal;
    setRemoval(removal);
    work.removalTimer = setTimeout(settleRemoval, UNDO_MS);
  };

  // Everything the page owned was kept, so it comes back whole: corners, look, turns, result and its place.
  const undoRemove = () => {
    const held = work.removal;
    if (!held) return;
    clearTimeout(work.removalTimer);
    work.removal = null;
    setRemoval(null);
    setPages((current) => restoredPages(current, held.page, held.index));
    dispatch({ type: 'pageRestored', id: held.page.id, failed: held.failed });
    focusIdRef.current = held.page.id;
    announce(formatMessage(t.announceRestored, { position: held.index + 1 }));
    recordAction('undo');
  };

  return { findPage, removePage, undoRemove, reset };
}

interface EditActionsInput {
  pages: ScanPage[];
  selected: ScanPage | undefined;
  selectedIndex: number;
  failedIds: number[];
  setPages: SetPages;
  setDefaultFilter: (filter: ScanFilter) => void;
  dispatch: ScanDispatch;
  announce: (text: string) => void;
  focusIdRef: MutableRef<number | null>;
  showResult: (page: ScanPage) => void;
  removePage: (id: number) => void;
  /** Swap page `id` for a new photo in the same place (useScanPages). */
  retakeFile: (id: number, file: File) => void;
}

/** The actions that change a page: its order, corners, look and turns, and moving on from the corners. */
export function createEditActions(input: EditActionsInput) {
  const { pages, selected, selectedIndex, failedIds, setPages, setDefaultFilter, dispatch, announce, focusIdRef, showResult, retakeFile, removePage } = input;

  const onTileKeyDown = (event: KeyboardEvent, id: number) => {
    if (!event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      // By position, so R is the same key on a Hebrew keyboard. A held key acts once: Undo keeps one page.
      if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) rotatePage(id); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (!event.repeat) removePage(id); return; }
    }
    const delta = tileDelta(event);
    if (delta === 0) return;
    const next = moveEntry(pages, id, delta);
    if (next === pages) return;
    event.preventDefault();
    focusIdRef.current = id;
    setPages(next);
    announce(formatMessage(t.announceMoved, { position: next.findIndex((p: ScanPage) => p.id === id) + 1, total: next.length }));
    recordAction('reorder');
  };

  const commitCorners = (id: number, quad: Quad) => {
    setPages((current) => patchPage(current, id, { quad, edited: true }));
    recordAction('move_mark');
    reportEdit('scan-to-pdf');
  };

  // The look is the selected page's own; it also becomes the look for the next new photo.
  const chooseLook = (next: ScanFilter) => {
    if (!selected || next === selected.filter) return;
    setPages((current) => patchPage(current, selected.id, { filter: next }));
    setDefaultFilter(next);
    recordAction('change_setting');
    reportEdit('scan-to-pdf');
  };

  const rotatePage = (id: number) => {
    const position = pages.findIndex((p) => p.id === id) + 1;
    if (position === 0) return;
    setPages((current) => turnPage(current, id));
    announce(formatMessage(t.announceRotated, { position }));
    recordAction('change_setting');
    reportEdit('scan-to-pdf');
  };

  // A tap on the held-back Download: to the first photo that could not be read, where Remove is.
  const showFailedPage = () => {
    const failed = pages.find((p) => failedIds.includes(p.id));
    if (!failed) return;
    dispatch({ type: 'failedPageShown', id: failed.id });
  };

  // Use these corners: back to the result, on the same page.
  const approveCorners = () => {
    if (!selected) return;
    showResult(selected);
    dispatch({ type: 'scrollFocusRequested', top: true, focus: true });
    announce(t.announceResult);
    recordAction('move_mark');
  };

  /** A tap on a page of the table opens its result. */
  const openPage = (id: number) => dispatch({ type: 'pageOpened', id });
  /** A swipe in the viewer, or a step there, reached this page. */
  const selectPage = (id: number) => dispatch({ type: 'pageSelected', id });
  /** One page back or on in the viewer; the ends stay where they are. */
  const stepPage = (delta: 1 | -1) => {
    const next = pages[selectedIndex + delta];
    if (next) selectPage(next.id);
  };
  /** Back to the table of all the pages. */
  const closePage = () => dispatch({ type: 'tableShown' });
  /** Replace page `id` with a new photo, in place. */
  const retakePage = (id: number, file: File) => retakeFile(id, file);

  /** From the editor head: the corners, with focus on the heading. */
  const adjustCorners = () => {
    dispatch({ type: 'cornersOpened', focus: true });
    announce(formatMessage(t.announceCornersOf, { position: selectedIndex + 1 }));
  };

  return { onTileKeyDown, commitCorners, chooseLook, rotatePage, showFailedPage, approveCorners, adjustCorners, openPage, selectPage, stepPage, closePage, retakePage };
}

interface PageViewInput {
  edit: ReturnType<typeof createEditActions>;
  findPage: (page: ScanPage) => void;
  removePage: (id: number) => void;
  selected: ScanPage | undefined;
  dispatch: ScanDispatch;
}

/** What a shown page can do, the same beside the desktop's pages and in the phone's viewer. */
export function pageViewActions({ edit, findPage, removePage, selected, dispatch }: PageViewInput) {
  return {
    onRotate: () => { if (selected) edit.rotatePage(selected.id); },
    onAdjustCorners: edit.adjustCorners,
    onCommit: edit.commitCorners,
    onFind: findPage,
    onApprove: edit.approveCorners,
    onDone: edit.closePage,
    onStep: edit.stepPage,
    onRetake: (file: File) => { if (selected) edit.retakePage(selected.id, file); },
    onRetakeCamera: () => { if (selected) dispatch({ type: 'retakeOpened', pageId: selected.id }); },
    onRemovePage: removePage,
    onChooseLook: edit.chooseLook,
  };
}
