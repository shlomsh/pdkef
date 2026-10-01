import styles from './EyedropperLoupe.module.css';

/** Circle diameter in CSS px. */
export const LOUPE_SIZE = 120;
/** Canvas pixels across the lens. Odd, so one pixel is the centre. */
export const LOUPE_PIXELS = 15;
/** CSS px between a finger and the loupe's bottom edge, so the finger never covers it. */
export const TOUCH_LIFT = 40;
const EDGE_GAP = 8;

/** The canvas pixel under a client point: the same mapping the pick uses, clamped. */
export function canvasPixelAt(
  rect: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const x = Math.min(canvasWidth - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * canvasWidth)));
  const y = Math.min(canvasHeight - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * canvasHeight)));
  return { x, y };
}

/** The n-square of canvas pixels around (px, py), clipped to the canvas, plus its
 * offset in loupe cells, so the centre pixel always lands in the centre cell. */
export function loupeSource(px: number, py: number, n: number, canvasWidth: number, canvasHeight: number) {
  const half = (n - 1) / 2;
  const x0 = px - half;
  const y0 = py - half;
  const sx = Math.max(0, x0);
  const sy = Math.max(0, y0);
  const sw = Math.max(0, Math.min(canvasWidth, x0 + n) - sx);
  const sh = Math.max(0, Math.min(canvasHeight, y0 + n) - sy);
  return { sx, sy, sw, sh, dx: sx - x0, dy: sy - y0 };
}

/** Where the loupe's top-left goes. A mouse loupe is centred on the pointer; a touch
 * loupe sits above the finger, below it when there is no room, inside the viewport. */
export function loupePlacement(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
  size: number,
  touch: boolean,
): { left: number; top: number } {
  if (!touch) return { left: clientX - size / 2, top: clientY - size / 2 };
  const maxLeft = Math.max(EDGE_GAP, viewportWidth - size - EDGE_GAP);
  const left = Math.min(maxLeft, Math.max(EDGE_GAP, clientX - size / 2));
  let top = clientY - TOUCH_LIFT - size;
  if (top < EDGE_GAP) top = Math.min(clientY + TOUCH_LIFT, Math.max(EDGE_GAP, viewportHeight - size - EDGE_GAP));
  return { left, top };
}

const toHex = (n: number) => n.toString(16).padStart(2, '0');
// A CSS Module class is undefined when the stylesheet is not processed (unit tests).
const cls = (name: string | undefined) => name ?? '';

export interface Loupe {
  update(canvas: HTMLCanvasElement, clientX: number, clientY: number, touch: boolean): string | null;
  hide(): void;
  destroy(): void;
}

/** A magnifier over the page canvas: built once, moved by writing the DOM only. */
export function createLoupe(host: Element): Loupe {
  const doc = host.ownerDocument;
  const el = doc.createElement('div');
  el.className = cls(styles.loupe);
  el.setAttribute('data-redact-eyedropper-loupe', '');
  el.setAttribute('aria-hidden', 'true');
  const lens = doc.createElement('canvas');
  lens.className = cls(styles.lens);
  const grid = doc.createElement('span');
  grid.className = cls(styles.grid);
  const center = doc.createElement('span');
  center.className = cls(styles.center);
  const hex = doc.createElement('span');
  hex.className = cls(styles.hex);
  hex.setAttribute('data-loupe-hex', '');
  const swatch = doc.createElement('span');
  swatch.className = cls(styles.swatch);
  const hexText = doc.createElement('span');
  hex.append(swatch, hexText);
  el.append(lens, grid, center, hex);
  el.style.display = 'none';
  el.style.setProperty('--cell', `${LOUPE_SIZE / LOUPE_PIXELS}px`);
  host.appendChild(el);

  let frame = 0;
  let pending: { canvas: HTMLCanvasElement; x: number; y: number; touch: boolean } | null = null;

  const paint = () => {
    frame = 0;
    const p = pending;
    pending = null;
    if (!p) return;
    const { canvas } = p;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = canvasPixelAt(rect, canvas.width, canvas.height, p.x, p.y);
    const dpr = doc.defaultView?.devicePixelRatio || 1;
    const backing = Math.round(LOUPE_SIZE * dpr);
    if (lens.width !== backing) {
      lens.width = backing;
      lens.height = backing;
    }
    lens.style.width = `${LOUPE_SIZE}px`;
    lens.style.height = `${LOUPE_SIZE}px`;
    const ctx = lens.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, backing, backing);
      ctx.imageSmoothingEnabled = false;
      const s = loupeSource(px.x, px.y, LOUPE_PIXELS, canvas.width, canvas.height);
      const cell = backing / LOUPE_PIXELS;
      if (s.sw > 0 && s.sh > 0) ctx.drawImage(canvas, s.sx, s.sy, s.sw, s.sh, s.dx * cell, s.dy * cell, s.sw * cell, s.sh * cell);
    }
    const color = readPixel(canvas, px.x, px.y);
    el.style.setProperty('--loupe-color', color ?? 'transparent');
    hexText.textContent = color ?? '';
    const view = doc.defaultView;
    const at = loupePlacement(p.x, p.y, view?.innerWidth ?? 0, view?.innerHeight ?? 0, LOUPE_SIZE, p.touch);
    el.style.transform = `translate(${Math.round(at.left)}px, ${Math.round(at.top)}px)`;
    el.style.display = '';
  };

  return {
    update(canvas, clientX, clientY, touch) {
      pending = { canvas, x: clientX, y: clientY, touch };
      if (!frame) frame = requestAnimationFrame(paint);
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const px = canvasPixelAt(rect, canvas.width, canvas.height, clientX, clientY);
      return readPixel(canvas, px.x, px.y);
    },
    hide() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      el.style.display = 'none';
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      el.remove();
    },
  };
}

function readPixel(canvas: HTMLCanvasElement, x: number, y: number): string | null {
  try {
    const data = canvas.getContext('2d')?.getImageData(x, y, 1, 1).data;
    return data ? `#${toHex(data[0])}${toHex(data[1])}${toHex(data[2])}` : null;
  } catch {
    // expected: getImageData can throw on a tainted or empty canvas, null means no colour
    return null;
  }
}
