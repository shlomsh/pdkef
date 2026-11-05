import type { Ref } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Crop, RotateCw } from 'lucide-preact';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishScanMessages as t } from '../messages.ts';
import { lookOptions } from '../lib/scanOptions.ts';
import { shownAspect, shownPhoto } from '../lib/scanPages.ts';
import { cornersHint } from '../lib/cornersHint.ts';
import { exactResultDetail, resultViewFor } from '../lib/resultView.ts';
import { slideIndexAt, slideWindow } from '../lib/pageSlides.ts';
import { looksBent } from '../lib/capture/guidance.ts';
import type { PageSize } from '../lib/scanPipeline.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import appStyles from '../PdfScanTool.module.css';
import styles from './ScanPageViewer.module.css';
import ResultPage from './ResultPage.tsx';
import PageActions from './PageActions.tsx';
import ScanUndoChip from './ScanUndoChip.tsx';
import ScanCornersView from './ScanCornersView.tsx';

type Placed = Parameters<typeof resultViewFor>[2]['shown'];

interface ScanPageViewerProps {
  /** A removal Undo is offered for: the chip lives in the dialog, as the top layer hides anything outside it. */
  undo?: { position: number; onUndo: () => void } | null;
  refs: { editor: Ref<HTMLElement>; heading: Ref<HTMLParagraphElement> };
  pages: ScanPage[];
  selected: ScanPage;
  selectedIndex: number;
  view: 'result' | 'corners';
  results: Record<number, PageResult>;
  turnedPreviews: Record<string, string>;
  finding: number | null;
  findMissed: number[];
  /** Pages that failed, in reading or later; a page only waiting for its preview is not among them. */
  failedIds: number[];
  pageSize: PageSize;
  /** The built PDF for what is on screen: its pages (when built), whether it is ready, and its size. */
  built: { shown: Placed | undefined; ready: boolean; size: number };
  actions: {
    /** A swipe reached this page: selection only. */
    onSelect: (id: number) => void;
    onRotate: () => void;
    onAdjustCorners: () => void;
    onCommit: (id: number, quad: Quad) => void;
    onFind: (page: ScanPage) => void;
    onApprove: () => void;
    onDone: () => void;
    /** One page back or on (a mouse device's buttons and arrow keys); does nothing at the ends. */
    onStep: (delta: 1 | -1) => void;
    onRetake: (file: File) => void;
    onRetakeCamera?: () => void;
    onRemovePage: (id: number) => void;
    onChooseLook: (next: ScanFilter) => void;
  };
}

/** The swipe: the scroller follows the selected page, and a swipe selects the page it reaches. A rotation does neither. */
function useSlideScroller(selectedIndex: number, pages: readonly ScanPage[], view: string, onSelect: (id: number) => void) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const pin = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const width = scroller.clientWidth;
    widthRef.current = width;
    if (slideIndexAt(scroller.scrollLeft, width, pages.length) === selectedIndex) return;
    const sign = getComputedStyle(scroller).direction === 'rtl' ? -1 : 1;
    scroller.scrollLeft = sign * selectedIndex * width;
  };
  const pinRef = useRef(pin);
  pinRef.current = pin;

  // Page N shows before first paint, and the scroller moves only when it is not already there.
  useLayoutEffect(pin, [selectedIndex, view, pages.length]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => pinRef.current());
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [view]);

  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // An offset from the old width means nothing against the new one: this scroll is the rotation, not a swipe.
    if (scroller.clientWidth !== widthRef.current) { pin(); return; }
    const i = slideIndexAt(scroller.scrollLeft, scroller.clientWidth, pages.length);
    if (i !== selectedIndex) onSelect(pages[i].id);
  };
  return { scrollerRef, onScroll };
}

/** The arrow keys browse in result view, as in PagePreviewDialog: left is always previous. */
function useArrowKeys(active: boolean, onStep: (delta: 1 | -1) => void) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent) => {
      // Alt+Left is the browser's Back, a key already used is a reorder, and the Look row owns its arrows.
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if ((event.target as Element | null)?.closest?.('[role="radiogroup"]')) return;
      if (event.key === 'ArrowRight') stepRef.current(1);
      else if (event.key === 'ArrowLeft') stepRef.current(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
}

/** The one-page screen on every width: a full-screen modal over the grid, swiping (or, on a mouse device,
 * Previous, Next and the arrow keys) between pages in result mode, the corners in the same dialog. */
export default function ScanPageViewer({ refs, pages, selected, selectedIndex, view, results, turnedPreviews, finding, findMissed, failedIds, pageSize, built, actions, undo }: ScanPageViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // failedIds also holds a page that was read and failed later: its photo is there, and moving a corner tries it again.
  const unreadable = failedIds.includes(selected.id) && selected.preview === null;
  // Back and Escape: Use these corners in corners (an unreadable page has nothing to use, so it closes), Done in result.
  const goBack = view === 'corners' && !unreadable ? actions.onApprove : actions.onDone;
  const backRef = useRef(goBack);
  backRef.current = goBack;

  // Before the effect below, and before paint: a closed dialog has no width to scroll by.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    // The browser may close a modal by itself, on a second Back with no tap between. That is a Back too, and if
    // the viewer stays it has to be open again.
    const closedByBrowser = () => { backRef.current(); dialog.showModal(); };
    dialog.addEventListener('close', closedByBrowser);
    return () => {
      dialog.removeEventListener('close', closedByBrowser);
      root.style.overflow = before;
      if (dialog.open) dialog.close();
    };
  }, []);

  const { scrollerRef, onScroll } = useSlideScroller(selectedIndex, pages, view, actions.onSelect);
  useArrowKeys(view === 'result', actions.onStep);

  const exact = built.shown !== undefined && built.ready;
  const { from, to } = slideWindow(selectedIndex, pages.length);
  return (
    <dialog
      ref={dialogRef}
      class={styles.dialog}
      data-page-viewer
      onCancel={(event) => { event.preventDefault(); backRef.current(); }}
    >
      <section ref={refs.editor} class={styles.editor} aria-label={formatMessage(t.pageOf, { position: selectedIndex + 1, total: pages.length })}>
        <div class={styles.head}>
          <button type="button" class={styles.back} data-back aria-label={t.backToPages} onClick={goBack}>
            <ChevronLeft size={24} aria-hidden="true" />
            <span class={styles.backWord}>{t.pagesLabel}</span>
          </button>
          <p class={styles.title} ref={refs.heading} tabIndex={-1} data-page-heading>
            {formatMessage(t.pageOf, { position: selectedIndex + 1, total: pages.length })}
          </p>
          {view === 'corners' && selected.preview !== null && (
            <div class={styles.headEnd}>
              <button type="button" class={workspaceStyles['quiet-button']} onClick={actions.onRotate}>
                <RotateCw size={16} aria-hidden="true" />
                {t.rotate}
              </button>
            </div>
          )}
        </div>
        {view === 'corners' && <p class={styles.hint} role="status">{cornersHint(selected, unreadable, finding, findMissed)}</p>}
        {view === 'result' ? (
          <div class={styles.stage}>
            <div class={styles.scroller} ref={scrollerRef} data-page-scroller onScroll={onScroll}>
              {pages.map((page, i) => (
                <div key={page.id} class={styles.slide} data-slide data-current={i === selectedIndex ? '' : undefined}>
                  {i >= from && i <= to && (
                    <ResultPage
                      {...resultViewFor(page, i, { shown: built.shown, ready: exact, results, pageSize })}
                      labels={{ exact: t.resultExact, updating: t.resultUpdating, making: t.processing }}
                      detail={exact ? exactResultDetail(built.size, pages.length) : undefined}
                    />
                  )}
                </div>
              ))}
            </div>
            <button type="button" class={`${styles.step} ${styles.stepPrevious}`} aria-label={t.previousPage} title={t.previousPage} aria-disabled={selectedIndex === 0} onClick={() => actions.onStep(-1)}>
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button type="button" class={`${styles.step} ${styles.stepNext}`} aria-label={t.nextPage} title={t.nextPage} aria-disabled={selectedIndex === pages.length - 1} onClick={() => actions.onStep(1)}>
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div class={`${styles.stage} ${styles.cornersStage}`}>
            <ScanCornersView
              selected={selected}
              photo={shownPhoto(selected, turnedPreviews)}
              shownAspect={shownAspect(selected)}
              finding={finding}
              unreadable={unreadable}
              onCommit={actions.onCommit}
              onFind={actions.onFind}
              onApprove={actions.onApprove}
              onRemove={actions.onRemovePage}
            />
          </div>
        )}
        {view === 'result' && (
          <>
            {selected.found === false && !selected.edited && (
              <p class={`${appStyles['not-found']} ${styles.notFound}`} role="status">
                {t.notFound}
                <button type="button" class={workspaceStyles['quiet-button']} onClick={actions.onAdjustCorners}>
                  <Crop size={16} aria-hidden="true" />
                  {t.adjustCorners}
                </button>
              </p>
            )}
            {looksBent(results[selected.id]?.page) && <p class={styles.hint} data-bent-note>{t.bentNote}</p>}
            <PageActions
              selected={selected}
              lookOptions={lookOptions()}
              onChooseLook={actions.onChooseLook}
              onAdjustCorners={actions.onAdjustCorners}
              onRotate={actions.onRotate}
              onRetake={actions.onRetake}
              onRetakeCamera={actions.onRetakeCamera}
              onRemovePage={actions.onRemovePage}
            />
            <button type="button" class={styles.done} data-page-done onClick={actions.onDone}>{t.pageDone}</button>
          </>
        )}
      </section>
      {undo && <ScanUndoChip viewer position={undo.position} onUndo={undo.onUndo} />}
    </dialog>
  );
}
