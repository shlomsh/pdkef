import { formatMessage } from '#lib/text/formatMessage.ts';
import type { ElementUpdateKind } from '#editor/model/updateKind.ts';
import { englishRedactMessages as t } from '../messages.ts';

/**
 * Labels an update entry in the same voice as `Added ${type} box`. Redact has
 * no text elements, so a `text` kind (which cannot occur here) falls back to
 * the style label rather than going unhandled.
 */
export function describeRedactUpdate(kind: ElementUpdateKind, type: string): string {
  if (kind === 'move') return formatMessage(t.movedBox, { type });
  if (kind === 'resize') return formatMessage(t.resizedBox, { type });
  return formatMessage(t.changedBoxColor, { type });
}
