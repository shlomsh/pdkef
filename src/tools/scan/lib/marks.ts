// The marks on a page: groups of touching pixels darker than a limit. Pure: no DOM, no canvas.

/** Calls `visit` once for each group of pixels under `below` that touch, corners included. `pixels`
 * holds their indices into `plane` and is only valid during the call. */
export function eachMark(
  plane: Uint8ClampedArray,
  width: number,
  height: number,
  below: number,
  visit: (pixels: Int32Array) => void,
): void {
  const seen = new Uint8Array(width * height);
  const found = new Int32Array(width * height);
  for (let start = 0; start < found.length; start += 1) {
    if (seen[start] || plane[start] >= below) continue;
    seen[start] = 1;
    found[0] = start;
    let count = 1;
    for (let next = 0; next < count; next += 1) {
      const x = found[next] % width;
      const y = (found[next] - x) / width;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
          const i = yy * width + xx;
          if (seen[i] || plane[i] >= below) continue;
          seen[i] = 1;
          found[count] = i;
          count += 1;
        }
      }
    }
    visit(found.subarray(0, count));
  }
}
