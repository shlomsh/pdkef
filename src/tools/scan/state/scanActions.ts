import type { MutableRef } from 'preact/hooks';
import { moveEntry } from '#lib/pages/pageOrder.js';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { reportEdit } from '#lib/telemetry/productAnalytics.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { ScanDispatch, SetPages } from '../hooks/scanHost.ts';
import { UNDO_WINDOW_MS } from '#shell/useUndoWindow.ts';
import { loadPipeline } from '../lib/loadPipeline.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Spine } from '#lib/pageEnhance/spine.ts';
import { afterRemoval, newPage, patchPage, restoredPages, splitPage, tileDelta, turnPage } from '../lib/scanPages.ts';
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

interface PageActionsInput {
  pages: ScanPage[];
  view: 'table' | 'corners' | 'result' | 'split';
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

  // Find the page again, on request: the person asked, so what it finds becomes their corners. A PDF sheet
  // has no paper edge for the guess to read, so it goes back to the corners it opened with.
  const findPage = (page: ScanPage) => {
    dispatch({ type: 'findStarted', id: page.id });
    const found = page.sheet
      ? Promise.resolve(page.opened)
      : work.enqueue(async () => (work.removed.has(page.id) ? null : (await loadPipeline()).guessPage(work.previewBlobs.get(page.id) ?? page.file)));
    found
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

  const clearPages = () => {
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
    // The last page ends the scan, and a page still being read has nothing to bring back: both go at once.
    const held = left.length > 0 && removed.guessed && (removed.preview !== null || failedIds.includes(id));
    if (!held) dropPageWork(input, removed);
    setPages(left);
    dispatch({ type: 'pageRemoved', id, neighbourId: neighbour?.id ?? null });
    focusIdRef.current = neighbour?.id ?? null;
    announce(formatMessage(t.announceRemoved, { position: index + 1 }));
    recordAction('remove_file');
    if (left.length === 0) { clearPages(); return; }
    if (!held) return;
    const removal: HeldRemoval = { page: removed, index, failed: failedIds.includes(id) };
    work.removal = removal;
    setRemoval(removal);
    work.removalTimer = setTimeout(settleRemoval, UNDO_WINDOW_MS);
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

  // Clear all, the person's own choice: unlike the last page going, it ends a PDF still coming in too.
  const reset = () => {
    work.cancelPdfImport();
    clearPages();
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
  /** A new page through the queue for its preview and size (useScanPages); the corners it arrives with are kept. */
  inspect: (page: ScanPage) => void;
  work: ScanWork;
  setResults: DropHost['setResults'];
  forgetTurned: DropHost['forgetTurned'];
  unmountedRef: MutableRef<boolean>;
}

/** The actions that change a page: its order, corners, look and turns, and moving on from the corners. */
export function createEditActions(input: EditActionsInput) {
  const { pages, selected, selectedIndex, failedIds, setPages, setDefaultFilter, dispatch, announce, focusIdRef, showResult, retakeFile, removePage, inspect, work, unmountedRef } = input;

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
    // Moving a corner answers a split question: the sheet is one page.
    setPages((current) => patchPage(current, id, { quad, edited: true, question: null }));
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

  const rotatePage = (id: number, by: 1 | -1 = 1) => {
    const position = pages.findIndex((p) => p.id === id) + 1;
    if (position === 0) return;
    setPages((current) => turnPage(current, id, by));
    announce(formatMessage(by === 1 ? t.announceRotated : t.announceRotatedLeft, { position }));
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

  /** A tap on a page of the table opens its result, or its question when it still asks one. */
  const openPage = (id: number) => dispatch(pages.find((p) => p.id === id)?.question ? { type: 'splitAsked', id } : { type: 'pageOpened', id });
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

  /** From the page head: the sheet's question again. */
  const askSplit = () => { if (selected) dispatch({ type: 'splitAsked', id: selected.id }); };

  /** One page: the sheet is as it opened, and its result shows. */
  const answerOnePage = () => {
    if (!selected) return;
    setPages((current) => patchPage(current, selected.id, { question: null }));
    approveCorners();
  };

  /** Two pages: the sheet becomes two, each read on its own along the line the person placed. */
  const answerTwoPages = (spine: Spine) => {
    const page = selected;
    if (!page?.question) return;
    const { rightToLeft } = page.question;
    dispatch({ type: 'splitStarted', id: page.id });
    work.enqueue(async () => (await loadPipeline()).splitQuads(work.previewBlobs.get(page.id) ?? page.file, spine))
      .then((quads) => {
        if (quads.length < 2) throw new Error('the split gave fewer than two pages');
        return quads;
      })
      .then((quads) => quads, (err) => {
        reportError('pdf_tool_run', err, 'scan_split_sheet');
        return null;
      })
      .then((quads) => {
        if (unmountedRef.current) return;
        dispatch({ type: 'splitEnded', id: page.id, failed: !quads });
        // Answered another way, or taken out, while this ran: nothing to split any more.
        if (!quads || !work.pages.some((p) => p.id === page.id && p.question)) return;
        const fresh = (rightToLeft ? [...quads].reverse() : quads).map((quad): ScanPage => (
          { ...newPage(page.file, page.filter), quad, guessed: true, found: true, edited: true, sheet: true, opened: quad, question: null }
        ));
        setPages((current) => splitPage(current, page.id, fresh));
        dropPageWork(input, page);
        dispatch({ type: 'splitMade', oldId: page.id, newId: fresh[0].id });
        for (const added of fresh) inspect(added);
        dispatch({ type: 'scrollFocusRequested', top: true, focus: true });
        announce(formatMessage(t.announceSplit, { position: selectedIndex + 1 }));
        recordAction('change_setting');
        reportEdit('scan-to-pdf');
      });
  };

  return { onTileKeyDown, commitCorners, chooseLook, rotatePage, showFailedPage, approveCorners, adjustCorners, askSplit, answerOnePage, answerTwoPages, openPage, selectPage, stepPage, closePage, retakePage };
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
    onRotateLeft: () => { if (selected) edit.rotatePage(selected.id, -1); },
    onAdjustCorners: edit.adjustCorners,
    onCommit: edit.commitCorners,
    onFind: findPage,
    onApprove: edit.approveCorners,
    onAskSplit: edit.askSplit,
    onOnePage: edit.answerOnePage,
    onTwoPages: edit.answerTwoPages,
    onDone: edit.closePage,
    onStep: edit.stepPage,
    onRetake: (file: File) => { if (selected) edit.retakePage(selected.id, file); },
    onRetakeCamera: () => { if (selected) dispatch({ type: 'retakeOpened', pageId: selected.id }); },
    onRemovePage: removePage,
    onChooseLook: edit.chooseLook,
  };
}
