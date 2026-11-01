// Raster edits for the layout corpus's pinned rows (README "Pinned rows"): dust and specks laid on the clean
// master before it is degraded, so they blur, speckle and skew with the page like real dirt on the glass.
// Pure over typed arrays: returns a new raster, never touches the one it is given.

/**
 * edits: [{ kind: 'speck', x, y, sizePts, gray? }], points, y down, centred on (x, y).
 * A speck is a dark square sizePts across (at least one master pixel).
 */
export function applyEdits(raster, edits = []) {
  if (!edits.length) return raster;
  const data = Uint8ClampedArray.from(raster.data);
  const s = raster.pxPerPoint;
  for (const edit of edits) {
    if (edit.kind !== 'speck') throw new Error(`unknown edit: ${edit.kind}`);
    const half = Math.max(0.5, (edit.sizePts * s) / 2);
    const x0 = Math.max(0, Math.round(edit.x * s - half));
    const x1 = Math.min(raster.width, Math.max(x0 + 1, Math.round(edit.x * s + half)));
    const y0 = Math.max(0, Math.round(edit.y * s - half));
    const y1 = Math.min(raster.height, Math.max(y0 + 1, Math.round(edit.y * s + half)));
    for (let y = y0; y < y1; y++) data.fill(edit.gray ?? 40, y * raster.width + x0, y * raster.width + x1);
  }
  return { ...raster, data };
}
