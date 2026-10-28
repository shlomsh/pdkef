import type { Ref } from 'preact';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { lookOptions } from '../lib/scanOptions.ts';
import { shownAspect, shownPhoto } from '../lib/scanPages.ts';
import { resultViewFor, exactResultDetail } from '../lib/resultView.ts';
import type { PageSize } from '../lib/scanPipeline.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { Quad } from '../lib/quad.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import ScanCornersView from './ScanCornersView.tsx';
import ScanEditorHead from './ScanEditorHead.tsx';
import ScanPageStrip from './ScanPageStrip.tsx';
import ScanResultView from './ScanResultView.tsx';

type Placed = Parameters<typeof resultViewFor>[2]['shown'];

export interface ScanWorkbenchProps {
  refs: {
    workbench: Ref<HTMLDivElement>;
    editor: Ref<HTMLElement>;
    heading: Ref<HTMLParagraphElement>;
    list: Ref<HTMLUListElement>;
  };
  /** The height the stage is fitted to on desktop (useFloorHeight), or null. */
  stageHeight: number | null;
  pages: ScanPage[];
  selected: ScanPage;
  selectedIndex: number;
  view: 'corners' | 'result';
  results: Record<number, PageResult>;
  turnedPreviews: Record<string, string>;
  failedIds: number[];
  finding: number | null;
  findMissed: number[];
  full: 'native' | 'layer' | null;
  pageSize: PageSize;
  /** The built PDF for what is on screen: its pages (when built), whether it is ready, and its size. */
  built: { shown: Placed | undefined; ready: boolean; size: number };
  resultKeyOf: (page: ScanPage) => string;
  actions: {
    onRotate: () => void;
    onToggleFull: () => void;
    onAdjustCorners: () => void;
    onAdjustFromNote: () => void;
    onCommit: (id: number, quad: Quad) => void;
    onFind: (page: ScanPage) => void;
    onApprove: () => void;
    onDone: () => void;
    onRemoveFromCorners: (id: number) => void;
    onChooseLook: (next: ScanFilter) => void;
    onSelect: (id: number) => void;
    onTileKeyDown: (event: KeyboardEvent, id: number) => void;
    onRemove: (id: number) => void;
    onFiles: (files: File[]) => void;
    onPickMore: () => void;
  };
}

/** The photo and the pages: the selected page as a card (corners, or the page as it will download) beside the strip. */
export default function ScanWorkbench({ refs, stageHeight, pages, selected, selectedIndex, view, results, turnedPreviews, failedIds, finding, findMissed, full, pageSize, built, resultKeyOf, actions }: ScanWorkbenchProps) {
  /** The built PDF's own pages are what is shown once they match what is on screen. */
  const exact = built.shown !== undefined && built.ready;
  return (
    // From 1024px the pages are a column beside the selected page, so both stay on the first screen.
    <div
      ref={refs.workbench}
      class={styles.workbench}
      data-fills-stage
      data-fitted={stageHeight !== null || undefined}
      style={stageHeight !== null ? { '--scan-stage-h': `${stageHeight}px` } : undefined}
    >
      <section ref={refs.editor} class={styles.editor} data-full={full ?? undefined} aria-label={formatMessage(t.pageOf, { position: selectedIndex + 1, total: pages.length })}>
        <ScanEditorHead
          view={view}
          selected={selected}
          selectedIndex={selectedIndex}
          pageCount={pages.length}
          finding={finding}
          findMissed={findMissed}
          full={full}
          headingRef={refs.heading}
          onRotate={actions.onRotate}
          onToggleFull={actions.onToggleFull}
          onAdjustCorners={actions.onAdjustCorners}
        />
        {view === 'corners' && (
          <ScanCornersView
            selected={selected}
            photo={shownPhoto(selected, turnedPreviews)}
            shownAspect={shownAspect(selected)}
            finding={finding}
            onCommit={actions.onCommit}
            onFind={actions.onFind}
            onApprove={actions.onApprove}
            onDone={actions.onDone}
            onRemove={actions.onRemoveFromCorners}
          />
        )}
        {view === 'result' && (
          <ScanResultView
            selected={selected}
            lookOptions={lookOptions()}
            onChooseLook={actions.onChooseLook}
            onAdjustCorners={actions.onAdjustFromNote}
            pageProps={resultViewFor(selected, selectedIndex, { shown: built.shown, ready: exact, results, pageSize })}
            detail={exact ? exactResultDetail(built.size, pages.length) : undefined}
          />
        )}
      </section>

      <ScanPageStrip
        pages={pages}
        results={results}
        selectedId={selected.id}
        failedIds={failedIds}
        listRef={refs.list}
        resultKeyOf={resultKeyOf}
        onSelect={actions.onSelect}
        onTileKeyDown={actions.onTileKeyDown}
        onRemove={actions.onRemove}
        onFiles={actions.onFiles}
        onPickMore={actions.onPickMore}
      />
    </div>
  );
}
