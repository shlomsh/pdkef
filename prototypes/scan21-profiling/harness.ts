// Throwaway profiling harness for SCAN-21. Bundled with esbuild, run in Chromium.
import * as P from 'SRC/tools/scan/lib/scanPipeline.ts';
import { measureBend, isFlat, pageMap, toGray, FLAT_PAGE } from 'SRC/tools/scan/lib/dewarp/index.ts';
import { pageMasks } from 'SRC/tools/scan/lib/dewarp/ink.ts';
import { lineFit } from 'SRC/tools/scan/lib/dewarp/lineBend.ts';
import { columnFit } from 'SRC/tools/scan/lib/dewarp/columnBend.ts';
import { findEdgeCurves } from 'SRC/tools/scan/lib/dewarp/edgeCurves.ts';
import { warpAlong } from 'SRC/tools/scan/lib/dewarp/meshWarp.ts';
import { warpPerspective, warpSize } from 'SRC/tools/scan/lib/warp.ts';
import { applyFilter } from 'SRC/tools/scan/lib/filters.ts';
import { homography, applyHomography } from 'SRC/tools/scan/lib/homography.ts';
import { insetQuad, scaleQuad, type Quad } from 'SRC/tools/scan/lib/quad.ts';

const W = 3200, H = 2400;
const UNIT: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const QUAD: Quad = [{ x: 0.12, y: 0.08 }, { x: 0.86, y: 0.05 }, { x: 0.9, y: 0.95 }, { x: 0.08, y: 0.92 }];
const BOOK = (x: number, y: number) => 0.06 * (1 - y) * (x * x - x + 1 / 6);
function ink(u: number, v: number, form: boolean) {
  if (u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92) return false;
  if (form && [0.1, 0.35, 0.6, 0.9].some((r) => Math.abs(u - r) < 0.0025)) return true;
  const row = (v - 0.1) / 0.03;
  if (row < 0 || row - Math.floor(row) > 0.25) return false;
  return (u * 41 + Math.floor(row) * 0.37) % 1 < 0.8;
}
async function makePhoto(form: boolean): Promise<Blob> {
  const qpx = QUAD.map((p) => ({ x: p.x * W, y: p.y * H })) as Quad;
  const inv = homography(qpx, UNIT);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const top = (u: number) => u * (1 - u) * -0.08;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const { x: u, y: v0 } = applyHomography(inv, { x: x + 0.5, y: y + 0.5 });
    const v = (v0 - top(u)) / (1 - top(u));
    let g = 50;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) g = ink(u, v - BOOK(u, v), form) ? 45 : 225 - 20 * u;
    g += ((x * 7 + y * 13) % 9) - 4;
    const o = (y * W + x) * 4; img.data[o] = g; img.data[o + 1] = g; img.data[o + 2] = g; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
}
const now = () => performance.now();
async function stages(photo: Blob) {
  const t: Record<string, number> = {};
  let s = now();
  const url = URL.createObjectURL(photo); const im = new Image(); im.src = url; await im.decode(); URL.revokeObjectURL(url);
  t['decode <img>'] = now() - s; s = now();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(im, 0, 0);
  const src = cx.getImageData(0, 0, W, H);
  t['draw 3200 + getImageData'] = now() - s; s = now();
  const quadPx = scaleQuad(insetQuad(QUAD, 0.016), W, H);
  const { width, height } = warpSize(quadPx, 2400);
  const bend = measureBend(src, QUAD, 0.008, width, height);
  t['measureBend (total)'] = now() - s; s = now();
  // measureBend's parts, re-run on their own
  const small = { width: 1066, height: 800, data: new Uint8ClampedArray(1066 * 800 * 4) };
  { const k = 3; for (let y = 0; y < 800; y++) for (let x = 0; x < 1066; x++) { let r = 0; for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) r += src.data[((y * k + yy) * W + x * k + xx) * 4]; const o = (y * 1066 + x) * 4; small.data[o] = small.data[o + 1] = small.data[o + 2] = r / 9; small.data[o + 3] = 255; } }
  t['  shrink to 1000'] = now() - s; s = now();
  const qs = scaleQuad(QUAD, small.width, small.height);
  const curves = findEdgeCurves(toGray(small), qs);
  t['  edge curves'] = now() - s; s = now();
  const f = Math.min(1, 1000 / Math.max(width, height));
  const gray = toGray(warpAlong(small, pageMap(qs, 0.008, { ...FLAT_PAGE, curves }), Math.round(width * f), Math.round(height * f)));
  t['  small warp'] = now() - s; s = now();
  const masks = pageMasks(gray);
  t['  ink + rule masks'] = now() - s; s = now();
  const rows = lineFit(masks);
  t['  lineFit (samples + 2 solves)'] = now() - s; s = now();
  const rules = columnFit(masks);
  t['  columnFit (samples + 2 solves)'] = now() - s; s = now();
  const warped = isFlat(bend) ? warpPerspective(src, quadPx, width, height) : warpAlong(src, pageMap(scaleQuad(QUAD, W, H), 0.008, bend), width, height);
  t['warp 2400'] = now() - s; s = now();
  const flat = applyFilter(warped, 'document');
  t['applyFilter document'] = now() - s; s = now();
  const out = document.createElement('canvas'); out.width = width; out.height = height;
  out.getContext('2d')!.putImageData(new ImageData(flat.data as any, width, height), 0, 0);
  await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92));
  t['putImageData + JPEG 0.92'] = now() - s; s = now();
  const sm = document.createElement('canvas'); sm.width = 480; sm.height = Math.round(480 * height / width);
  sm.getContext('2d')!.drawImage(out, 0, 0, sm.width, sm.height);
  await new Promise((r) => sm.toBlob(r, 'image/jpeg', 0.8));
  t['thumb + JPEG'] = now() - s; s = now();
  return { t, flat: isFlat(bend), lines: !!bend.lines, columns: !!bend.columns, curves: !!bend.curves, rows: !!rows, rules: !!rules };
}
async function whole(photo: Blob, quad: Quad | null) {
  const longs: number[] = [];
  const obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(Math.round(e.duration))));
  obs.observe({ type: 'longtask', buffered: false });
  let s = now();
  const insp = await P.inspectPhoto(photo);
  const tInspect = now() - s; s = now();
  const page = await P.processPage(photo, quad ?? insp.quad ?? QUAD, 'document');
  const tProcess = now() - s;
  await new Promise((r) => setTimeout(r, 100));
  obs.disconnect();
  return { tInspect, tProcess, longs, maxLong: Math.max(0, ...longs), quad: insp.quad, page: { w: page.width, h: page.height, bentPx: (page as any).bentPx, bytes: page.blob.size } };
}
(window as any).harness = { makePhoto, stages, whole, QUAD };
