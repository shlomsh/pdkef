import { FilePlus, Trash2 } from 'lucide-preact';
import SortMenu from '../../../shell/SortMenu.tsx';
import { workspaceStyles } from '../../../shell/pageWorkspace/PageWorkspace.tsx';
import railStyles from './MergeRail.module.css';
import type { SortMode } from '../lib/mergeModel.ts';
import type { MergeMessages } from '../messages';
import type { ShellMessages } from '../../../shell/shellMessages';

export interface SortOption {
  value: SortMode;
  label: string;
}

interface MergePhoneControlsProps {
  fileCount: number;
  rearranged: boolean;
  sortMode: SortMode;
  sortOptions: SortOption[];
  onSortChange: (value: string) => void;
  onResetOrder: () => void;
  onAdd: () => void;
  onClear: () => void;
  t: MergeMessages;
  sm: ShellMessages;
}

/* These use the rail's existing control styles and handlers in one row that
   wraps to two lines on a phone. Sort stays visible after a page-level
   rearrangement: sorting files regroups the plan, while Reset order
   explicitly restores it. */
export default function MergePhoneControls({
  fileCount, rearranged, sortMode, sortOptions, onSortChange, onResetOrder, onAdd, onClear, t, sm,
}: MergePhoneControlsProps) {
  return (
    <div class={workspaceStyles['mobile-file-controls']} data-merge-file-controls>
      <div class={workspaceStyles['quiet-row']}>
        <button type="button" class={workspaceStyles['quiet-button']} onClick={onAdd}><FilePlus size={16} aria-hidden="true" />{sm.addLabel}</button>
        <button type="button" class={workspaceStyles['quiet-button']} onClick={onClear}><Trash2 size={16} aria-hidden="true" />{sm.clearLabel}</button>
      </div>
      {fileCount >= 2 && (
        <SortMenu label={t.sortFilesLabel} ariaLabel={t.sortLabel} value={sortMode} options={sortOptions} onChange={onSortChange} hideLabel />
      )}
      {fileCount >= 2 && rearranged && (
        <div class={railStyles['rearranged-note']} role="status">
          <span>{t.pagesRearranged}</span>
          <button type="button" class={railStyles['reset-order']} onClick={onResetOrder}>
            {t.resetOrder}
          </button>
        </div>
      )}
    </div>
  );
}
