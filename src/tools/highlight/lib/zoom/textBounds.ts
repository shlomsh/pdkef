/** The horizontal extent of a page's text in points; the whole page when there is none (a scan). */
export function textBounds(items: object[], pageWidth: number): { textLeft: number; textRight: number } {
  let left = Infinity;
  let right = -Infinity;
  for (const raw of items) {
    const it = raw as { str?: unknown; width?: unknown; transform?: unknown };
    if (typeof it.str !== 'string' || it.str.trim() === '' || typeof it.width !== 'number' || !Array.isArray(it.transform)) continue;
    const x = Number(it.transform[4]);
    if (!Number.isFinite(x)) continue;
    left = Math.min(left, x);
    right = Math.max(right, x + it.width);
  }
  if (left === Infinity) return { textLeft: 0, textRight: pageWidth };
  return { textLeft: Math.max(0, left), textRight: Math.min(pageWidth, right) };
}
