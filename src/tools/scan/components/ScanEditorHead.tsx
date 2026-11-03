import type { Ref } from 'preact';
import { ChevronLeft, RotateCw } from 'lucide-preact';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import pageView from './ScanPageView.module.css';
import FullScreenButton from './FullScreenButton.tsx';

interface ScanEditorHeadProps {
  view: 'table' | 'corners' | 'result';
  selected: ScanPage;
  selectedIndex: number;
  pageCount: number;
  finding: number | null;
  findMissed: number[];
  full: 'native' | 'layer' | null;
  headingRef: Ref<HTMLParagraphElement>;
  onRotate: () => void;
  onToggleFull: () => void;
  /** Back to the table. */
  onDone: () => void;
}

/** What the corners hint says, in the order the states can overlap. */
function cornersHint(selected: ScanPage, finding: number | null, findMissed: number[]): string {
  if (selected.guessed && selected.preview === null) return t.pageFailed;
  if (!selected.guessed || finding === selected.id) return t.findingEdges;
  if (findMissed.includes(selected.id)) return t.findMissed;
  if (selected.found === false && !selected.edited) return t.notFoundCorners;
  return t.cornersHint;
}

/** The editor card's head: the page's title; a back control to the table in the page view, Rotate and Full screen in corners. */
export default function ScanEditorHead({ view, selected, selectedIndex, pageCount, finding, findMissed, full, headingRef, onRotate, onToggleFull, onDone }: ScanEditorHeadProps) {
  return (
    <div class={styles['editor-head']}>
      {view === 'result' && (
        <button type="button" class={pageView.back} data-back onClick={onDone}>
          <ChevronLeft size={20} aria-hidden="true" />
          {t.pagesLabel}
        </button>
      )}
      <p class={styles['editor-title']} ref={headingRef} tabIndex={-1} data-page-heading>
        {formatMessage(t.pageOf, { position: selectedIndex + 1, total: pageCount })}
        {view === 'corners' && (
          <span class={styles['editor-hint']} role="status">{cornersHint(selected, finding, findMissed)}</span>
        )}
      </p>
      {view === 'corners' && selected.preview !== null && (
        <div class={styles['head-actions']}>
          <button type="button" class={workspaceStyles['quiet-button']} onClick={onRotate}>
            <RotateCw size={16} aria-hidden="true" />
            {t.rotate}
          </button>
          <FullScreenButton full={full !== null} onToggle={onToggleFull} labels={{ enter: t.fullScreen, exit: t.exitFullScreen }} />
        </div>
      )}
    </div>
  );
}
