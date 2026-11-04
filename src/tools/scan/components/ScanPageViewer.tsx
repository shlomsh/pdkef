import type { Ref } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { ChevronLeft, Crop } from 'lucide-preact';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishScanMessages as t } from '../messages.ts';
import { lookOptions } from '../lib/scanOptions.ts';
import { shownAspect, shownPhoto } from '../lib/scanPages.ts';
import { exactResultDetail, resultViewFor } from '../lib/resultView.ts';
import { slideIndexAt, slideWindow } from '../lib/pageSlides.ts';
import { looksBent } from '../lib/capture/guidance.ts';
import type { PageSize } from '../lib/scanPipeline.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { Quad } from '../lib/quad.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import appStyles from '../PdfScanTool.module.css';
import styles from './ScanPageViewer.module.css';
import ResultPage from './ResultPage.tsx';
import PageActions from './PageActions.tsx';
import ScanCornersView from './ScanCornersView.tsx';
import { cornersHint } from './ScanEditorHead.tsx';

type Placed = Parameters<typeof resultViewFor>[2]['shown'];

interface ScanPageViewerProps {
  refs: { editor: Ref<HTMLElement>; heading: Ref<HTMLParagraphElement> };
  pages: ScanPage[];
  selected: ScanPage;
  selectedIndex: number;
  view: 'result' | 'corners';
  results: Record<number, PageResult>;
  turnedPreviews: Record<string, string>;
  finding: number | null;
  findMissed: number[];
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

/** The phone's one-page screen: a full-screen modal over everything, swiping between pages in result mode, the corners in the same dialog. */
export default function ScanPageViewer({ refs, pages, selected, selectedIndex, view, results, turnedPreviews, finding, findMissed, pageSize, built, actions }: ScanPageViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const unreadable = selected.guessed && selected.preview === null;
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
          </button>
          <p class={styles.title} ref={refs.heading} tabIndex={-1} data-page-heading>
            {formatMessage(t.pageOf, { position: selectedIndex + 1, total: pages.length })}
          </p>
        </div>
        {view === 'corners' && <p class={styles.hint} role="status">{cornersHint(selected, finding, findMissed)}</p>}
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
          </div>
        ) : (
          <div class={`${styles.stage} ${styles.cornersStage}`}>
            <ScanCornersView
              selected={selected}
              photo={shownPhoto(selected, turnedPreviews)}
              shownAspect={shownAspect(selected)}
              finding={finding}
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
    </dialog>
  );
}
