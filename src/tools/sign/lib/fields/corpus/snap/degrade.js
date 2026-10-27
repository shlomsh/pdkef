// Seeded page degradation for the snap corpus (SNG-09). See README.md in this folder.
//
// degrade(raster, { level, view, seed }) resamples a clean gray master to a view's scale, rotates it
// (skew), then applies the level's effects. Plain typed-array code: no DOM, no Node API, no Math.random.
// mapPoint/unmapPoint carry a point on the pristine page (points, y down) through the same geometry.

import { mulberry32 } from './prng.js';

export const LEVELS = ['clean', 'scan', 'fax', 'phone'];
export const VIEWS = { fit: 1.9, native: 200 / 72, zoom: 5.7 };

const MASTER_PX_PER_POINT = 200 / 72;
const FAX_PX_PER_POINT = 100 / 72;

export { mulberry32 };

/** Standard normal source over a PRNG (Box-Muller, two values per pair of draws). */
function gaussian(rng) {
  let spare = null;
  return function next() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    const u = 1 - rng();
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * rng();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
}

// ---- resampling -----------------------------------------------------------------------------------

/** Per-destination-index source taps for one axis: area average when shrinking, bilinear when enlarging. */
function axisTaps(n, m) {
  const scale = m / n;
  const starts = new Int32Array(m);
  const counts = new Int32Array(m);
  const maxTaps = scale < 1 ? Math.ceil(1 / scale) + 2 : 2;
  const weights = new Float64Array(m * maxTaps);
  for (let i = 0; i < m; i++) {
    const base = i * maxTaps;
    if (scale < 1) {
      const lo = i / scale;
      const hi = (i + 1) / scale;
      const first = Math.floor(lo);
      const last = Math.min(n - 1, Math.ceil(hi) - 1);
      let sum = 0;
      for (let k = first; k <= last; k++) {
        const w = Math.min(hi, k + 1) - Math.max(lo, k);
        weights[base + k - first] = w;
        sum += w;
      }
      for (let k = first; k <= last; k++) weights[base + k - first] /= sum;
      starts[i] = first;
      counts[i] = last - first + 1;
    } else {
      let c = (i + 0.5) / scale - 0.5;
      c = c < 0 ? 0 : c > n - 1 ? n - 1 : c;
      const i0 = Math.floor(c);
      const f = c - i0;
      const i1 = Math.min(n - 1, i0 + 1);
      starts[i] = i0;
      if (i1 === i0) {
        counts[i] = 1;
        weights[base] = 1;
      } else {
        counts[i] = 2;
        weights[base] = 1 - f;
        weights[base + 1] = f;
      }
    }
  }
  return { starts, counts, weights, maxTaps };
}

/** Separable resample of a gray image (any numeric typed array) to nw x nh, as Float32Array. */
function resample(src, w, h, nw, nh) {
  if (nw === w && nh === h) return Float32Array.from(src);
  const hx = axisTaps(w, nw);
  const tmp = new Float32Array(nw * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const orow = y * nw;
    for (let x = 0; x < nw; x++) {
      const s = hx.starts[x];
      const c = hx.counts[x];
      const wb = x * hx.maxTaps;
      let acc = 0;
      for (let k = 0; k < c; k++) acc += hx.weights[wb + k] * src[row + s + k];
      tmp[orow + x] = acc;
    }
  }
  const vy = axisTaps(h, nh);
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const s = vy.starts[y];
    const c = vy.counts[y];
    const wb = y * vy.maxTaps;
    const orow = y * nw;
    for (let k = 0; k < c; k++) {
      const wk = vy.weights[wb + k];
      const irow = (s + k) * nw;
      for (let x = 0; x < nw; x++) out[orow + x] += wk * tmp[irow + x];
    }
  }
  return out;
}

// ---- geometry -------------------------------------------------------------------------------------

/** Rotate by theta radians about the image centre (bilinear, white fill). Forward: dest = R(src - c) + c. */
function rotate(data, w, h, theta) {
  const out = new Float32Array(w * h);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const cx = w / 2;
  const cy = h / 2;
  for (let Y = 0; Y < h; Y++) {
    const dy = Y + 0.5 - cy;
    for (let X = 0; X < w; X++) {
      const dx = X + 0.5 - cx;
      const fx = cx + dx * cos + dy * sin - 0.5;
      const fy = cy - dx * sin + dy * cos - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const ax = fx - x0;
      const ay = fy - y0;
      let p00;
      let p10;
      let p01;
      let p11;
      if (x0 >= 0 && y0 >= 0 && x0 + 1 < w && y0 + 1 < h) {
        const i = y0 * w + x0;
        p00 = data[i];
        p10 = data[i + 1];
        p01 = data[i + w];
        p11 = data[i + w + 1];
      } else {
        const inb = (xx, yy) => (xx >= 0 && yy >= 0 && xx < w && yy < h ? data[yy * w + xx] : 255);
        p00 = inb(x0, y0);
        p10 = inb(x0 + 1, y0);
        p01 = inb(x0, y0 + 1);
        p11 = inb(x0 + 1, y0 + 1);
      }
      out[Y * w + X] = (p00 * (1 - ax) + p10 * ax) * (1 - ay) + (p01 * (1 - ax) + p11 * ax) * ay;
    }
  }
  return out;
}

// ---- effects --------------------------------------------------------------------------------------

/** Separable gaussian blur, edge clamped. Returns a new Float32Array (or the input if sigma is tiny). */
function blur(data, w, h, sigma) {
  if (sigma < 0.25) return data;
  const r = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float64Array(2 * r + 1);
  let sum = 0;
  for (let j = -r; j <= r; j++) {
    const v = Math.exp(-(j * j) / (2 * sigma * sigma));
    kernel[j + r] = v;
    sum += v;
  }
  for (let j = 0; j < kernel.length; j++) kernel[j] /= sum;

  const tmp = new Float32Array(w * h);
  const pad = new Float32Array(w + 2 * r);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < r; x++) pad[x] = data[row];
    for (let x = 0; x < w; x++) pad[x + r] = data[row + x];
    for (let x = 0; x < r; x++) pad[w + r + x] = data[row + w - 1];
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let j = 0; j <= 2 * r; j++) acc += kernel[j] * pad[x + j];
      tmp[row + x] = acc;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const orow = y * w;
    for (let j = -r; j <= r; j++) {
      const yy = y + j < 0 ? 0 : y + j >= h ? h - 1 : y + j;
      const wk = kernel[j + r];
      const irow = yy * w;
      for (let x = 0; x < w; x++) out[orow + x] += wk * tmp[irow + x];
    }
  }
  return out;
}

function addNoise(data, sd, rng) {
  const g = gaussian(rng);
  for (let i = 0; i < data.length; i++) data[i] += g() * sd;
}

function smoothstep(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Illumination gradient (0.75..1.0 across the page) times one soft shadow band, per column. */
function applyIllumination(data, w, h, rng) {
  const flip = rng() < 0.5;
  const bandCentre = (0.25 + 0.5 * rng()) * w;
  const half = 0.075 * w;
  const col = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const t = (x + 0.5) / w;
    const grad = 0.75 + 0.25 * (flip ? 1 - t : t);
    const d = Math.abs(x + 0.5 - bandCentre);
    const profile = smoothstep((half * 1.5 - d) / half);
    col[x] = grad * (1 - 0.2 * profile);
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) data[row + x] *= col[x];
  }
}

/** Fax: low-resolution round trip, global threshold, thickened and broken rules, speckle. Returns 0/255 bytes. */
function faxEffects(data, w, h, viewScale, rng) {
  const lowW = Math.max(1, Math.round((w * FAX_PX_PER_POINT) / viewScale));
  const lowH = Math.max(1, Math.round((h * FAX_PX_PER_POINT) / viewScale));
  const low = resample(data, w, h, lowW, lowH);
  const up = resample(low, lowW, lowH, w, h);
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) out[i] = up[i] < 140 ? 0 : 255;

  const MIN_RUN = 40;
  const runs = [];
  const findRuns = (row) => {
    runs.length = 0;
    let x = 0;
    while (x < w) {
      if (out[row + x] !== 0) {
        x++;
        continue;
      }
      const start = x;
      while (x < w && out[row + x] === 0) x++;
      if (x - start > MIN_RUN) runs.push(start, x - start);
    }
  };
  // A copier thickens a rule downwards: bottom-up, so a row is read before the row above it is copied in.
  for (let y = h - 2; y >= 0; y--) {
    findRuns(y * w);
    if (runs.length === 0 || rng() >= 0.5) continue;
    for (let r = 0; r < runs.length; r += 2) out.fill(0, (y + 1) * w + runs[r], (y + 1) * w + runs[r] + runs[r + 1]);
  }
  // Breaks cut a rule across its whole thickness: rows whose long runs overlap form one rule block, and a
  // block is cut at the same columns in every one of its rows.
  const blocks = [];
  let prev = [];
  for (let y = 0; y < h; y++) {
    findRuns(y * w);
    const cur = [];
    for (let r = 0; r < runs.length; r += 2) {
      const start = runs[r];
      const end = start + runs[r + 1];
      let block = prev.find((b) => Math.min(b.x1, end) - Math.max(b.x0, start) >= 0.5 * Math.min(b.x1 - b.x0, end - start));
      if (block) {
        block.x0 = Math.min(block.x0, start);
        block.x1 = Math.max(block.x1, end);
        block.rows.push(y);
      } else {
        block = { x0: start, x1: end, rows: [y] };
        blocks.push(block);
      }
      cur.push(block);
    }
    prev = cur;
  }
  for (const block of blocks) {
    if (rng() >= 0.5) continue;
    const cuts = 1 + Math.floor(rng() * 3);
    for (let c = 0; c < cuts; c++) {
      const gap = 1 + Math.floor(rng() * 3);
      const at = block.x0 + Math.floor(rng() * Math.max(1, block.x1 - block.x0 - gap));
      for (const y of block.rows) out.fill(255, y * w + at, y * w + at + gap);
    }
  }
  for (let i = 0; i < out.length; i++) {
    const r = rng();
    if (r < 0.004) out[i] = r < 0.002 ? 0 : 255;
  }
  return out;
}

// ---- public ---------------------------------------------------------------------------------------

export function degrade(raster, { level, view, seed }) {
  if (!LEVELS.includes(level)) throw new Error(`unknown level: ${level}`);
  const viewScale = VIEWS[view];
  if (!viewScale) throw new Error(`unknown view: ${view}`);
  const rng = mulberry32(seed >>> 0);
  const p0 = raster.pxPerPoint || MASTER_PX_PER_POINT;
  const widthPts = raster.width / p0;
  const heightPts = raster.height / p0;
  const W = Math.max(1, Math.round(widthPts * viewScale));
  const H = Math.max(1, Math.round(heightPts * viewScale));
  const sx = W / widthPts;
  const sy = H / heightPts;

  let data = resample(raster.data, raster.width, raster.height, W, H);

  let skewDeg = 0;
  if (level === 'scan') skewDeg = 0.3 * (rng() < 0.5 ? -1 : 1);
  else if (level === 'phone') skewDeg = 1.5 * (rng() < 0.5 ? -1 : 1);
  const theta = (skewDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const cx = W / 2;
  const cy = H / 2;
  if (theta !== 0) data = rotate(data, W, H, theta);

  const sigmaScale = viewScale / MASTER_PX_PER_POINT;
  let bytes;
  if (level === 'scan') {
    data = blur(data, W, H, 0.6 * sigmaScale);
    addNoise(data, 6, rng);
  } else if (level === 'phone') {
    data = blur(data, W, H, 1.0 * sigmaScale);
    applyIllumination(data, W, H, rng);
    addNoise(data, 4, rng);
  } else if (level === 'fax') {
    bytes = faxEffects(data, W, H, viewScale, rng);
  }
  if (!bytes) {
    bytes = new Uint8ClampedArray(W * H);
    bytes.set(data); // Float32 -> clamped, rounded
  }

  return {
    raster: { id: raster.id, width: W, height: H, pxPerPoint: viewScale, data: bytes },
    mapPoint(xPts, yPts) {
      const dx = xPts * sx - cx;
      const dy = yPts * sy - cy;
      return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    },
    unmapPoint(x, y) {
      const dx = x - cx;
      const dy = y - cy;
      return { x: (cx + dx * cos + dy * sin) / sx, y: (cy - dx * sin + dy * cos) / sy };
    },
  };
}
