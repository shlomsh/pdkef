// The marks on a page: groups of touching pixels darker than a limit. Pure: no DOM, no canvas.

/** The pixels touching pixel `i`, corners included (and `i` itself, which is already seen). */
function eachNeighbour(i: number, width: number, height: number, visit: (neighbour: number) => void): void {
  const x = i % width;
  const y = (i - x) / width;
  for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) visit(yy * width + xx);
  }
}

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
  let count = 0;
  const take = (i: number) => {
    if (seen[i] || plane[i] >= below) return;
    seen[i] = 1;
    found[count] = i;
    count += 1;
  };
  for (let start = 0; start < found.length; start += 1) {
    count = 0;
    take(start);
    for (let next = 0; next < count; next += 1) eachNeighbour(found[next], width, height, take);
    if (count > 0) visit(found.subarray(0, count));
  }
}
