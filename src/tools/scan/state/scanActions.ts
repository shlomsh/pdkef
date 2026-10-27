import type { MutableRef } from 'preact/hooks';
import { moveEntry } from '../../../lib/pageOrder.js';
import { reportError } from '../../../lib/errorReport.ts';
import { reportEdit } from '../../../lib/productAnalytics.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { formatMessage } from '../../../lib/formatMessage';
import type { ScanDispatch, SetPages } from '../hooks/scanHost.ts';
import { loadPipeline } from '../lib/loadPipeline.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { Quad } from '../lib/quad.ts';
import { afterRemoval, nextUnreviewed, patchPage, tileDelta, turnPage } from '../lib/scanPages.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { PageResult, ScanPage, ScanWork } from './scanWork.ts';

interface PageActionsInput {
  pages: ScanPage[];
  view: 'corners' | 'result';
  setPages: SetPages;
  setResults: (results: Record<number, PageResult>) => void;
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
  const { pages, view, setPages, setResults, setCustomName, setRejectedFiles, forgetTurned, work, unmountedRef, dispatch, announce, focusIdRef } = input;

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
        if (work.removed.has(page.id)) return;
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

  const reset = () => {
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
    const { index, removed, left, neighbour, nextNew } = afterRemoval(pages, id, view);
    if (!removed) return;
    if (removed.preview) URL.revokeObjectURL(removed.preview);
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
    setPages(left);
    dispatch({ type: 'pageRemoved', id, neighbourId: neighbour?.id ?? null, nextNewId: nextNew?.id ?? null });
    focusIdRef.current = neighbour?.id ?? null;
    announce(formatMessage(t.announceRemoved, { position: index + 1 }));
    recordAction('remove_file');
    if (left.length === 0) reset();
  };

  /** Remove from the corners box: the next photo comes into view, and this one's error box was not its height. */
  const removeFromCorners = (id: number) => {
    dispatch({ type: 'scrollFocusRequested', top: true });
    removePage(id);
  };

  return { findPage, removePage, removeFromCorners, reset };
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
}

/** The actions that change a page: its order, corners, look and turns, and moving on from the corners. */
export function createEditActions(input: EditActionsInput) {
  const { pages, selected, selectedIndex, failedIds, setPages, setDefaultFilter, dispatch, announce, focusIdRef, showResult } = input;

  const onTileKeyDown = (event: KeyboardEvent, id: number) => {
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

  const rotatePage = () => {
    if (!selected) return;
    setPages((current) => turnPage(current, selected.id));
    announce(formatMessage(t.announceRotated, { position: selectedIndex + 1 }));
    recordAction('change_setting');
    reportEdit('scan-to-pdf');
  };

  // A tap on the held-back Download: to the first photo that could not be read, where Remove is.
  const showFailedPage = () => {
    const failed = pages.find((p) => failedIds.includes(p.id));
    if (!failed) return;
    dispatch({ type: 'failedPageShown', id: failed.id });
  };

  // Use these corners: on to the next new photo still waiting for a look, or to the result.
  const approveCorners = () => {
    if (!selected) return;
    setPages((current) => patchPage(current, selected.id, { reviewed: true }));
    const next = nextUnreviewed(pages, selected.id);
    if (next) dispatch({ type: 'pageSelected', id: next.id });
    else showResult(selected);
    dispatch({ type: 'scrollFocusRequested', top: true, focus: true });
    announce(next ? formatMessage(t.announceCornersOf, { position: pages.indexOf(next) + 1 }) : t.announceResult);
    recordAction('move_mark');
  };

  /** Done in the corners box: to the result as it is. */
  const finishCorners = () => {
    if (!selected) return;
    showResult(selected);
    dispatch({ type: 'scrollFocusRequested', top: true, focus: true });
    announce(t.announceResult);
  };

  /** From the editor head: the corners, with focus on the heading. */
  const adjustCorners = () => {
    dispatch({ type: 'cornersOpened', focus: true });
    announce(formatMessage(t.announceCornersOf, { position: selectedIndex + 1 }));
  };

  return { onTileKeyDown, commitCorners, chooseLook, rotatePage, showFailedPage, approveCorners, finishCorners, adjustCorners };
}
