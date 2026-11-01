import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import type { SignMessages } from '#editor/registry/messages.ts';

/** READ-04: the plain name of each highlight color, keyed by its hex (the message key is derived from the color id). */
export function highlightColorNames(t: SignMessages): Record<string, string> {
  return Object.fromEntries(HIGHLIGHT_COLORS.map(({ id, hex }) => [hex, t[`highlightColor${id[0].toUpperCase()}${id.slice(1)}` as keyof SignMessages] as string]));
}
