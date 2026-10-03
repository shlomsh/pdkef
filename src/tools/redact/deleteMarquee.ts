import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';

/** A rect in page percent, the space DeletableObjectOverlay draws in. */
export interface PercentRect { left: number; top: number; width: number; height: number }
export interface PercentPoint { x: number; y: number }

/** RED-33: a press must travel this far (px) before it is a box, not a click. */
export const MARQUEE_DRAG_PX = 5;
/** Touch: hold still this long before a drag draws a box instead of scrolling. */
export const MARQUEE_HOLD_MS = 300;

export const isMarqueeDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > MARQUEE_DRAG_PX;

export function marqueeRect(start: PercentPoint, end: PercentPoint): PercentRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/** Share (0..1) of `inner`'s area that lies inside `outer`. */
export function overlapShare(inner: PercentRect, outer: PercentRect): number {
  const area = inner.width * inner.height;
  if (area <= 0) return 0;
  const w = Math.min(inner.left + inner.width, outer.left + outer.width) - Math.max(inner.left, outer.left);
  const h = Math.min(inner.top + inner.height, outer.top + outer.height) - Math.max(inner.top, outer.top);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / area;
}

/** The objects hover could delete that have at least `threshold` of their area inside `rect`. */
export function objectsInMarquee(
  objects: readonly DeletablePdfObject[],
  rect: PercentRect,
  threshold = 0.5,
  markedIds: ReadonlySet<string> = new Set(),
): DeletablePdfObject[] {
  return objects.filter((o) => !markedIds.has(o.id) && overlapShare(o.rect, rect) >= threshold);
}

/** The undo entry and chip text for a group of deletions. */
export function deletedSummary(objects: readonly Pick<DeletablePdfObject, 'kind'>[]): string {
  const count = (kind: DeletablePdfObject['kind']) => objects.filter((o) => o.kind === kind).length;
  const kinds = [
    { n: count('text'), alone: 'text', one: '1 piece of text', many: (n: number) => `${n} pieces of text` },
    { n: count('image'), alone: 'an image', one: '1 image', many: (n: number) => `${n} images` },
    { n: count('mark'), alone: 'a mark', one: '1 mark', many: (n: number) => `${n} marks` },
  ].filter((k) => k.n > 0);
  const parts = kinds.map((k) => (k.n > 1 ? k.many(k.n) : kinds.length === 1 ? k.alone : k.one));
  const last = parts.pop();
  return `Deleted ${parts.length ? `${parts.join(', ')} and ${last}` : last}`;
}
