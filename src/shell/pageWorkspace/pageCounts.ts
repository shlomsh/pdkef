import { formatFileSize, isolateLtr } from '../../lib/format.js';
import { type PageGridMessages, type ShellMessages } from '../../i18n/toolMessages';
import { formatMessage } from '../../lib/formatMessage';

type CountMessages = Pick<ShellMessages, 'pageCountOne' | 'pageCountOther'>;

/** "1 page" / "N pages", in the catalogue's words. */
export function pagesLabel(count: number, sm: CountMessages): string {
  return count === 1 ? sm.pageCountOne : formatMessage(sm.pageCountOther, { count });
}

/** "1 page skipped" / "N pages skipped", as whole phrases so a language can agree in number. */
export function skippedLabel(count: number, messages: Pick<PageGridMessages, 'skippedCountOne' | 'skippedCountOther'>): string {
  return count === 1 ? messages.skippedCountOne : formatMessage(messages.skippedCountOther, { count });
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
