import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { Camera, FileSignature, Merge, Shrink } from 'lucide-preact';
import { moveEntry, reorderEntries } from '../../lib/pageOrder.js';
import { usePreparedOutput } from '../../lib/usePreparedOutput.ts';
import type { QuietPolicy } from '../../lib/quietPrepare.ts';
import { useHandoffFilesIntake } from '../../lib/useHandoffIntake.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { reportEdit } from '../../lib/productAnalytics.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { formatFileSize } from '../../lib/format.js';
import { formatMessage } from '../../i18n/toolMessages';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import DownloadElement from '../../shell/DownloadElement.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import OutputName from '../../shell/OutputName.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import FinishRow from '../../shell/pageWorkspace/FinishRow.tsx';
import PhoneFinish from '../../shell/pageWorkspace/PhoneFinish.tsx';
import { downloadDetail, pagesLabel } from '../../shell/pageWorkspace/pageCounts.ts';
import PageWorkspace, { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { useDownloadFlow, type HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import OptionRow, { type Option } from '../../shell/pageWorkspace/OptionRow.tsx';
import { englishShellMessages } from '../../i18n/toolMessages';
import CornerEditor from './CornerEditor.tsx';
import ResultPage from './ResultPage.tsx';
import { placeImage } from '../../lib/imagePage.js';
import { playFlatten, relativeBox, type FlattenFrom } from './flattenAnimation.ts';
import ScanVerb from './verb/ScanVerb.tsx';
import { FULL_QUAD, quadKey, type Quad } from './quad.ts';
import { SIZE_LIMITS, type SizeLimitId } from './scanBudget.ts';
import type { ScanFilter } from './filters.ts';
import type { BuiltPage, PageSize, Placement, ProcessedPage } from './scanPipeline.ts';
import { scanMessages as t } from './scanMessages.ts';
import styles from './PdfScanTool.module.css';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
const ACCEPT = ACCEPTED_TYPES.join(',');
const HANDOFF_HREFS = { compress: '/compress/', sign: '/sign/', merge: '/merge/' };
const HANDOFF_TOOLS: HandoffTool[] = ['sign', 'merge', 'compress'];

interface ScanPage {
  id: number;
  file: File;
  /** The small preview the corner editor and loupe show (scanPipeline's inspectPhoto); null until made. */
  preview: string | null;
  /** The photo's width over height, so its frame has a size before the preview decodes. */
  aspect: number | null;
  /** This page's look: a colour ID card and a printed form can sit in one PDF. */
  filter: ScanFilter;
  /** The person has seen this page's corners and used them (Use these corners). */
  reviewed: boolean;
  quad: Quad;
  /** The edge guess has run (or failed); until then the corners are the whole photo. */
  guessed: boolean;
  /** The person moved a corner: their corners win, the guess never overrides them. */
  edited: boolean;
  /** Whether the edge guess found a page: null until it has run. */
  found: boolean | null;
}

interface PageResult { key: string; url: string; thumbUrl: string; page: ProcessedPage }
/** The pages of the last built PDF, in its order: what Download saves, page for page. */
interface Shown { key: string; pages: { url: string; place: Placement }[] }

/** Fit pages print at 200 dpi (scanPipeline.ts); the same rule places a page before the build lands. */
const FIT_POINTS_PER_PIXEL = 72 / 200;

let nextId = 0;
const resultKey = (page: ScanPage) => `${page.id}|${quadKey(page.quad)}|${page.filter}`;

type Pipeline = typeof import('./scanPipeline.ts');
let pipelinePromise: Promise<Pipeline> | null = null;
// The warp, filter and edge code load once, when the first photo arrives (docs/scan-to-pdf.md).
const loadPipeline = () => (pipelinePromise ??= import('./scanPipeline.ts'));

/** "Take a photo": the camera straight away on a phone, one page per shot. Coarse pointers only (CSS).
 * `primary` is the empty state's, the equal of Choose files: the same label-around-input as the shell's
 * picker, so iOS opens the camera natively. The page strip's is a quiet tile. */
function TakePhotoButton({ onFiles, primary = false }: { onFiles: (files: File[]) => void; primary?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files?.length) onFiles(Array.from(input.files));
    input.value = '';
  };
  if (primary) {
    return (
      <span class={styles['take-photo']}>
        {/* No icon: it pairs with Choose files, which has none, as two equal buttons. */}
        <label class={dropzoneStyles['file-picker-button']}>
          {t.takePhoto}
          <input type="file" accept={ACCEPT} capture="environment" class={dropzoneStyles['file-input']} onChange={onChange} />
        </label>
      </span>
    );
  }
  return (
    <span class={styles['take-photo']}>
      <button type="button" class={styles['take-photo-button']} onClick={() => inputRef.current?.click()}>
        <Camera size={18} aria-hidden="true" />
        {t.takePhoto}
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} capture="environment" class="sr-only" tabIndex={-1} aria-hidden="true" onChange={onChange} />
    </span>
  );
}

export interface PdfScanToolProps {
  quietPolicy?: QuietPolicy;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
}

export default function PdfScanTool({ quietPolicy, navigate }: PdfScanToolProps = {}) {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** A new photo starts with the look last chosen. */
  const [defaultFilter, setDefaultFilter] = useState<ScanFilter>('document');
  const [pageSize, setPageSize] = useState<PageSize>('fit');
  const [limit, setLimit] = useState<SizeLimitId>('none');
  const [customName, setCustomName] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [results, setResults] = useState<Record<number, PageResult>>({});
  const [failedIds, setFailedIds] = useState<number[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  /** Bumped when a build lands, so the per-key maps below are read again. */
  const [, setBuilt] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  /** The centre shows the page as it will download; corners are a mode you step into. */
  const [view, setView] = useState<'result' | 'corners'>('result');
  /** Pages where Find the page ran on request and found nothing; and the one it is running for. */
  const [findMissed, setFindMissed] = useState<number[]>([]);
  const [finding, setFinding] = useState<number | null>(null);
  // Per built key, like the preparer's own cache: going back to a setting already built is a cache
  // hit with no build call, and its pages and its limit note must come back with it.
  const shownByKeyRef = useRef(new Map<string, Shown>());
  const missedKeysRef = useRef(new Set<string>());
  const keepShown = (next: Shown) => {
    const map = shownByKeyRef.current;
    const old = map.get(next.key);
    if (old) old.pages.forEach((page) => URL.revokeObjectURL(page.url));
    map.delete(next.key);
    map.set(next.key, next);
    // Twice the preparer's cache (4), so a key it can still serve always has its pages here.
    while (map.size > 8) {
      const [oldest, evicted] = map.entries().next().value as [string, Shown];
      evicted.pages.forEach((page) => URL.revokeObjectURL(page.url));
      map.delete(oldest);
    }
  };
  const forgetShown = () => {
    for (const kept of shownByKeyRef.current.values()) kept.pages.forEach((page) => URL.revokeObjectURL(page.url));
    shownByKeyRef.current.clear();
    missedKeysRef.current.clear();
  };
  const listRef = useRef<HTMLUListElement | null>(null);
  const editorRef = useRef<HTMLElement | null>(null);
  const hadPagesRef = useRef(false);
  const focusIdRef = useRef<number | null>(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const defaultFilterRef = useRef(defaultFilter);
  defaultFilterRef.current = defaultFilter;
  /** Each page's preview, kept as bytes too, so Find the page decodes 1600px instead of the photo. */
  const previewBlobsRef = useRef(new Map<number, Blob>());
  /** One page is processed at a time, so a phone holds one full-size photo in memory, not ten. */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const processingRef = useRef(new Map<string, Promise<ProcessedPage>>());
  /** Keys whose result this component is already waiting on: one handler per run. */
  const watchingRef = useRef(new Set<string>());
  /** Pages removed while their edge guess still waited in the queue. */
  const removedRef = useRef(new Set<number>());
  const resultsRef = useRef<Record<number, PageResult>>({});
  /** Async work that finishes after the island is gone makes no object URLs and sets no state. */
  const unmountedRef = useRef(false);
  const resetDownloadFlowRef = useRef<() => void>(() => {});

  useHoldUpdate(pages.length > 0, 'open');

  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => (previous === text ? `${text} ` : text));
  }, []);

  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    // The queue tail never rejects (below), so every task runs after the one before it.
    const run = queueRef.current.then(task);
    queueRef.current = run.catch(() => {
      // expected: the queue only orders work; each task's own caller handles its failure
    });
    return run;
  };

  /** True while `key` is what the page on screen and the current look ask for. */
  const isCurrentKey = (key: string) => {
    const id = Number(key.slice(0, key.indexOf('|')));
    const live = pagesRef.current.find((p) => p.id === id);
    return !!live && resultKey(live) === key;
  };

  const dropCached = (id: number, keep?: string) => {
    for (const cachedKey of [...processingRef.current.keys()]) {
      if (cachedKey.startsWith(`${id}|`) && cachedKey !== keep) processingRef.current.delete(cachedKey);
    }
  };

  /** The processed page for these corners and this look: cached, so the strip and the build share one run. */
  const processed = useCallback((page: ScanPage): Promise<ProcessedPage> => {
    const key = resultKey(page);
    const cached = processingRef.current.get(key);
    if (cached) return cached;
    const run = enqueue(async () => {
      // A corner moved again, the look changed or the page went while this waited: skip the decode and warp.
      if (!isCurrentKey(key)) throw new DOMException('Superseded scan work', 'AbortError');
      return (await loadPipeline()).processPage(page.file, page.quad, page.filter);
    });
    processingRef.current.set(key, run);
    run.then(() => {
      if (!isCurrentKey(key)) processingRef.current.delete(key);
    }, () => {
      // expected: a failed run is reported by its caller; dropping it here lets the next try run again
      processingRef.current.delete(key);
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
      id: nextId++, file, preview: null, aspect: null, filter: defaultFilterRef.current, reviewed: false,
      quad: FULL_QUAD, guessed: false, edited: false, found: null,
    }));
    setPages((current) => [...current, ...added]);
    // A new photo is shown first as itself, corners on top, to approve or adjust (Use these corners).
    setSelectedId(added[0].id);
    setView('corners');
    // Bring the new photo's corners into view, wherever the page was scrolled to pick it.
    topPendingRef.current = true;
    announce(added.length === 1 ? t.announceAddedOne : formatMessage(t.announceAddedMany, { count: added.length }));
    recordAction('add_files');
    for (const page of added) {
      enqueue(async () => (removedRef.current.has(page.id) ? null : (await loadPipeline()).inspectPhoto(page.file)))
        .then((seen) => seen, (err) => {
          reportError('pdf_tool_run', err, 'scan_inspect_photo');
          return null;
        })
        .then((seen) => {
          if (removedRef.current.has(page.id) || unmountedRef.current) return;
          // A photo that could not be decoded: say so (failedIds), never "finding edges" forever.
          if (!seen) setFailedIds((ids) => (ids.includes(page.id) ? ids : [...ids, page.id]));
          if (seen) previewBlobsRef.current.set(page.id, seen.preview);
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
      if (resultsRef.current[page.id]?.key === key || watchingRef.current.has(key)) continue;
      watchingRef.current.add(key);
      processed(page).then((result) => {
        watchingRef.current.delete(key);
        if (unmountedRef.current || !isCurrentKey(key) || resultsRef.current[page.id]?.key === key) return;
        const previous = resultsRef.current[page.id];
        if (previous) {
          URL.revokeObjectURL(previous.url);
          URL.revokeObjectURL(previous.thumbUrl);
        }
        // Older corners for this page will not come back; let their bytes go.
        dropCached(page.id, key);
        resultsRef.current = { ...resultsRef.current, [page.id]: { key, url: URL.createObjectURL(result.blob), thumbUrl: URL.createObjectURL(result.thumb), page: result } };
        setResults(resultsRef.current);
        setFailedIds((ids) => ids.filter((id) => id !== page.id));
      }, (err) => {
        watchingRef.current.delete(key);
        // expected: work superseded before its turn is skipped on purpose, not a failure
        if (err?.name === 'AbortError') return;
        reportError('pdf_tool_run', err, 'scan_process_page');
        setFailedIds((ids) => (ids.includes(page.id) ? ids : [...ids, page.id]));
      });
    }
  }, [pages]);

  // Revoke every live object URL on unmount.
  const urlsRef = useRef<string[]>([]);
  urlsRef.current = [
    ...pages.flatMap((p) => (p.preview ? [p.preview] : [])),
    ...Object.values(results).flatMap((r) => [r.url, r.thumbUrl]),
    ...[...shownByKeyRef.current.values()].flatMap((kept) => kept.pages.map((p) => p.url)),
  ];
  useEffect(() => () => {
    unmountedRef.current = true;
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const allGuessed = pages.length > 0 && pages.every((p) => p.guessed) && failedIds.length === 0;
  const key = allGuessed
    ? `${pages.map((p) => resultKey(p)).join(',')}|${pageSize}|${limit}`
    : null;
  const inputsRef = useRef({ pages, pageSize, limit, key });
  inputsRef.current = { pages, pageSize, limit, key };
  const prepared = usePreparedOutput({
    key,
    quietPolicy,
    build: async (signal, onProgress) => {
      const { pages: current, pageSize: size, limit: chosen, key: builtKey } = inputsRef.current;
      const made = await Promise.all(current.map((page) => processed(page)));
      if (signal.aborted) throw new DOMException('Scan build aborted', 'AbortError');
      const budgetBytes = SIZE_LIMITS.find((l) => l.id === chosen)?.bytes ?? null;
      // Through the queue like every decode: a phone holds one photo's worth of pixels at a time.
      const fit = await enqueue(async () => (await loadPipeline()).buildScanPdf(made, { pageSize: size, budgetBytes, onProgress, signal }));
      if (signal.aborted || unmountedRef.current) throw new DOMException('Scan build aborted', 'AbortError');
      const builtAs = builtKey as string;
      if (fit.metTarget) missedKeysRef.current.delete(builtAs);
      else missedKeysRef.current.add(builtAs);
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
    hrefs: HANDOFF_HREFS,
    blocked: prepared.status === 'error' ? 'error' : null,
    announce: setAnnouncement,
    messages: { ready: t.readyAnnouncement, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
    navigate,
  });
  const { tap, downloadState, shareReady, handoffBusy, handoffFailed, requestHandoff, onDownloadTap, onRowPreparingTap, handleShare, reset: resetDownloadFlow } = downloadFlow;
  resetDownloadFlowRef.current = resetDownloadFlow;

  // Drag to reorder: SortableJS owns the DOM order during a drag; on drop the order is read back into state.
  useEffect(() => {
    if (!listRef.current) return undefined;
    const sortable = Sortable.create(listRef.current, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      draggable: '[data-id]',
      filter: 'button',
      preventOnFilter: false,
      delay: 150,
      delayOnTouchOnly: true,
      ghostClass: styles['is-ghost'],
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex === evt.newIndex || evt.oldIndex == null || evt.newIndex == null) return;
        const { oldIndex, newIndex } = evt;
        setPages((current) => reorderEntries(current, oldIndex, newIndex));
        recordAction('reorder');
      },
    });
    return () => sortable.destroy();
  }, [pages.length > 0]);

  // Bring the page's top into view: the first photos replace the tall empty state, and moving on from
  // the corners (whose buttons sit under the photo) would otherwise leave the person under the next view.
  const showEditorTop = (instant = false) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    editorRef.current?.scrollIntoView?.({ block: 'start', behavior: reduce || instant ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    const has = pages.length > 0;
    if (has && !hadPagesRef.current) showEditorTop();
    hadPagesRef.current = has;
  }, [pages.length > 0]);
  // Asked for by a view change, run once the new view is laid out (the scroll target moves with it).
  const topPendingRef = useRef(false);
  /** The photo and corners just approved, for the flatten animation into the result. */
  const flattenFromRef = useRef<FlattenFrom | null>(null);
  const stopFlattenRef = useRef<() => void>(() => {});
  useEffect(() => {
    // Whatever was playing belongs to the view that just went.
    stopFlattenRef.current();
    stopFlattenRef.current = () => {};
    if (focusPendingRef.current) {
      focusPendingRef.current = false;
      headingRef.current?.focus({ preventScroll: true });
    }
    const from = flattenFromRef.current;
    flattenFromRef.current = null;
    const host = editorRef.current;
    const target = host?.querySelector<HTMLImageElement>('[data-paper] img');
    // Only when the page is already made: an empty paper has nothing to land.
    const flatten = !!(from && view === 'result' && host && target);
    // One motion at a time: with a flatten to play, the scroll jumps first and the page moves alone.
    if (topPendingRef.current) {
      topPendingRef.current = false;
      showEditorTop(flatten);
    }
    if (flatten) {
      stopFlattenRef.current = playFlatten(host as HTMLElement, from as FlattenFrom, target as HTMLImageElement);
    }
  }, [view, selectedId]);
  useEffect(() => () => stopFlattenRef.current(), []);

  const headingRef = useRef<HTMLParagraphElement | null>(null);
  /** Set by a view switch the person made: the page heading takes focus once the new view is up. */
  const focusPendingRef = useRef(false);

  const captureFlatten = (page: ScanPage) => {
    const host = editorRef.current;
    const frame = host?.querySelector('[data-corner-frame]');
    if (!host || !frame || !page.preview) return;
    flattenFromRef.current = {
      photoUrl: page.preview,
      frame: relativeBox(frame.getBoundingClientRect(), host.getBoundingClientRect()),
      quad: page.quad,
    };
  };

  useLayoutEffect(() => {
    const id = focusIdRef.current;
    if (id === null) return;
    focusIdRef.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-id="${id}"] [data-page]`)?.focus();
  }, [pages]);

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
    setFinding(page.id);
    enqueue(async () => (removedRef.current.has(page.id) ? null : (await loadPipeline()).guessPage(previewBlobsRef.current.get(page.id) ?? page.file)))
      .then((quad) => quad, (err) => {
        reportError('pdf_tool_run', err, 'scan_find_page');
        return null;
      })
      .then((quad) => {
        if (unmountedRef.current) return;
        setFinding(null);
        if (removedRef.current.has(page.id)) return;
        if (!quad) {
          setFindMissed((ids) => (ids.includes(page.id) ? ids : [...ids, page.id]));
          announce(t.findMissed);
          return;
        }
        setFindMissed((ids) => ids.filter((id) => id !== page.id));
        setPages((current) => current.map((p) => (p.id === page.id ? { ...p, quad, edited: true, found: true } : p)));
        announce(t.pageFoundAnnounce);
        recordAction('change_setting');
      });
  };

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
    previewBlobsRef.current.delete(id);
    removedRef.current.add(id);
    dropCached(id);
    const left = pages.filter((p) => p.id !== id);
    if (resultsRef.current[id]) {
      URL.revokeObjectURL(resultsRef.current[id].url);
      URL.revokeObjectURL(resultsRef.current[id].thumbUrl);
      const { [id]: _gone, ...rest } = resultsRef.current;
      resultsRef.current = rest;
      setResults(rest);
    }
    setFailedIds((ids) => ids.filter((x) => x !== id));
    setPages(left);
    const neighbour = left[index] ?? left[index - 1];
    if (selectedId === id) {
      // Removing the photo under review: on to the next new one, or to the result when none is left.
      const nextNew = view === 'corners' ? left.find((p) => !p.reviewed) : undefined;
      setSelectedId(nextNew?.id ?? neighbour?.id ?? null);
      if (view === 'corners' && !nextNew) setView('result');
    }
    focusIdRef.current = neighbour?.id ?? null;
    announce(formatMessage(t.announceRemoved, { position: index + 1 }));
    recordAction('remove_file');
    if (left.length === 0) reset();
  };

  const reset = () => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    processingRef.current.clear();
    for (const page of pagesRef.current) removedRef.current.add(page.id);
    resultsRef.current = {};
    forgetShown();
    previewBlobsRef.current.clear();
    setView('result');
    setPages([]);
    setResults({});
    setFailedIds([]);
    setSelectedId(null);
    setCustomName(null);
    setRejectedFiles([]);
    resetDownloadFlowRef.current();
    announce(t.announceCleared);
  };

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const selectedIndex = selected ? pages.indexOf(selected) : -1;

  // The look is the selected page's own; it also becomes the look for the next new photo.
  const chooseLook = (next: ScanFilter) => {
    if (!selected || next === selected.filter) return;
    setPages((current) => current.map((p) => (p.id === selected.id ? { ...p, filter: next } : p)));
    setDefaultFilter(next);
    recordAction('change_setting');
    reportEdit('scan-to-pdf');
  };

  // Use these corners: on to the next new photo still waiting for a look, or to the result.
  const approveCorners = () => {
    if (!selected) return;
    setPages((current) => current.map((p) => (p.id === selected.id ? { ...p, reviewed: true } : p)));
    const next = pages.find((p) => !p.reviewed && p.id !== selected.id);
    if (next) setSelectedId(next.id);
    else {
      captureFlatten(selected);
      setView('result');
    }
    topPendingRef.current = true;
    focusPendingRef.current = true;
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
  const limitNote = key !== null && missedKeysRef.current.has(key) ? t.limitMissed : undefined;

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
    { tool: 'merge' as HandoffTool, label: t.handoffMerge, Icon: Merge },
    { tool: 'compress' as HandoffTool, label: t.handoffCompress, Icon: Shrink },
  ];
  const analyticsStatus = prepared.status === 'error' ? 'error' : tap;

  // The page as it will download: the built PDF's own JPEG once it matches what is on screen,
  // otherwise this page's newest result laid on its paper by the same rule, shown as updating.
  const shown = key === null ? undefined : shownByKeyRef.current.get(key);
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
                    <button type="button" class={workspaceStyles['quiet-button']} onClick={requestClear}>{englishShellMessages.clearLabel ?? 'Clear all'}</button>
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
                    errorMessage={t.buildFailed}
                    messages={t}
                    onPreparingTap={onRowPreparingTap}
                    onWarm={prepared.prepareNow}
                    onDownloadClick={onDownloadTap}
                    isOutputNameBeingRenamed={isRenaming}
                  />
                  <FinishRow
                    ready={prepared.status === 'ready'}
                    shareReady={shareReady}
                    onShare={handleShare}
                    busy={handoffBusy}
                    onHandoff={(tool) => { void requestHandoff(tool); }}
                    onWarm={prepared.prepareNow}
                    labels={{ share: t.shareLabel, compress: t.handoffCompress, sign: t.handoffSign, merge: t.handoffMerge }}
                    tools={HANDOFF_TOOLS}
                  />
                  {handoffFailed && (
                    <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
                  )}
                </>
              )}
            >
              {prepared.status === 'error' && <ErrorMessage>{t.buildFailed}</ErrorMessage>}
              {failedIds.length > 0 && (
                <ErrorMessage>
                  {formatMessage(t.pagesFailed, { pages: pages.filter((p) => failedIds.includes(p.id)).map((p) => pages.indexOf(p) + 1).join(', ') })}
                </ErrorMessage>
              )}

              <section ref={editorRef} class={styles.editor} aria-label={formatMessage(t.pageOf, { position: selectedIndex + 1, total: pages.length })}>
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
                  {view === 'result' && (
                    <button
                      type="button"
                      class={workspaceStyles['quiet-button']}
                      onClick={() => {
                        setView('corners');
                        focusPendingRef.current = true;
                        announce(formatMessage(t.announceCornersOf, { position: selectedIndex + 1 }));
                      }}
                    >
                      {t.adjustCorners}
                    </button>
                  )}
                </div>
                {view === 'corners' ? (
                  selected.preview === null ? (
                    <div class={styles['corners-wait']} style={{ aspectRatio: String(selected.aspect ?? 0.75) }}>{selected.guessed ? t.pageFailed : t.findingEdges}</div>
                  ) : (
                  <CornerEditor
                    key={selected.id}
                    src={selected.preview}
                    aspect={selected.aspect ?? undefined}
                    quad={selected.quad}
                    onCommit={(quad) => commitCorners(selected.id, quad)}
                    labels={{ group: t.cornersGroup, corners: t.corners }}
                  />
                  )
                ) : null}
                {view === 'corners' && selected.guessed && selected.preview === null && (
                  // An unreadable photo has nothing to straighten: the one thing to do is take it out.
                  <div class={styles['corners-actions']}>
                    <button type="button" class={`${workspaceStyles['quiet-button']} ${styles['done-button']}`} onClick={() => removePage(selected.id)}>
                      {t.removePhoto}
                    </button>
                  </div>
                )}
                {view === 'corners' && !(selected.guessed && selected.preview === null) && (
                  // Under the photo, like a scanner app's bottom bar: the quiet choices, then the one that moves on.
                  <div class={styles['corners-actions']}>
                    <div class={styles['corners-quiet']}>
                      <button type="button" class={workspaceStyles['quiet-button']} disabled={finding !== null || selected.preview === null} onClick={() => findPage(selected)}>
                        {t.findPage}
                      </button>
                      <button
                        type="button"
                        class={workspaceStyles['quiet-button']}
                        disabled={quadKey(selected.quad) === quadKey(FULL_QUAD)}
                        onClick={() => commitCorners(selected.id, FULL_QUAD)}
                      >
                        {t.wholePhoto}
                      </button>
                    </div>
                    <button
                      type="button"
                      class={`${workspaceStyles['quiet-button']} ${styles['done-button']}`}
                      disabled={selected.preview === null}
                      onClick={selected.reviewed ? () => {
                        captureFlatten(selected);
                        setView('result');
                        topPendingRef.current = true;
                        focusPendingRef.current = true;
                        announce(t.announceResult);
                      } : approveCorners}
                    >
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
                        <button type="button" class={workspaceStyles['quiet-button']} onClick={() => setView('corners')}>{t.adjustCorners}</button>
                      </p>
                    )}
                  <ResultPage {...resultView(selected, selectedIndex)} labels={{ exact: t.resultExact, updating: t.resultUpdating, making: t.processing }} detail={exactDetail} />
                  </>
                )}
              </section>

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
                        onClick={() => setSelectedId(page.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(page.id); return; }
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
                <li class={styles['add-tile']}>
                  <TakePhotoButton onFiles={addFiles} />
                  <button type="button" class={styles['add-button']} onClick={requestReplace}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    </svg>
                    {t.addPhotos}
                  </button>
                </li>
              </ul>

              {/* On a phone the corners come first; the choices follow the pages they apply to. */}
              <div class={styles['phone-options']}>{controls('-phone')}</div>
            </PageWorkspace>
          )}
        </ToolShellBridge>
      )}

      <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
    </BasePdfTool>
  );
}
