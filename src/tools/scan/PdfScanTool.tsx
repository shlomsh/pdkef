import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'preact/hooks';
import { Check, Crop, Eraser, FileSignature, ImagePlus, Maximize, RotateCw, Shrink, Trash2, WandSparkles } from 'lucide-preact';
import { throwIfAborted } from '../../lib/abort.js';
import { moveEntry, reorderEntries } from '../../lib/pageOrder.js';
import { PHOTO_ACCEPT as ACCEPT, PHOTO_ACCEPTED_TYPES as ACCEPTED_TYPES, usePhotoTileList } from '../../lib/usePhotoTileList.ts';
import { usePreparedOutput } from '../../lib/usePreparedOutput.ts';
import type { QuietPolicy } from '../../lib/quietPrepare.ts';
import { useHandoffFilesIntake } from '../../lib/useHandoffIntake.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { reportEdit } from '../../lib/productAnalytics.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { formatFileSize } from '../../lib/format.js';
import { formatMessage } from '../../lib/formatMessage';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/IslandErrorBoundary.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import DownloadElement from '../../shell/DownloadElement.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import RatingPrompt, { useDownloaded } from '../../shell/RatingPrompt.tsx';
import OutputName from '../../shell/OutputName.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import FinishRow from '../../shell/pageWorkspace/FinishRow.tsx';
import PhoneFinish from '../../shell/pageWorkspace/PhoneFinish.tsx';
import { downloadDetail, pagesLabel } from '../../shell/pageWorkspace/pageCounts.ts';
import PageWorkspace, { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { useDownloadFlow, type HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import OptionRow, { type Option } from '../../shell/pageWorkspace/OptionRow.tsx';
import { useFloorHeight } from '../../shell/pageWorkspace/useFloorHeight.ts';
import { useMediaQuery } from './hooks/useMediaQuery.ts';
import { englishShellMessages } from '../../shell/shellMessages';
import CornerEditor from './components/CornerEditor.tsx';
import FullScreenButton from './components/FullScreenButton.tsx';
import TakePhotoButton from './components/TakePhotoButton.tsx';
import ResultPage from './components/ResultPage.tsx';
import { placeImage } from '../../lib/imagePage.js';
import { playFlatten, relativeBox, type FlattenFrom } from './lib/flattenAnimation.ts';
import ScanVerb from './verb/ScanVerb.tsx';
import { FULL_QUAD, quadKey, rotateQuad, turnedQuad, unturnedQuad, type Quad } from './lib/quad.ts';
import { SIZE_LIMITS, type SizeLimitId } from './lib/scanBudget.ts';
import type { ScanFilter } from './lib/filters.ts';
import type { BuiltPage, PageSize, ProcessedPage } from './lib/scanPipeline.ts';
import { initialScanState, reduceScan } from './state/scanState.ts';
import { ScanWork, type PageResult, type ScanPage } from './state/scanWork.ts';
import { englishScanMessages as t } from './messages.ts';
import styles from './PdfScanTool.module.css';

const HANDOFF_TOOLS: HandoffTool[] = ['sign', 'redact', 'compress'];

/** Fit pages print at 200 dpi (scanPipeline.ts); the same rule places a page before the build lands. */
const FIT_POINTS_PER_PIXEL = 72 / 200;

let nextId = 0;
const resultKey = (page: ScanPage) => `${page.id}|${quadKey(page.quad)}|${page.filter}|${page.turns}`;
/** The corners the warp gets: the photo's own, one place on per quarter turn (quad.ts). */
const pageQuad = (page: ScanPage) => rotateQuad(page.quad, page.turns);

type Pipeline = typeof import('./lib/scanPipeline.ts');
let pipelinePromise: Promise<Pipeline> | null = null;
// The warp, filter and edge code load once, when the first photo arrives (docs/scan-to-pdf.md).
const loadPipeline = () => (pipelinePromise ??= import('./lib/scanPipeline.ts'));

export interface PdfScanToolProps {
  quietPolicy?: QuietPolicy;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

export default withIslandBoundary(function PdfScanTool({ quietPolicy, navigate }: PdfScanToolProps = {}) {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [state, dispatch] = useReducer(reduceScan, initialScanState);
  const { selectedId, finding, findMissed, failedIds, full } = state;
  /** The centre shows the page as it will download; corners are a mode you step into. */
  const view = state.phase;
  /** A new photo starts with the look last chosen. */
  const [defaultFilter, setDefaultFilter] = useState<ScanFilter>('document');
  const [pageSize, setPageSize] = useState<PageSize>('fit');
  const [limit, setLimit] = useState<SizeLimitId>('none');
  const [customName, setCustomName] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [results, setResults] = useState<Record<number, PageResult>>({});
  /** Each turned page's preview, turned the same way for the corner editor, by `${id}|${turns}`. */
  const [turnedPreviews, setTurnedPreviews] = useState<Record<string, string>>({});
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  /** Bumped when a build lands, so the per-key maps below are read again. */
  const [, setBuilt] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  // The queues, caches and latest-render values async callbacks read (state/scanWork.ts).
  const workRef = useRef<ScanWork | null>(null);
  workRef.current ??= new ScanWork();
  const work = workRef.current;
  const { enqueue, dropCached, keepShown, forgetShown } = work;
  const editorRef = useRef<HTMLElement | null>(null);
  /** The photo and the pages: on desktop they fill the card down to the first screen's foot. */
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLParagraphElement | null>(null);
  /** Async work that finishes after the island is gone makes no object URLs and sets no state. */
  const unmountedRef = useRef(false);
  const stageHeight = useFloorHeight(workbenchRef, pages.length > 0);
  work.pages = pages;
  work.defaultFilter = defaultFilter;

  useHoldUpdate(pages.length > 0, 'open');
  const downloaded = useDownloaded();
  /** One rating ask, in the place that has room for it: two would both try to ask (RatingPrompt). */
  const wide = useMediaQuery('(min-width: 1024px)');
  const rating = <RatingPrompt tool="scan-to-pdf" downloaded={downloaded} messages={englishShellMessages} />;

  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => (previous === text ? `${text} ` : text));
  }, []);

  /** True while `key` is what the page on screen and the current look ask for. */
  const isCurrentKey = (key: string) => {
    const id = Number(key.slice(0, key.indexOf('|')));
    const live = work.pages.find((p) => p.id === id);
    return !!live && resultKey(live) === key;
  };

  /** The processed page for these corners and this look: cached, so the strip and the build share one run. */
  const processed = useCallback((page: ScanPage): Promise<ProcessedPage> => {
    const key = resultKey(page);
    const cached = work.processing.get(key);
    if (cached) return cached;
    const run = enqueue(async () => {
      // A corner moved again, the look changed or the page went while this waited: skip the decode and warp.
      throwIfAborted({ aborted: !isCurrentKey(key) });
      return (await loadPipeline()).processPage(page.file, pageQuad(page), page.filter);
    });
    work.processing.set(key, run);
    run.then(() => {
      if (!isCurrentKey(key)) work.processing.delete(key);
    }, () => {
      // expected: a failed run is reported by its caller; dropping it here lets the next try run again
      work.processing.delete(key);
    });
    return run;
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const accepted = incoming.filter((f) => ACCEPTED_TYPES.includes(f.type));
    const rejected = incoming.filter((f) => !ACCEPTED_TYPES.includes(f.type));
    setRejectedFiles(rejected.map((f) => f.name));
    if (accepted.length === 0) return;
    const added: ScanPage[] = accepted.map((file) => ({
      id: nextId++, file, preview: null, aspect: null, filter: work.defaultFilter, reviewed: false,
      quad: FULL_QUAD, turns: 0, guessed: false, edited: false, found: null,
    }));
    setPages((current) => [...current, ...added]);
    // A new photo is shown first as itself, corners on top, to approve or adjust (Use these corners).
    // Also brings the new photo's corners into view, wherever the page was scrolled to pick it.
    dispatch({ type: 'photosAdded', firstId: added[0].id });
    announce(added.length === 1 ? t.announceAddedOne : formatMessage(t.announceAddedMany, { count: added.length }));
    recordAction('add_files');
    for (const page of added) {
      enqueue(async () => (work.removed.has(page.id) ? null : (await loadPipeline()).inspectPhoto(page.file)))
        .then((seen) => seen, (err) => {
          reportError('pdf_tool_run', err, 'scan_inspect_photo');
          return null;
        })
        .then((seen) => {
          if (work.removed.has(page.id) || unmountedRef.current) return;
          // A photo that could not be decoded: say so (failedIds), never "finding edges" forever.
          if (!seen) dispatch({ type: 'pageFailed', id: page.id });
          if (seen) work.previewBlobs.set(page.id, seen.preview);
          const preview = seen ? URL.createObjectURL(seen.preview) : null;
          const quad = seen?.quad ?? null;
          setPages((current) => current.map((p) => (
            p.id !== page.id ? p : {
              ...p,
              guessed: true,
              found: !!quad,
              quad: p.edited || !quad ? p.quad : quad,
              preview,
              aspect: seen ? seen.width / seen.height : null,
            }
          )));
        });
    }
  }, []);

  // Photos handed over from Image to PDF ("Clean it up as a scan") arrive like a pick.
  useHandoffFilesIntake('scan-to-pdf', (files) => addFiles(files));

  // Every guessed page gets its result for the current corners and look, one at a time.
  useEffect(() => {
    for (const page of pages) {
      // Not yet inspected, or inspected and unreadable (failedIds already says so): nothing to process.
      if (!page.guessed || page.preview === null) continue;
      const key = resultKey(page);
      if (work.results[page.id]?.key === key || work.watching.has(key)) continue;
      work.watching.add(key);
      processed(page).then((result) => {
        work.watching.delete(key);
        if (unmountedRef.current || !isCurrentKey(key) || work.results[page.id]?.key === key) return;
        const previous = work.results[page.id];
        if (previous) {
          URL.revokeObjectURL(previous.url);
          URL.revokeObjectURL(previous.thumbUrl);
        }
        // Older corners for this page will not come back; let their bytes go.
        dropCached(page.id, key);
        work.results = { ...work.results, [page.id]: { key, url: URL.createObjectURL(result.blob), thumbUrl: URL.createObjectURL(result.thumb), page: result } };
        setResults(work.results);
        dispatch({ type: 'failureCleared', id: page.id });
      }, (err) => {
        work.watching.delete(key);
        // expected: work superseded before its turn is skipped on purpose, not a failure
        if (err?.name === 'AbortError') return;
        reportError('pdf_tool_run', err, 'scan_process_page');
        dispatch({ type: 'pageFailed', id: page.id });
      });
    }
  }, [pages]);

  // Revoke every live object URL on unmount.
  work.urls = [
    ...pages.flatMap((p) => (p.preview ? [p.preview] : [])),
    ...Object.values(results).flatMap((r) => [r.url, r.thumbUrl]),
    ...Object.values(turnedPreviews),
    ...[...work.shown.values()].flatMap((kept) => kept.pages.map((p) => p.url)),
  ];
  useEffect(() => {
    // Set on mount too: a dev server's hot swap runs this cleanup on a live island, then mounts it again.
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      // A dev server's hot swap keeps the island's state, photos included: only a real unmount frees them.
      if (!import.meta.hot) work.urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const allGuessed = pages.length > 0 && pages.every((p) => p.guessed) && failedIds.length === 0;
  const key = allGuessed
    ? `${pages.map((p) => resultKey(p)).join(',')}|${pageSize}|${limit}`
    : null;
  work.inputs = { pages, pageSize, limit, key };
  const prepared = usePreparedOutput({
    key,
    quietPolicy,
    build: async (signal, onProgress) => {
      const { pages: current, pageSize: size, limit: chosen, key: builtKey } = work.inputs;
      const made = await Promise.all(current.map((page) => processed(page)));
      throwIfAborted(signal);
      const budgetBytes = SIZE_LIMITS.find((l) => l.id === chosen)?.bytes ?? null;
      // Through the queue like every decode: a phone holds one photo's worth of pixels at a time.
      const fit = await enqueue(async () => (await loadPipeline()).buildScanPdf(made, { pageSize: size, budgetBytes, onProgress, signal }));
      throwIfAborted(unmountedRef.current ? { aborted: true } : signal);
      const builtAs = builtKey as string;
      if (fit.metTarget) work.missedKeys.delete(builtAs);
      else work.missedKeys.add(builtAs);
      keepShown({ key: builtAs, pages: fit.pages.map((page: BuiltPage) => ({ url: URL.createObjectURL(page.blob), place: page.place })) });
      setBuilt((n) => n + 1);
      return { blob: fit.blob, pageCount: current.length };
    },
    onBuildError: (err) => reportError('pdf_tool_run', err, 'prepare_scan'),
  });

  const outputName = customName ?? t.defaultName;
  const fileName = `${outputName}.pdf`;
  const downloadFlow = useDownloadFlow({
    prepared,
    fileName,
    // A photo that could not be read holds the PDF back: Download says so instead of preparing for good.
    blocked: prepared.status === 'error' || failedIds.length > 0 ? 'error' : null,
    announce: setAnnouncement,
    messages: { ready: t.readyAnnouncement, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
    navigate,
  });
  const { tap, downloadState, shareReady, handoffBusy, handoffFailed, requestHandoff, onDownloadTap, onRowPreparingTap, handleShare, reset: resetDownloadFlow } = downloadFlow;
  work.resetDownloadFlow = resetDownloadFlow;

  const { listRef, focusIdRef } = usePhotoTileList({
    active: pages.length > 0,
    items: pages,
    ghostClass: styles['is-ghost'],
    onReorder: (oldIndex, newIndex) => {
      setPages((current) => reorderEntries(current, oldIndex, newIndex));
      recordAction('reorder');
    },
  });

  // Bring the page's top into view: the first photos replace the tall empty state, and moving on from
  // the corners (whose buttons sit under the photo) would otherwise leave the person under the next view.
  // On desktop the whole card is the first screen (useFloorHeight), so that is the top of the page.
  const showEditorTop = (instant = false) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduce || instant ? 'auto' : 'smooth';
    if (window.matchMedia?.('(min-width: 1024px)').matches) window.scrollTo?.({ top: 0, behavior });
    else editorRef.current?.scrollIntoView?.({ block: 'start', behavior });
  };
  useEffect(() => {
    const has = pages.length > 0;
    if (has && !work.hadPages) showEditorTop();
    work.hadPages = has;
  }, [pages.length > 0]);
  // Before paint: the result's first frame already has the flatten over it. After paint, the empty paper
  // showed for one frame before the photo came back over it (Scan QA, Pixel 7).
  useLayoutEffect(() => {
    // Whatever was playing belongs to the view that just went.
    work.stopFlatten();
    work.stopFlatten = () => {};
    // Asked for by a view change, run once the new view is laid out (the scroll target moves with it).
    const { topPending, focusPending } = state;
    if (topPending || focusPending) dispatch({ type: 'scrollFocusConsumed' });
    if (focusPending) headingRef.current?.focus({ preventScroll: true });
    const from = work.flattenFrom;
    work.flattenFrom = null;
    const host = editorRef.current;
    const target = host?.querySelector<HTMLImageElement>('[data-paper] img');
    // Only when the page is already made: an empty paper has nothing to land.
    const flatten = !!(from && view === 'result' && host && target);
    // One motion at a time: with a flatten to play, the scroll jumps first and the page moves alone.
    if (topPending) showEditorTop(flatten);
    if (flatten) {
      work.stopFlatten = playFlatten(host as HTMLElement, from as FlattenFrom, target as HTMLImageElement);
    }
  }, [view, selectedId]);
  useEffect(() => () => work.stopFlatten(), []);

  // The corners full screen (state.full): the browser's own, on the editor (Sign's pattern, PdfSignTool),
  // or a fixed full-page layer where it has none for an element (iPhone Safari).
  useEffect(() => {
    const onChange = () => dispatch({ type: 'fullscreenChanged', native: document.fullscreenElement === editorRef.current });
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const enterFull = () => {
    recordAction('fullscreen');
    const el = editorRef.current;
    if (el?.requestFullscreen && document.fullscreenEnabled !== false) {
      // expected: element full screen is optional, the layer stands in
      el.requestFullscreen()?.catch(() => dispatch({ type: 'fullLayerEntered' }));
    } else dispatch({ type: 'fullLayerEntered' });
  };
  const exitFull = () => {
    // The browser's own: `full` follows its fullscreenchange, once the card is back on screen.
    if (document.fullscreenElement === editorRef.current && document.exitFullscreen) {
      // expected: the browser may already have left full screen (Esc), nothing to undo
      document.exitFullscreen()?.catch(() => dispatch({ type: 'fullExited' }));
    } else dispatch({ type: 'fullExited' });
  };
  /** Approved full screen: the result waits for the card, and the flatten starts from the photo where
   * the card shows it. Measured full screen, the page flew in from full-screen coordinates (2026-10-27). */
  const showResult = (page: ScanPage) => {
    if (full) {
      dispatch({ type: 'resultAfterFullQueued', landing: { quad: page.quad, turns: page.turns } });
      exitFull();
      return;
    }
    captureFlatten(page);
    dispatch({ type: 'resultShown' });
  };
  useLayoutEffect(() => {
    const page = state.landing;
    if (full || !page) return;
    captureFlatten(page);
    dispatch({ type: 'resultAfterFullShown' });
  }, [full]);
  // Full screen belongs to the view it was opened on (the corners, or the page as it downloads): a
  // view change brings the card back.
  useEffect(() => {
    exitFull();
  }, [view]);
  useEffect(() => () => {
    // expected: leaving the page while full screen, nothing to report
    if (document.fullscreenElement && document.fullscreenElement === editorRef.current) document.exitFullscreen?.()?.catch(() => {});
  }, []);
  // The layer: the page behind keeps still, and Esc leaves it as it leaves the browser's own.
  useEffect(() => {
    if (full !== 'layer') return undefined;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dispatch({ type: 'fullExited' }); };
    document.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [full]);

  const captureFlatten = (page: { quad: Quad; turns: number }) => {
    const host = editorRef.current;
    const frame = host?.querySelector('[data-corner-frame]');
    // The editor's own photo, already decoded: the flatten paints from it on its first frame.
    const photo = frame?.querySelector<HTMLImageElement>('img');
    if (!host || !frame || !photo) return;
    work.flattenFrom = {
      photo,
      frame: relativeBox(frame.getBoundingClientRect(), host.getBoundingClientRect()),
      quad: turnedQuad(page.quad, page.turns),
    };
  };

  // The selected page stays in view inside the pages list (a capped column from 1024px), by scrolling
  // the list alone: scrollIntoView would also move the page away from the photo on a phone. On a new
  // selection only: an added page is selected, and removing another page must leave the list where it is.
  useEffect(() => {
    const list = listRef.current;
    const tile = list?.querySelector<HTMLElement>('[data-selected]');
    if (!list || !tile) return;
    // Inset by the strip's 10px padding, which keeps the selected ring and the remove disc in the clear.
    const { top, bottom, left, right } = list.getBoundingClientRect();
    const box = { top: top + 10, bottom: bottom - 10, left: left + 10, right: right - 10 };
    const at = tile.getBoundingClientRect();
    if (at.top < box.top) list.scrollTop -= box.top - at.top;
    else if (at.bottom > box.bottom) list.scrollTop += at.bottom - box.bottom;
    if (at.left < box.left) list.scrollLeft -= box.left - at.left;
    else if (at.right > box.right) list.scrollLeft += at.right - box.right;
  }, [selectedId]);

  const onTileKeyDown = (event: KeyboardEvent, id: number) => {
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0 || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const next = moveEntry(pages, id, delta);
    if (next === pages) return;
    event.preventDefault();
    focusIdRef.current = id;
    setPages(next);
    announce(formatMessage(t.announceMoved, { position: next.findIndex((p: ScanPage) => p.id === id) + 1, total: next.length }));
    recordAction('reorder');
  };

  // Find the page again, on request: the person asked, so what it finds becomes their corners.
  const findPage = (page: ScanPage) => {
    dispatch({ type: 'findStarted', id: page.id });
    enqueue(async () => (work.removed.has(page.id) ? null : (await loadPipeline()).guessPage(work.previewBlobs.get(page.id) ?? page.file)))
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
        setPages((current) => current.map((p) => (p.id === page.id ? { ...p, quad, edited: true, found: true } : p)));
        announce(t.pageFoundAnnounce);
        recordAction('change_setting');
      });
  };

  const forgetTurned = (match: (key: string) => boolean) => {
    setTurnedPreviews((map) => {
      const left: Record<string, string> = {};
      for (const [k, url] of Object.entries(map)) {
        if (match(k)) URL.revokeObjectURL(url);
        else left[k] = url;
      }
      return left;
    });
  };
  /** The photo the corner editor shows: as photographed, or turned with the page (null while turning). */
  const shownPhoto = (page: ScanPage) => (page.turns === 0 ? page.preview : turnedPreviews[`${page.id}|${page.turns}`] ?? null);

  const commitCorners = (id: number, quad: Quad) => {
    setPages((current) => current.map((p) => (p.id === id ? { ...p, quad, edited: true } : p)));
    recordAction('move_mark');
    reportEdit('scan-to-pdf');
  };

  const removePage = (id: number) => {
    const index = pages.findIndex((p) => p.id === id);
    const removed = pages[index];
    if (!removed) return;
    if (removed.preview) URL.revokeObjectURL(removed.preview);
    forgetTurned((k) => k.startsWith(`${id}|`));
    work.previewBlobs.delete(id);
    work.removed.add(id);
    dropCached(id);
    const left = pages.filter((p) => p.id !== id);
    if (work.results[id]) {
      URL.revokeObjectURL(work.results[id].url);
      URL.revokeObjectURL(work.results[id].thumbUrl);
      const { [id]: _gone, ...rest } = work.results;
      work.results = rest;
      setResults(rest);
    }
    setPages(left);
    const neighbour = left[index] ?? left[index - 1];
    // Removing the photo under review: on to the next new one, or to the result when none is left.
    const nextNew = view === 'corners' ? left.find((p) => !p.reviewed) : undefined;
    dispatch({ type: 'pageRemoved', id, neighbourId: neighbour?.id ?? null, nextNewId: nextNew?.id ?? null });
    focusIdRef.current = neighbour?.id ?? null;
    announce(formatMessage(t.announceRemoved, { position: index + 1 }));
    recordAction('remove_file');
    if (left.length === 0) reset();
  };

  const reset = () => {
    for (const url of work.urls) URL.revokeObjectURL(url);
    work.processing.clear();
    for (const page of work.pages) work.removed.add(page.id);
    work.results = {};
    forgetShown();
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

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const selectedIndex = selected ? pages.indexOf(selected) : -1;
  const shownAspect = selected && selected.turns % 2 === 1 ? 1 / (selected.aspect ?? 0.75) : selected?.aspect ?? 0.75;

  // The look is the selected page's own; it also becomes the look for the next new photo.
  const chooseLook = (next: ScanFilter) => {
    if (!selected || next === selected.filter) return;
    setPages((current) => current.map((p) => (p.id === selected.id ? { ...p, filter: next } : p)));
    setDefaultFilter(next);
    recordAction('change_setting');
    reportEdit('scan-to-pdf');
  };

  const rotatePage = () => {
    if (!selected) return;
    setPages((current) => current.map((p) => (p.id === selected.id ? { ...p, turns: (p.turns + 1) % 4 } : p)));
    announce(formatMessage(t.announceRotated, { position: selectedIndex + 1 }));
    recordAction('change_setting');
    reportEdit('scan-to-pdf');
  };

  // A turned page shows its preview turned the same way while its corners are set (scanPipeline's turnImage).
  // Outside the queue: it is one preview-sized image, and it should not wait behind a build.
  const turnKey = selected && selected.turns !== 0 ? `${selected.id}|${selected.turns}` : null;
  useEffect(() => {
    if (view !== 'corners' || !selected || !turnKey || turnedPreviews[turnKey]) return;
    const blob = work.previewBlobs.get(selected.id);
    if (!blob) return;
    const { id, turns } = selected;
    loadPipeline().then((pipeline) => pipeline.turnImage(blob, turns)).then((turned) => {
      if (unmountedRef.current || work.removed.has(id)) return;
      setTurnedPreviews((map) => (map[turnKey] ? map : { ...map, [turnKey]: URL.createObjectURL(turned) }));
    }, (err) => reportError('pdf_tool_run', err, 'scan_turn_preview'));
  }, [view, turnKey, selected?.preview]);

  // A tap on the held-back Download: to the first photo that could not be read, where Remove is.
  const showFailedPage = () => {
    const failed = pages.find((p) => failedIds.includes(p.id));
    if (!failed) return;
    dispatch({ type: 'failedPageShown', id: failed.id });
  };

  // Use these corners: on to the next new photo still waiting for a look, or to the result.
  const approveCorners = () => {
    if (!selected) return;
    setPages((current) => current.map((p) => (p.id === selected.id ? { ...p, reviewed: true } : p)));
    const next = pages.find((p) => !p.reviewed && p.id !== selected.id);
    if (next) dispatch({ type: 'pageSelected', id: next.id });
    else showResult(selected);
    dispatch({ type: 'scrollFocusRequested', top: true, focus: true });
    announce(next ? formatMessage(t.announceCornersOf, { position: pages.indexOf(next) + 1 }) : t.announceResult);
    recordAction('move_mark');
  };

  const choose = <T,>(setter: (value: T) => void, current: T) => (next: T) => {
    if (next === current) return;
    setter(next);
    recordAction('change_setting');
    reportEdit('scan-to-pdf');
  };

  const lookOptions: Option<ScanFilter>[] = [
    { value: 'original', label: t.lookOriginal, hint: t.lookOriginalHint },
    { value: 'grayscale', label: t.lookGrayscale, hint: t.lookGrayscaleHint },
    { value: 'document', label: t.lookDocument, hint: t.lookDocumentHint },
  ];
  const sizeOptions: Option<PageSize>[] = [
    { value: 'fit', label: t.pageSizeFit, hint: t.pageSizeFitHint },
    { value: 'a4', label: t.pageSizeA4, hint: formatMessage(t.pageSizePaperHint, { size: 'A4' }) },
    { value: 'letter', label: t.pageSizeLetter, hint: formatMessage(t.pageSizePaperHint, { size: 'Letter' }) },
  ];
  const limitLabels: Record<SizeLimitId, string> = { none: t.limitNone, '2mb': t.limit2mb, '1mb': t.limit1mb, '500kb': t.limit500kb };
  const limitOptions: Option<SizeLimitId>[] = SIZE_LIMITS.map((l) => ({
    value: l.id,
    label: limitLabels[l.id],
    hint: l.bytes === null ? t.limitNoneHint : formatMessage(t.limitHint, { size: limitLabels[l.id] }),
  }));
  const limitNote = key !== null && work.missedKeys.has(key) ? t.limitMissed : undefined;

  // One set for the rail, one for phones under the pages (the rail is hidden below 1024px).
  const controls = (suffix: string) => (
    <>
      <OptionRow id={`scan-size${suffix}`} label={t.pageSizeLabel} options={sizeOptions} value={pageSize} onChange={choose(setPageSize, pageSize)} dir={t.dir} />
      <OptionRow id={`scan-limit${suffix}`} label={t.limitLabel} options={limitOptions} value={limit} onChange={choose(setLimit, limit)} dir={t.dir} note={limitNote} />
    </>
  );

  const detail = downloadDetail(prepared, pages.length, englishShellMessages, t.dir);
  const handoffItems = [
    { tool: 'sign' as HandoffTool, label: t.handoffSign, Icon: FileSignature },
    { tool: 'redact' as HandoffTool, label: t.handoffRedact, Icon: Eraser },
    { tool: 'compress' as HandoffTool, label: t.handoffCompress, Icon: Shrink },
  ];
  const analyticsStatus = prepared.status === 'error' ? 'error' : tap;

  // The page as it will download: the built PDF's own JPEG once it matches what is on screen,
  // otherwise this page's newest result laid on its paper by the same rule, shown as updating.
  const shown = key === null ? undefined : work.shown.get(key);
  const exact = !!shown && prepared.status === 'ready';
  const resultView = (page: ScanPage, index: number) => {
    if (exact && shown?.pages[index]) return { src: shown.pages[index].url, place: shown.pages[index].place, exact: true };
    const result = results[page.id];
    if (!result) return { src: null, place: null, exact: false };
    return { src: result.url, place: placeImage(result.page.width, result.page.height, pageSize, FIT_POINTS_PER_PIXEL), exact: false };
  };
  const exactDetail = exact ? formatMessage(t.resultDetail, { size: formatFileSize(prepared.size), pages: pagesLabel(pages.length, englishShellMessages) }) : undefined;

  return (
    <BasePdfTool
      emptyArt={<ScanVerb />}
      emptyAction={<TakePhotoButton onFiles={addFiles} primary />}
      hasFiles={pages.length > 0}
      analyticsTool="scan-to-pdf"
      analyticsStatus={analyticsStatus}
      onFilesAdded={addFiles}
      accept={ACCEPT}
      emptyStateMessage={t.dropHere}
      fileLabel={pagesLabel(pages.length, englishShellMessages)}
      onClearAll={reset}
      clearSummary={pagesLabel(pages.length, englishShellMessages)}
      hideIdentity
      ownsRating
      needsPdfjs={false}
    >
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: rejectedFiles[0] })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {pages.length > 0 && selected && (
        <ToolShellBridge>
          {({ requestReplace, requestClear }) => (
            <PageWorkspace
              rootAttrs={{ 'data-scan-ready': prepared.status === 'ready' || undefined }}
              phoneBar={(
                <div class={workspaceStyles['chip-bar']}>
                  {/* The next page is one tap away however far down the page is: the camera on a phone,
                      the picker with a mouse. The pages column carries these from 1024px. */}
                  <TakePhotoButton onFiles={addFiles} buttonClass={styles['bar-add']} />
                  <button type="button" class={`${styles['bar-add']} ${styles['bar-pick']}`} onClick={requestReplace}>
                    <ImagePlus size={18} aria-hidden="true" />
                    {t.addPhotos}
                  </button>
                  <PhoneFinish
                    flow={downloadFlow}
                    prepared={prepared}
                    fileName={fileName}
                    detail={detail}
                    handoffs={handoffItems}
                    labels={{ download: t.downloadShort, ready: t.readyAnnouncement, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed }}
                  />
                </div>
              )}
              heading={(
                <h2 class={workspaceStyles['doc-heading']}>
                  <span class="sr-only">{t.documentHeading}</span>
                  <OutputName name={outputName} label={t.fileNameLabel} onRename={(next) => setCustomName(next.length > 0 && next !== t.defaultName ? next : null)} onEditingChange={setIsRenaming} wrapOnPhone>
                    <span class={workspaceStyles['doc-heading-count']}>{' · '}{pagesLabel(pages.length, englishShellMessages)}</span>
                  </OutputName>
                </h2>
              )}
              railContent={(
                <>
                  {controls('')}
                  <div class={workspaceStyles['quiet-row']}>
                    <button type="button" class={workspaceStyles['quiet-button']} onClick={requestClear}>
                      <Trash2 size={16} aria-hidden="true" />
                      {englishShellMessages.clearLabel ?? t.clearAll}
                    </button>
                  </div>
                </>
              )}
              railPinned={(
                <>
                  <DownloadElement
                    state={downloadState}
                    href={prepared.status === 'ready' ? prepared.url : null}
                    fileName={fileName}
                    detail={detail}
                    pageCount={pages.length}
                    progress={prepared.progress}
                    errorMessage={failedIds.length > 0
                      ? formatMessage(t.removeToMake, { pages: pages.filter((p) => failedIds.includes(p.id)).map((p) => pages.indexOf(p) + 1).join(', ') })
                      : t.buildFailed}
                    messages={t}
                    onPreparingTap={onRowPreparingTap}
                    onErrorTap={failedIds.length > 0 ? showFailedPage : undefined}
                    onWarm={prepared.prepareNow}
                    onDownloadClick={onDownloadTap}
                    isOutputNameBeingRenamed={isRenaming}
                  />
                  <FinishRow
                    ready={prepared.status === 'ready'}
                    shareReady={shareReady}
                    onShare={handleShare}
                    busy={handoffBusy}
                    onHandoff={(tool) => { void requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
                    onWarm={prepared.prepareNow}
                    labels={{ share: t.shareLabel, compress: t.handoffCompress, sign: t.handoffSign, redact: t.handoffRedact }}
                    tools={HANDOFF_TOOLS}
                  />
                  {handoffFailed && (
                    <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
                  )}
                  {/* On a phone the ask follows the next steps; on desktop it sits under the page instead
                      (below), where the photo gives it the room: the rail had none (Scan QA). */}
                  {!wide && rating}
                </>
              )}
            >
              {prepared.status === 'error' && <ErrorMessage>{t.buildFailed}</ErrorMessage>}
              {failedIds.length > 0 && (
                <ErrorMessage>
                  {formatMessage(t.pagesFailed, { pages: pages.filter((p) => failedIds.includes(p.id)).map((p) => pages.indexOf(p) + 1).join(', ') })}
                </ErrorMessage>
              )}

              {/* From 1024px the pages are a column beside the selected page, so both stay on the first screen. */}
              <div
                ref={workbenchRef}
                class={styles.workbench}
                data-fills-stage
                data-fitted={stageHeight !== null || undefined}
                style={stageHeight !== null ? { '--scan-stage-h': `${stageHeight}px` } : undefined}
              >
              <section ref={editorRef} class={styles.editor} data-full={full ?? undefined} aria-label={formatMessage(t.pageOf, { position: selectedIndex + 1, total: pages.length })}>
                <div class={styles['editor-head']}>
                  <p class={styles['editor-title']} ref={headingRef} tabIndex={-1} data-page-heading>
                    {formatMessage(t.pageOf, { position: selectedIndex + 1, total: pages.length })}
                    {view === 'corners' && (
                      <span class={styles['editor-hint']} role="status">
                        {selected.guessed && selected.preview === null ? t.pageFailed
                          : !selected.guessed || finding === selected.id ? t.findingEdges
                          : findMissed.includes(selected.id) ? t.findMissed
                          : selected.found === false && !selected.edited ? t.notFoundCorners
                          : t.cornersHint}
                      </span>
                    )}
                  </p>
                  {view === 'corners' && selected.preview !== null && (
                    <div class={styles['head-actions']}>
                      <button type="button" class={workspaceStyles['quiet-button']} onClick={rotatePage}>
                        <RotateCw size={16} aria-hidden="true" />
                        {t.rotate}
                      </button>
                      <FullScreenButton full={full !== null} onToggle={full ? exitFull : enterFull} labels={{ enter: t.fullScreen, exit: t.exitFullScreen }} />
                    </div>
                  )}
                  {view === 'result' && (
                    <div class={styles['head-actions']}>
                      <button type="button" class={workspaceStyles['quiet-button']} onClick={rotatePage}>
                        <RotateCw size={16} aria-hidden="true" />
                        {t.rotate}
                      </button>
                      <button
                        type="button"
                        class={workspaceStyles['quiet-button']}
                        onClick={() => {
                          dispatch({ type: 'cornersOpened', focus: true });
                          announce(formatMessage(t.announceCornersOf, { position: selectedIndex + 1 }));
                        }}
                      >
                        <Crop size={16} aria-hidden="true" />
                        {t.adjustCorners}
                      </button>
                      <FullScreenButton full={full !== null} onToggle={full ? exitFull : enterFull} labels={{ enter: t.fullScreen, exit: t.exitFullScreen }} />
                    </div>
                  )}
                </div>
                {view === 'corners' && (
                  <div class={styles['photo-area']}>
                    {shownPhoto(selected) === null ? (
                      // The photo's own shape and size, so nothing moves when its preview lands.
                      <div
                        class={styles['corners-wait']}
                        style={{ aspectRatio: String(shownAspect), width: `min(100%, calc(var(--scan-view-h) * ${shownAspect}))` }}
                      >
                        {/* The head already says a photo could not be read; the box stays quiet. */}
                        {selected.preview !== null || selected.guessed ? '' : t.findingEdges}
                      </div>
                    ) : (
                      // On a turned page the photo, its shape and its corners are all shown turned (quad.ts).
                      <CornerEditor
                        key={`${selected.id}|${selected.turns}`}
                        src={shownPhoto(selected) as string}
                        aspect={selected.aspect === null ? undefined : shownAspect}
                        quad={turnedQuad(selected.quad, selected.turns)}
                        onCommit={(quad) => commitCorners(selected.id, unturnedQuad(quad, selected.turns))}
                        labels={{ group: t.cornersGroup, corners: t.corners }}
                      />
                    )}
                  </div>
                )}
                {view === 'corners' && selected.guessed && selected.preview === null && (
                  // An unreadable photo has nothing to straighten: the one thing to do is take it out.
                  <div class={styles['corners-actions']}>
                    <button
                      type="button"
                      class={`${workspaceStyles['quiet-button']} ${styles['done-button']}`}
                      onClick={() => {
                        // The next photo comes into view: this one's error box was not its height.
                        dispatch({ type: 'scrollFocusRequested', top: true });
                        removePage(selected.id);
                      }}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                      {t.removePhoto}
                    </button>
                  </div>
                )}
                {view === 'corners' && !(selected.guessed && selected.preview === null) && (
                  // Under the photo, like a scanner app's bottom bar: the quiet choices, then the one that moves on.
                  // One row where it fits; on a phone the one that moves on takes a row of its own.
                  <div class={styles['corners-actions']}>
                    <button type="button" class={workspaceStyles['quiet-button']} disabled={finding !== null || selected.preview === null} onClick={() => findPage(selected)}>
                      <WandSparkles size={18} aria-hidden="true" />
                      {t.findPage}
                    </button>
                    <button
                      type="button"
                      class={workspaceStyles['quiet-button']}
                      disabled={quadKey(selected.quad) === quadKey(FULL_QUAD)}
                      onClick={() => commitCorners(selected.id, FULL_QUAD)}
                    >
                      <Maximize size={18} aria-hidden="true" />
                      {t.wholePhoto}
                    </button>
                    <button
                      type="button"
                      class={`${workspaceStyles['quiet-button']} ${styles['done-button']}`}
                      disabled={selected.preview === null}
                      onClick={selected.reviewed ? () => {
                        showResult(selected);
                        dispatch({ type: 'scrollFocusRequested', top: true, focus: true });
                        announce(t.announceResult);
                      } : approveCorners}
                    >
                      <Check size={18} aria-hidden="true" />
                      {selected.reviewed ? t.cornersDone : t.useCorners}
                    </button>
                  </div>
                )}
                {view === 'result' && (
                  <>
                    {/* The look belongs to this page, so it sits right above it, on the first screen on a phone. */}
                    <div class={styles['page-look']}>
                      <OptionRow id="scan-look" label={t.lookLabel} options={lookOptions} value={selected.filter} onChange={chooseLook} dir={t.dir} />
                    </div>
                    {selected.found === false && !selected.edited && (
                      <p class={styles['not-found']} role="status">
                        {t.notFound}
                        <button type="button" class={workspaceStyles['quiet-button']} onClick={() => dispatch({ type: 'cornersOpened', focus: false })}>
                          <Crop size={16} aria-hidden="true" />
                          {t.adjustCorners}
                        </button>
                      </p>
                    )}
                    <div class={styles['paper-area']}>
                      <ResultPage {...resultView(selected, selectedIndex)} labels={{ exact: t.resultExact, updating: t.resultUpdating, making: t.processing }} detail={exactDetail} />
                    </div>
                  </>
                )}
              </section>

              <div class={styles.pages}>
              <p class="sr-only" id="scan-reorder-hint">{t.reorderHint}</p>
              <ul class={styles.strip} ref={listRef} aria-label={t.pagesLabel} aria-describedby="scan-reorder-hint">
                {pages.map((page, index) => {
                  const result = results[page.id];
                  const current = result?.key === resultKey(page);
                  return (
                    <li key={page.id} class={styles.tile} data-id={page.id} data-selected={page.id === selected.id || undefined}>
                      <div
                        class={styles.page}
                        data-page
                        tabIndex={0}
                        role="button"
                        aria-pressed={page.id === selected.id}
                        aria-label={formatMessage(t.tileLabel, { position: index + 1, total: pages.length })}
                        onClick={() => dispatch({ type: 'pageSelected', id: page.id })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch({ type: 'pageSelected', id: page.id }); return; }
                          onTileKeyDown(e, page.id);
                        }}
                      >
                         {result ? <img src={result.thumbUrl} alt="" draggable={false} data-stale={!current || undefined} /> : <span class={styles.pending}>{failedIds.includes(page.id) ? t.pageFailed : t.processing}</span>}
                        <span class={styles.badge} aria-hidden="true">{index + 1}</span>
                      </div>
                      <button type="button" class={styles.remove} aria-label={formatMessage(t.removeLabel, { position: index + 1 })} onClick={() => removePage(page.id)}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {/* Outside the list, so a long scan scrolls its pages and these stay at the end, in view. */}
              <div class={styles['add-tile']}>
                <TakePhotoButton onFiles={addFiles} />
                <button type="button" class={styles['add-button']} onClick={requestReplace}>
                  <ImagePlus size={20} aria-hidden="true" />
                  {t.addPhotos}
                </button>
              </div>
              </div>
              </div>

              {/* On a phone the corners come first; the choices follow the pages they apply to. */}
              <div class={styles['phone-options']}>{controls('-phone')}</div>
              {/* Desktop: under the page, inside the first screen (useFloorHeight leaves it the room). */}
              {wide && <div class={styles['rating-slot']}>{rating}</div>}
            </PageWorkspace>
          )}
        </ToolShellBridge>
      )}

      <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
    </BasePdfTool>
  );
});
