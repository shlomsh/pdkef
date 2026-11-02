interface Box { left: number; top: number; width: number; height: number }

const PAD = 24;
const MIN_HEIGHT = 72;
const MAX_HEIGHT = 160;

interface PassageCrop {
  /** The crop in canvas backing pixels. */
  sx: number; sy: number; sw: number; sh: number;
  /** The crop's CSS size. */
  width: number; height: number;
  /** The mark's top inside the crop, CSS px. */
  offsetTop: number;
}

/** READ-19: which strip of the page canvas shows a mark. Full canvas width; the mark's box padded 24 px, 72 to 160 px tall (a taller mark shows its top), kept inside the canvas. `mark` and `canvas` are client rects. */
export function passageCrop({ mark, canvas, canvasPx }: { mark: Box; canvas: Box; canvasPx: { width: number; height: number } }): PassageCrop {
  const height = Math.min(canvas.height, Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, mark.height + 2 * PAD)));
  const pad = mark.height + 2 * PAD >= height ? PAD : (height - mark.height) / 2;
  const markTop = mark.top - canvas.top;
  const top = Math.min(Math.max(0, markTop - pad), canvas.height - height);
  const ky = canvasPx.height / canvas.height;
  return { sx: 0, sy: top * ky, sw: canvasPx.width, sh: height * ky, width: canvas.width, height, offsetTop: markTop - top };
}

/** The mark's percent bands as CSS px rects inside the crop; `cropLeft` is `mark.left - canvas.left`. */
export function bandRects(mark: Box, bands: readonly Box[], offsetTop: number, cropLeft: number): Box[] {
  return bands.map((b) => ({
    left: cropLeft + (b.left / 100) * mark.width,
    top: offsetTop + (b.top / 100) * mark.height,
    width: (b.width / 100) * mark.width,
    height: (b.height / 100) * mark.height,
  }));
}
