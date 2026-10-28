import { formatMessage } from '../../../lib/text/formatMessage';
import type { Option } from '../../../shell/pageWorkspace/OptionRow.tsx';
import { englishScanMessages as t } from '../messages.ts';
import { SIZE_LIMITS, type SizeLimitId } from './scanBudget.ts';
import type { ScanFilter } from './filters.ts';
import type { PageSize } from './scanPipeline.ts';

/** The three looks a page can have, in the order the row shows them. */
export function lookOptions(): Option<ScanFilter>[] {
  return [
    { value: 'original', label: t.lookOriginal, hint: t.lookOriginalHint },
    { value: 'grayscale', label: t.lookGrayscale, hint: t.lookGrayscaleHint },
    { value: 'document', label: t.lookDocument, hint: t.lookDocumentHint },
  ];
}

/** Fit, A4 and Letter. */
export function sizeOptions(): Option<PageSize>[] {
  return [
    { value: 'fit', label: t.pageSizeFit, hint: t.pageSizeFitHint },
    { value: 'a4', label: t.pageSizeA4, hint: formatMessage(t.pageSizePaperHint, { size: 'A4' }) },
    { value: 'letter', label: t.pageSizeLetter, hint: formatMessage(t.pageSizePaperHint, { size: 'Letter' }) },
  ];
}

/** One option per size limit in scanBudget's SIZE_LIMITS. */
export function limitOptions(): Option<SizeLimitId>[] {
  const labels: Record<SizeLimitId, string> = { none: t.limitNone, '2mb': t.limit2mb, '1mb': t.limit1mb, '500kb': t.limit500kb };
  return SIZE_LIMITS.map((l) => ({
    value: l.id,
    label: labels[l.id],
    hint: l.bytes === null ? t.limitNoneHint : formatMessage(t.limitHint, { size: labels[l.id] }),
  }));
}
