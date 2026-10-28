import { useState } from 'preact/hooks';
import { recordAction } from '../../../lib/telemetry/actionTrail.ts';
import { reportEdit } from '../../../lib/telemetry/productAnalytics.ts';
import type { ScanFilter } from '../lib/filters.ts';
import type { SizeLimitId } from '../lib/scanBudget.ts';
import type { PageSize } from '../lib/scanPipeline.ts';
import { englishScanMessages as t } from '../messages.ts';

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
  return {
    defaultFilter, setDefaultFilter, pageSize, limit, customName, setCustomName, isRenaming, setIsRenaming,
    choosePageSize: choose(setPageSize, pageSize),
    chooseLimit: choose(setLimit, limit),
    rename: (next: string) => setCustomName(next.length > 0 && next !== t.defaultName ? next : null),
  };
}
