import { formatFileSize, isolateLtr } from '../../lib/format.js';
import { formatMessage, type ShellMessages } from '../../i18n/toolMessages';

type CountMessages = Pick<ShellMessages, 'pageCountOne' | 'pageCountOther'>;

/** "1 page" / "N pages", in the catalogue's words. */
export function pagesLabel(count: number, sm: CountMessages): string {
  return count === 1 ? sm.pageCountOne : formatMessage(sm.pageCountOther, { count });
}

/** The Download element's detail line: "N pages" while the file builds, then "N pages · size". */
export function downloadDetail(
  prepared: { status: string; pageCount?: number; size?: number },
  outputCount: number,
  sm: CountMessages,
  dir: 'ltr' | 'rtl',
): string {
  return prepared.status === 'ready'
    ? `${pagesLabel(prepared.pageCount as number, sm)} · ${isolateLtr(formatFileSize(prepared.size as number), dir)}`
    : pagesLabel(outputCount, sm);
}
