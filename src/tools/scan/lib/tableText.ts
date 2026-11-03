import { formatFileSize, isolateLtr } from '#lib/text/format.js';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { PreparedStatus } from '#lib/output/usePreparedOutput.ts';
import { englishScanMessages as t } from '../messages.ts';
import { sizeOptions } from './scanOptions.ts';
import type { PageSize } from './scanPipeline.ts';

/** The built PDF's real size for the table's Size value, or null while there is none (building, idle, failed). */
export function sizeValueText(status: PreparedStatus, size: number, dir: 'ltr' | 'rtl'): string | null {
  return status === 'ready' && size > 0 ? isolateLtr(formatFileSize(size), dir) : null;
}

/** The quiet button that reveals the paper choice: "Page size: Fit". */
export function pageSizeQuietLabel(pageSize: PageSize): string {
  const chosen = sizeOptions().find((o) => o.value === pageSize);
  return formatMessage(t.pageSizeQuiet, { size: chosen?.label ?? pageSize });
}
