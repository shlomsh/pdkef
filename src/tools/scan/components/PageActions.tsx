import { useState } from 'preact/hooks';
import { Crop, RotateCcw, RotateCw, SlidersHorizontal, Trash2 } from 'lucide-preact';
import OptionRow, { type Option } from '#shell/pageWorkspace/OptionRow.tsx';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { ScanPage } from '../state/scanWork.ts';
import pageView from './ScanPageView.module.css';
import RetakeButton from './RetakeButton.tsx';

interface PageActionsProps {
  selected: ScanPage;
  lookOptions: Option<ScanFilter>[];
  onChooseLook: (next: ScanFilter) => void;
  onAdjustCorners: () => void;
  /** A quarter turn clockwise. */
  onRotate: () => void;
  /** A quarter turn the other way, so any page is at most two taps from upright. */
  onRotateLeft: () => void;
  onRetake: (file: File) => void;
  onRetakeCamera?: () => void;
  onRemovePage: (id: number) => void;
}

/** Look's options when open, then the one row of six under a page: the same on desktop and in the phone's viewer. */
export default function PageActions({ selected, lookOptions, onChooseLook, onAdjustCorners, onRotate, onRotateLeft, onRetake, onRetakeCamera, onRemovePage }: PageActionsProps) {
  const [lookOpen, setLookOpen] = useState(false);
  return (
    <>
      {lookOpen && (
        <div class={pageView.look}>
          <OptionRow id="scan-look" label={t.lookLabel} options={lookOptions} value={selected.filter} onChange={onChooseLook} dir={t.dir} />
        </div>
      )}
      <div class={pageView.actions} data-page-actions>
        <button type="button" class={pageView.item} onClick={onAdjustCorners}>
          <Crop size={20} aria-hidden="true" />
          <span>{t.cornersAction}</span>
        </button>
        <button type="button" class={pageView.item} data-rotate="left" aria-label={t.rotateLeft} onClick={onRotateLeft}>
          <RotateCcw size={20} aria-hidden="true" />
          <span aria-hidden="true">{t.rotateLeftShort}</span>
        </button>
        <button type="button" class={pageView.item} data-rotate="right" aria-label={t.rotateRight} onClick={onRotate}>
          <RotateCw size={20} aria-hidden="true" />
          <span aria-hidden="true">{t.rotateRightShort}</span>
        </button>
        <button type="button" class={pageView.item} aria-expanded={lookOpen} onClick={() => setLookOpen(!lookOpen)}>
          <SlidersHorizontal size={20} aria-hidden="true" />
          <span>{t.lookAction}</span>
        </button>
        <RetakeButton onRetake={onRetake} onCamera={onRetakeCamera} />
        <button type="button" class={`${pageView.item} ${pageView.danger}`} onClick={() => onRemovePage(selected.id)}>
          <Trash2 size={20} aria-hidden="true" />
          <span>{t.removeShort}</span>
        </button>
      </div>
    </>
  );
}
