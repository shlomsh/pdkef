// Reads the painted page around a swipe and returns page-percent bands. DOM-free apart from the
// canvas it is handed; all geometry is in swipe.ts, all row logic in textRows.ts / bands.ts.
import { bandsForSwipe, type Band } from './bands.ts';
import { findTextRows, type TextRow } from './textRows.ts';
import { bandsToPagePercent, canvasWindowRect } from './swipe.ts';

interface PagePoint { x: number; y: number }
interface SwipeReader { bandsBetween(a: PagePoint, b: PagePoint): Band[] }

const FALLBACK_HEIGHT_PTS = 14;
const MARGIN_LINES = 3;
const pct = (v: number, size: number) => (Math.min(100, Math.max(0, v)) / 100) * size;

/** Null when the canvas has no pixels or no 2d context. */
export function createSwipeReader(canvas: HTMLCanvasElement | null, pageHeightPts: number): SwipeReader | null {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const size = { width: canvas.width, height: canvas.height };
  const lineHeight = (FALLBACK_HEIGHT_PTS * size.height) / pageHeightPts;
  const margin = MARGIN_LINES * lineHeight;
  let cache: { top: number; bottom: number; rows: TextRow[] } | null = null;

  const rowsFor = (yMin: number, yMax: number): { top: number; rows: TextRow[] } | null => {
    // Reuse while the swipe stays a line away from the window's cut edges.
    if (cache
      && (cache.top === 0 || yMin - lineHeight >= cache.top)
      && (cache.bottom === size.height || yMax + lineHeight <= cache.bottom)) {
      return { top: cache.top, rows: cache.rows };
    }
    const rect = canvasWindowRect(size, yMin, yMax, margin);
    if (rect.height <= 0) return null;
    let image: ImageData;
    try {
      image = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
    } catch {
      return null;
    }
    const rows = findTextRows({ data: image.data, width: image.width, height: image.height });
    cache = { top: rect.y, bottom: rect.y + rect.height, rows };
    return { top: rect.y, rows };
  };

  return {
    bandsBetween(a, b) {
      const ay = pct(a.y, size.height);
      const by = pct(b.y, size.height);
      const hit = rowsFor(Math.min(ay, by), Math.max(ay, by));
      if (!hit) return [];
      const bands = bandsForSwipe(
        hit.rows,
        { x: pct(a.x, size.width), y: ay - hit.top },
        { x: pct(b.x, size.width), y: by - hit.top },
        lineHeight,
      );
      return bandsToPagePercent(bands, hit.top, size).filter((band) => band.width > 0 && band.height > 0);
    },
  };
}

/** Paints bands (percent of the element box) into the node's draft layer; none clears it. */
export function paintHighlightDraft(elementNode: HTMLElement, bands: Band[], color: string): void {
  const draft = elementNode.querySelector<HTMLElement>('[data-highlight-draft]');
  if (!draft) return;
  draft.replaceChildren(...bands.map((band) => {
    const div = elementNode.ownerDocument.createElement('div');
    div.style.cssText = `position:absolute;left:${band.left}%;top:${band.top}%;width:${band.width}%;height:${band.height}%;background:${color}`;
    return div;
  }));
}
