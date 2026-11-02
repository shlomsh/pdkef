import type { HighlightElement } from '#editor/model/editorModel.ts';
import { createUpdateEntry, type ElementUpdateKind } from '#editor/model/updateKind.ts';
import type { UpdateHistoryEntry } from '#editor/model/actionHistory.ts';
import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { OPACITY_MIN, clampWidth, type Marker } from './markerState.ts';

/** The marker a highlight carries: what the next stroke lays after the reader changes it (R5). */
export function markOf(el: HighlightElement): Marker {
  return { color: el.color, style: el.style === 'underline' || el.style === 'pencil' ? el.style : 'highlight', opacity: el.opacity ?? 1, ...(el.strokeWidth === undefined ? {} : { strokeWidth: el.strokeWidth }), ...(el.stroke ? { stroke: el.stroke } : {}) };
}

/**
 * A marker change as element fields. A highlight style and a full opacity are the absent keys, so a
 * default mark stays as small as one that never changed (old drafts stay valid).
 */
/** @testSeam */
export function changePatch(change: Partial<Marker>): Partial<HighlightElement> {
  const patch: Partial<HighlightElement> = {};
  if (change.color !== undefined) patch.color = change.color;
  if (change.style !== undefined) patch.style = change.style === 'underline' || change.style === 'pencil' ? change.style : undefined;
  if (change.opacity !== undefined) {
    const opacity = Math.min(1, Math.max(OPACITY_MIN, change.opacity));
    patch.opacity = opacity < 1 ? opacity : undefined;
  }
  if (change.strokeWidth !== undefined) {
    const width = clampWidth(change.strokeWidth);
    patch.strokeWidth = width === UNDERLINE_WIDTH.default ? undefined : width;
  }
  if ('stroke' in change) patch.stroke = change.stroke === 'sketch' ? 'sketch' : undefined;
  // READ-14: pencil carries neither a line width nor a pen stroke
  if (change.style === 'pencil') { patch.strokeWidth = undefined; patch.stroke = undefined; }
  return patch;
}

/** The element changes for a marker change and the undo step that goes with them (null for no change). */
export function buildMarkEdit(
  el: HighlightElement,
  change: Partial<Marker>,
  describe: (kind: ElementUpdateKind) => string,
): { changes: Partial<HighlightElement>; entry: UpdateHistoryEntry<HighlightElement> | null } {
  const changes = changePatch(change);
  return { changes, entry: createUpdateEntry(el, changes, describe) };
}
