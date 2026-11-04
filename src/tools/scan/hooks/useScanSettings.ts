import { useState } from 'preact/hooks';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { reportEdit } from '#lib/telemetry/productAnalytics.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { SizeLimitId } from '../lib/scanBudget.ts';
import type { PageSize } from '../lib/scanPipeline.ts';
import { defaultScanName } from '../lib/scanName.ts';
import type { ScanDraftSettings } from '../lib/scanDraft.ts';

/** A change of one setting: remembered, counted, and a no-op when nothing changed. */
const choose = <T,>(setter: (value: T) => void, current: T) => (next: T) => {
  if (next === current) return;
  setter(next);
  recordAction('change_setting');
  reportEdit('scan-to-pdf');
};

/** The choices a person makes for the whole PDF: the paper, the size limit and the file name. */
export function useScanSettings() {
  /** A new photo starts with the look last chosen. */
  const [defaultFilter, setDefaultFilter] = useState<ScanFilter>('document');
  const [pageSize, setPageSize] = useState<PageSize>('fit');
  const [limit, setLimit] = useState<SizeLimitId>('none');
  const [customName, setCustomName] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  /** Read once, so a midnight roll never renames the file. */
  const [defaultName] = useState(() => defaultScanName(new Date()));
  return {
    defaultName, defaultFilter, setDefaultFilter, pageSize, limit, customName, setCustomName, isRenaming, setIsRenaming,
    choosePageSize: choose(setPageSize, pageSize),
    chooseLimit: choose(setLimit, limit),
    rename: (next: string) => setCustomName(next.length > 0 && next !== defaultName ? next : null),
    /** A remembered scan's settings (SCAN-18): set as they were, not chosen, so nothing is counted. */
    restoreSettings: (saved: Partial<ScanDraftSettings>) => {
      if (saved.pageSize) setPageSize(saved.pageSize);
      if (saved.limit) setLimit(saved.limit);
      if (saved.defaultFilter) setDefaultFilter(saved.defaultFilter);
      // A scan named on another day keeps that day's name.
      if (saved.name) setCustomName(saved.name !== defaultName ? saved.name : null);
    },
  };
}
