/**
 * Axis-aligned ink read from a page raster, in the shape `collectPageInk` reports (FORM-07 spike).
 *
 * A scanned form has no content stream to walk: its page is one image, so the vector collector
 * finds nothing and every detector downstream (`findCombRuns`, `findCheckboxes`,
 * `detectCellCandidates`, `detectLineCandidates`) has nothing to read. Those detectors only ask for
 * `{verticals, horizontals, rects}` in PDF points, y up. This module produces that same shape from
 * pixels, with classical image processing and no model, no library and no DOM, so the existing
 * detectors can run on a scan unchanged.
 *
 * The method, in the order it runs:
 *
 * 1. **Luminance and a global Otsu threshold.** Accepts gray, RGB or RGBA (a canvas `ImageData` is
 *    RGBA). A page that comes out mostly ink is inverted once, so white-on-black input works.
 *
 * 2. **Skew first.** A rule that drifts one pixel every 100 breaks into short runs, and a run scan
 *    then finds nothing long. The angle is the one that makes the horizontal strokes' row
 *    histogram sharpest (a projection profile), searched coarse to fine over +-5 degrees. The gray
 *    page is rotated (bilinear, so a one pixel rule stays one rule) and thresholded again. A page
 *    whose drift across its own width is under one pixel is left untouched.
 *
 * 3. **Long runs, not an opening.** Each row is scanned for dark runs that bridge small gaps and
 *    stay dense, and runs on adjacent rows stack into one band. The same scan over the transposed
 *    mask finds the verticals. A band thicker than a rule (a heading bar, a filled arrow) is not
 *    a rule and is dropped. Collinear fragments are then merged.
 *
 * 4. **Checkboxes from connected components.** A component of checkbox size, square, hollow, and
 *    straight on all four sides is a box. A letter "O" or "D" fails the straight-sides test.
 *
 * Every threshold is in points or a fraction of the image, never in pixels, so a 150 dpi scan and a
 * 400 dpi scan take the same parameters. Output is in the deskewed frame (the page as it should
 * have been scanned); `skewDegrees` reports what was undone.
 */

/** Rules shorter than this are not a ruled edge; checkbox sides (about 8 points) fall below it. */
const MIN_HORIZONTAL_PTS = 12;
/** Verticals are allowed to be shorter, because comb teeth are. Glyph stems (about 7 points) fall below. */
const MIN_VERTICAL_PTS = 9;
/** A band thicker than this is a filled bar or a heading stroke, not a ruled line (points). */
const MAX_RULE_THICKNESS_PTS = 1.6;
/** A run may bridge a speck or a hairline break this wide (points). */
const BRIDGE_GAP_PTS = 1;
/** Within a bridged run, the share that must be ink; keeps rows of dense text from reading as a rule. */
const MIN_RUN_DENSITY = 0.8;
/** A row belongs to a band's core when its run covers at least this much of the band's span. */
const CORE_ROW_SHARE = 0.5;
/** Two runs on adjacent rows are one band when they overlap by at least this much of the shorter. */
const BAND_OVERLAP = 0.5;
/** Collinear fragments closer than this on the cross axis are one rule (points). */
const MERGE_OFFSET_PTS = 1;
/**
 * Collinear fragments with a gap at most this wide merge into one rule (points). It is also how a
 * dashed rule ("beginning ------") becomes the one rule a vector form would have drawn.
 */
const MERGE_GAP_PTS = 2.5;
/**
 * A merged rule must be this much ink along its span. Dashes pass (a dash is most of its pitch);
 * the flat feet of letters along a baseline do not, which is what keeps text from chaining into a rule.
 */
const MIN_MERGED_DENSITY = 0.75;

/**
 * Printed text makes strokes that look like short rules (the bar of a T, an E, a dash). What tells
 * a rule from them is the form's own letter size, so rules must be this many letter heights long
 * (horizontal) or this many tall (vertical), on top of the point floors above.
 */
const RULE_LETTER_HEIGHTS = 3;
const VERTICAL_RULE_LETTER_HEIGHTS = 1.5;
/** Components shorter than this are specks and dots, not letters, when measuring letter height (points). */
const MIN_LETTER_PTS = 3;
/** Fewer letter-sized components than this is not text, so there is no text size to learn. */
const MIN_LETTER_SAMPLES = 30;
/** Components taller than this are logos, rules or ink blobs, not letters (points). */
const MAX_LETTER_PTS = 20;

/** A checkbox is a hollow square between these sides (points); `findCheckboxes` applies its own window. */
const BOX_MIN_PTS = 4;
const BOX_MAX_PTS = 16;
const BOX_SQUARENESS = 0.15;
/** The share of each side of the box outline that must be ink. */
const BOX_SIDE_COVERAGE = 0.85;
/** The most ink the inside of a box may hold (an unticked box is empty). */
const BOX_MAX_INTERIOR_INK = 0.3;

/** Skew search window and resolution, in degrees. */
const SKEW_RANGE_DEGREES = 5;
const SKEW_COARSE_STEP = 0.5;
const SKEW_FINE_STEP = 0.05;
/** Angles scoring within this share of the best are the same answer (a plateau, not a peak). */
const PLATEAU_SHARE = 0.999;
/** Cap on the points the projection profile reads, so its cost does not grow with the scan. */
const SKEW_MAX_SAMPLES = 250000;

/* ---------- luminance and threshold ---------- */

/** Gray levels from a gray, RGB or RGBA buffer, told apart by length. */
function toGray({ data, width, height }) {
  const pixels = width * height;
  if (data.length === pixels) return Uint8Array.from(data);
  const stride = data.length === pixels * 3 ? 3 : 4;
  const gray = new Uint8Array(pixels);
  for (let i = 0, j = 0; i < pixels; i += 1, j += stride) {
    gray[i] = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
  }
  return gray;
}

/** Otsu's threshold: the gray level that best splits the histogram into ink and paper. */
export function otsuThreshold(gray) {
  const histogram = new Float64Array(256);
  for (let i = 0; i < gray.length; i += 1) histogram[gray[i]] += 1;
  let sumAll = 0;
  for (let level = 0; level < 256; level += 1) sumAll += level * histogram[level];
  let weightBack = 0;
  let sumBack = 0;
  let best = 0;
  let bestVariance = -1;
  for (let level = 0; level < 256; level += 1) {
    weightBack += histogram[level];
    if (weightBack === 0) continue;
    const weightFront = gray.length - weightBack;
    if (weightFront === 0) break;
    sumBack += level * histogram[level];
    const meanBack = sumBack / weightBack;
    const meanFront = (sumAll - sumBack) / weightFront;
    const variance = weightBack * weightFront * (meanBack - meanFront) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }
  return best;
}

/** 1 where a pixel is ink (at or below the threshold), 0 elsewhere. */
function binarize(gray, threshold) {
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) mask[i] = gray[i] <= threshold ? 1 : 0;
  return mask;
}

/** A page that is mostly "ink" is white-on-black: flip it so ink is the minority. */
function invertIfMostlyInk(gray, mask) {
  let ink = 0;
  for (let i = 0; i < mask.length; i += 1) ink += mask[i];
  if (ink * 2 <= mask.length) return { gray, mask };
  const flipped = gray.map((value) => 255 - value);
  return { gray: flipped, mask: binarize(flipped, otsuThreshold(flipped)) };
}

/* ---------- skew ---------- */

/** Points on horizontal structure (ink with ink on both sides), thinned to a fixed sample budget. */
function horizontalStructurePoints(mask, width, height) {
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) if (mask[row + x] && mask[row + x - 1] && mask[row + x + 1]) total += 1;
  }
  const stride = Math.max(1, Math.ceil(total / SKEW_MAX_SAMPLES));
  const xs = new Int32Array(Math.ceil(total / stride) + 1);
  const ys = new Int32Array(xs.length);
  let seen = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      if (!(mask[row + x] && mask[row + x - 1] && mask[row + x + 1])) continue;
      if (seen % stride === 0) {
        xs[count] = x;
        ys[count] = y;
        count += 1;
      }
      seen += 1;
    }
  }
  return { xs: xs.subarray(0, count), ys: ys.subarray(0, count) };
}

/**
 * How sharp the row histogram is when the points are sheared by `slope` (dy/dx). Sum of squared
 * bin counts: many points sharing a row is exactly what a flat rule or a line of text does.
 */
function profileSharpness(points, slope, width, bins) {
  bins.fill(0);
  const pad = Math.ceil(Math.abs(slope) * width) + 1;
  const cx = width / 2;
  for (let i = 0; i < points.xs.length; i += 1) {
    const row = Math.round(points.ys[i] - (points.xs[i] - cx) * slope) + pad;
    if (row >= 0 && row < bins.length) bins[row] += 1;
  }
  let sum = 0;
  for (let i = 0; i < bins.length; i += 1) sum += bins[i] * bins[i];
  return sum;
}

/**
 * The angle (degrees, rules' slope in image coordinates with y down) the page is rotated by.
 * Coarse then fine, so the cost is about forty profiles over a capped sample set.
 */
export function estimateSkewDegrees(mask, width, height) {
  const points = horizontalStructurePoints(mask, width, height);
  if (points.xs.length === 0) return 0;
  const bins = new Float64Array(height + 2 * (Math.ceil(Math.tan((SKEW_RANGE_DEGREES * Math.PI) / 180) * width) + 2) + 2);
  const sharpness = (degrees) => profileSharpness(points, Math.tan((degrees * Math.PI) / 180), width, bins);
  // Rules a few pixels thick score the same across a plateau of angles; the middle of the plateau
  // is the estimate, not whichever end the scan happened to reach first.
  const search = (from, to, step) => {
    const angles = [];
    const scores = [];
    for (let degrees = from; degrees <= to + 1e-9; degrees += step) {
      angles.push(degrees);
      scores.push(sharpness(degrees));
    }
    const best = Math.max(...scores);
    const plateau = angles.filter((_, i) => scores[i] >= best * PLATEAU_SHARE);
    return plateau.reduce((sum, degrees) => sum + degrees, 0) / plateau.length;
  };
  const coarse = search(-SKEW_RANGE_DEGREES, SKEW_RANGE_DEGREES, SKEW_COARSE_STEP);
  return search(coarse - SKEW_COARSE_STEP, coarse + SKEW_COARSE_STEP, SKEW_FINE_STEP);
}

/**
 * Where a pixel of the deskewed page sits on the original page: the same rotation `deskewGray`
 * samples with, as a function. Identity for a page that was not rotated.
 */
function skewedFrame(width, height, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  return (x, y) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
}

/** Rotates gray levels by `-degrees` about the centre (bilinear, white fill) so rules turn level. */
function deskewGray(gray, width, height, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const out = new Uint8Array(gray.length).fill(255);
  for (let y = 0; y < height; y += 1) {
    const dy = y - cy;
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const sx = cx + dx * cos - dy * sin;
      const sy = cy + dx * sin + dy * cos;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= width - 1 || y0 >= height - 1) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const i = y0 * width + x0;
      const top = gray[i] * (1 - fx) + gray[i + 1] * fx;
      const bottom = gray[i + width] * (1 - fx) + gray[i + width + 1] * fx;
      out[y * width + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return out;
}

/* ---------- long runs ---------- */

/**
 * Stacks the long dark runs of every row into bands. A band is one ruled line seen as a few
 * adjacent pixel rows: `{pos, a0, a1, thickness}` with `pos` the row (centre) and `a0..a1` the span.
 *
 * Row runs bridge gaps up to `gap` as long as the run stays `MIN_RUN_DENSITY` ink, so a rule with a
 * speck of paper in it is still one run and a line of text is not.
 */
function longRunBands(mask, width, height, { minLength, gap }) {
  const bands = [];
  let active = [];
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const runs = [];
    let start = -1;
    let last = -1;
    let ink = 0;
    const close = () => {
      const length = last + 1 - start;
      if (length >= minLength && ink / length >= MIN_RUN_DENSITY) runs.push([start, last + 1]);
      start = -1;
    };
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x]) {
        if (start < 0) {
          start = x;
          ink = 0;
        }
        last = x;
        ink += 1;
      } else if (start >= 0 && x - last > gap) {
        close();
      }
    }
    if (start >= 0) close();

    const next = [];
    for (const [a0, a1] of runs) {
      const hit = active.find((band) => {
        const overlap = Math.min(band.a1, a1) - Math.max(band.a0, a0);
        return overlap >= BAND_OVERLAP * Math.min(band.a1 - band.a0, a1 - a0);
      });
      if (hit && !next.includes(hit)) {
        hit.a0 = Math.min(hit.a0, a0);
        hit.a1 = Math.max(hit.a1, a1);
        hit.rows.push([y, a1 - a0]);
        next.push(hit);
      } else {
        next.push({ rows: [[y, a1 - a0]], a0, a1 });
      }
    }
    for (const band of active) if (!next.includes(band)) bands.push(band);
    active = next;
  }
  bands.push(...active);
  // Thickness and centre come from the rows that carry most of the span: a ragged rule has a few
  // outer rows that only bridge speckle, and counting them would read a 6 pixel rule as a bar.
  return bands.map((band) => {
    const core = band.rows.filter(([, length]) => length >= CORE_ROW_SHARE * (band.a1 - band.a0));
    const rows = core.length ? core : band.rows;
    return {
      pos: rows.reduce((sum, [y]) => sum + y + 0.5, 0) / rows.length,
      a0: band.a0,
      a1: band.a1,
      thickness: rows.length,
    };
  });
}

/** Rows become columns, so one scan finds both orientations. */
function transpose(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) out[x * height + y] = mask[row + x];
  }
  return out;
}

/**
 * Joins fragments of one rule: same cross-axis position within `offset`, a gap of at most `gap`
 * between them. Fragments come from a scan that lost a pixel or two, or from a rule rotated onto
 * the pixel grid in steps; neither is a real break.
 */
export function mergeCollinear(segments, { offset, gap }) {
  const sorted = [...segments].sort((a, b) => a.pos - b.pos);
  const lines = [];
  let cluster = [];
  const flush = () => {
    cluster.sort((a, b) => a.a0 - b.a0);
    let current = null;
    for (const seg of cluster) {
      if (current && seg.a0 - current.a1 <= gap && Math.abs(seg.pos - current.pos) <= offset) {
        const weightA = current.ink;
        const weightB = seg.a1 - seg.a0;
        current.pos = (current.pos * weightA + seg.pos * weightB) / (weightA + weightB);
        current.a1 = Math.max(current.a1, seg.a1);
        current.ink += seg.a1 - seg.a0;
        current.thickness = Math.max(current.thickness, seg.thickness);
      } else {
        if (current) lines.push(current);
        current = { ...seg, ink: seg.a1 - seg.a0 };
      }
    }
    if (current) lines.push(current);
    cluster = [];
  };
  for (const seg of sorted) {
    if (cluster.length && seg.pos - cluster[cluster.length - 1].pos > offset) flush();
    cluster.push(seg);
  }
  flush();
  return lines;
}

/** Bands of one orientation, as merged lines no thicker than a rule. */
function ruleLines(mask, width, height, { minLengthPx, gapPx, offsetPx, mergeGapPx, maxThicknessPx }) {
  const bands = longRunBands(mask, width, height, { minLength: minLengthPx, gap: gapPx });
  const merged = mergeCollinear(bands, { offset: offsetPx, gap: mergeGapPx });
  return merged.filter((line) => line.thickness <= maxThicknessPx
    && line.a1 - line.a0 >= minLengthPx
    && line.ink >= MIN_MERGED_DENSITY * (line.a1 - line.a0));
}

/* ---------- checkboxes ---------- */

/**
 * Connected components of the ink mask (8-connected), via row runs and union-find, with the
 * bounding box and ink count of each. Runs are typed arrays, so the cost is per run, not per pixel
 * object.
 */
export function connectedComponents(mask, width, height) {
  let capacity = 1024;
  let parent = new Int32Array(capacity);
  let runY = new Int32Array(capacity);
  let runX0 = new Int32Array(capacity);
  let runX1 = new Int32Array(capacity);
  let count = 0;
  const doubled = (source) => {
    const bigger = new Int32Array(capacity);
    bigger.set(source);
    return bigger;
  };
  const grow = () => {
    capacity *= 2;
    parent = doubled(parent);
    runY = doubled(runY);
    runX0 = doubled(runX0);
    runX1 = doubled(runX1);
  };
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let node = i;
    while (parent[node] !== root) {
      const up = parent[node];
      parent[node] = root;
      node = up;
    }
    return root;
  };

  let prevFirst = 0;
  let prevEnd = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const first = count;
    let x = 0;
    while (x < width) {
      if (!mask[row + x]) {
        x += 1;
        continue;
      }
      const x0 = x;
      while (x < width && mask[row + x]) x += 1;
      if (count === capacity) grow();
      parent[count] = count;
      runY[count] = y;
      runX0[count] = x0;
      runX1[count] = x;
      // Overlap with the previous row's runs, diagonals included (8-connected).
      for (let p = prevFirst; p < prevEnd; p += 1) {
        if (runX0[p] > x) break;
        if (runX1[p] >= x0) {
          const a = find(count);
          const b = find(p);
          if (a !== b) parent[a] = b;
        }
      }
      count += 1;
    }
    prevFirst = first;
    prevEnd = count;
  }

  const components = new Map();
  for (let i = 0; i < count; i += 1) {
    const root = find(i);
    let c = components.get(root);
    if (!c) {
      c = { x0: runX0[i], y0: runY[i], x1: runX1[i], y1: runY[i] + 1, ink: 0 };
      components.set(root, c);
    }
    c.x0 = Math.min(c.x0, runX0[i]);
    c.x1 = Math.max(c.x1, runX1[i]);
    c.y1 = Math.max(c.y1, runY[i] + 1);
    c.ink += runX1[i] - runX0[i];
  }
  return [...components.values()];
}

/** The share of positions along one side of the box with ink within `depth` pixels of the edge. */
function sideCoverage(mask, width, box, side, depth) {
  const horizontal = side === 'top' || side === 'bottom';
  const length = horizontal ? box.x1 - box.x0 : box.y1 - box.y0;
  let covered = 0;
  for (let t = 0; t < length; t += 1) {
    let hit = false;
    for (let d = 0; d < depth && !hit; d += 1) {
      let x;
      let y;
      if (side === 'top') [x, y] = [box.x0 + t, box.y0 + d];
      else if (side === 'bottom') [x, y] = [box.x0 + t, box.y1 - 1 - d];
      else if (side === 'left') [x, y] = [box.x0 + d, box.y0 + t];
      else [x, y] = [box.x1 - 1 - d, box.y0 + t];
      hit = mask[y * width + x] === 1;
    }
    if (hit) covered += 1;
  }
  return covered / length;
}

/** The share of the box's inside (inset by `inset` pixels) that is ink. */
function interiorInk(mask, width, box, inset) {
  let ink = 0;
  let area = 0;
  for (let y = box.y0 + inset; y < box.y1 - inset; y += 1) {
    for (let x = box.x0 + inset; x < box.x1 - inset; x += 1) {
      ink += mask[y * width + x];
      area += 1;
    }
  }
  return area > 0 ? ink / area : 1;
}

/**
 * The form's own capital height, in pixels: the 90th percentile of the heights of letter-sized
 * components (specks and dots below `MIN_LETTER_PTS` and logos above `MAX_LETTER_PTS` are not
 * letters). A median would land on the x-height, which is a third shorter than the capitals that
 * make the strokes a rule has to be told apart from. 0 when there is too little text for a size to
 * mean anything (a page that is only a comb would otherwise measure its own teeth).
 */
export function letterHeight(components, pxPerPoint) {
  const heights = components
    .map((c) => c.y1 - c.y0)
    .filter((h) => h >= MIN_LETTER_PTS * pxPerPoint && h <= MAX_LETTER_PTS * pxPerPoint)
    .sort((a, b) => a - b);
  return heights.length >= MIN_LETTER_SAMPLES ? heights[Math.floor(heights.length * 0.9)] : 0;
}

/** Hollow, square, straight-sided components of checkbox size, in pixels. */
function findBoxComponents(components, mask, width, pxPerPoint) {
  const minPx = BOX_MIN_PTS * pxPerPoint;
  const maxPx = BOX_MAX_PTS * pxPerPoint;
  const boxes = [];
  for (const c of components) {
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    if (Math.max(w, h) > maxPx || Math.min(w, h) < minPx) continue;
    if (Math.abs(w - h) > BOX_SQUARENESS * Math.max(w, h)) continue;
    // An outline of thickness t holds about 2t(w + h) ink; a filled blob holds w * h.
    if (c.ink > 0.6 * w * h) continue;
    // The outline's own thickness sets how far in from the edge ink may sit and still be "the
    // side" (a scanned stroke is ragged by a pixel or two). A round letter still fails: its sides
    // are arcs, and an arc is within that depth of its bounding box along only part of its length.
    const thickness = c.ink / (2 * (w + h));
    const depth = Math.max(2, Math.ceil(thickness * 0.75));
    const straight = ['top', 'bottom', 'left', 'right']
      .every((side) => sideCoverage(mask, width, c, side, depth) >= BOX_SIDE_COVERAGE);
    if (!straight) continue;
    if (interiorInk(mask, width, c, Math.ceil(thickness) + 1) > BOX_MAX_INTERIOR_INK) continue;
    boxes.push(c);
  }
  return boxes;
}

/* ---------- assembly ---------- */

/**
 * Axis-aligned ink of a page raster, in PDF points with y up.
 *
 * @param {{data: Uint8Array|Uint8ClampedArray, width: number, height: number}} raster gray, RGB or
 *   RGBA pixels, row-major from the top left (a canvas `ImageData` works as is).
 * @param {{pageWidthPts: number, pageHeightPts: number}} page the page's size, which is what
 *   turns pixels into points (and so DPI into a derived quantity, not an input).
 * @returns {{
 *   verticals: Array<{x: number, y0: number, y1: number}>,
 *   horizontals: Array<{y: number, x0: number, x1: number}>,
 *   rects: Array<{x: number, y: number, width: number, height: number, stroked: boolean, filled: boolean}>,
 *   skewDegrees: number,
 * }}
 */
export function inkFromRaster(raster, { pageWidthPts, pageHeightPts }) {
  const { width, height } = raster;
  const luminance = toGray(raster);
  let { gray, mask } = invertIfMostlyInk(luminance, binarize(luminance, otsuThreshold(luminance)));

  const skewDegrees = estimateSkewDegrees(mask, width, height);
  // Under a pixel of drift across the whole page is not worth a resample.
  const driftPx = Math.abs(Math.tan((skewDegrees * Math.PI) / 180)) * width;
  if (driftPx >= 1) {
    gray = deskewGray(gray, width, height, skewDegrees);
    mask = binarize(gray, otsuThreshold(gray));
  }

  const sx = pageWidthPts / width;
  const sy = pageHeightPts / height;
  const pxPerPoint = 1 / sx;
  const components = connectedComponents(mask, width, height);
  const letterPx = letterHeight(components, pxPerPoint);
  const scan = (minPts, minPx) => ({
    minLengthPx: Math.max(2, Math.round(Math.max(minPts * pxPerPoint, minPx))),
    gapPx: Math.max(1, Math.round(BRIDGE_GAP_PTS * pxPerPoint)),
    offsetPx: Math.max(1, MERGE_OFFSET_PTS * pxPerPoint),
    mergeGapPx: Math.max(1, MERGE_GAP_PTS * pxPerPoint),
    maxThicknessPx: Math.max(1, Math.round(MAX_RULE_THICKNESS_PTS * pxPerPoint)),
  });
  // Shapes were found in the deskewed frame; the page the person sees is the original, so each
  // shape's centre is carried back into it (shapes stay axis aligned, which is what the
  // detectors read, and the half-length times the skew is the only error left).
  const toSource = skewedFrame(width, height, driftPx >= 1 ? skewDegrees : 0);

  const horizontals = ruleLines(mask, width, height, scan(MIN_HORIZONTAL_PTS, RULE_LETTER_HEIGHTS * letterPx)).map((line) => {
    const [cx, cy] = toSource((line.a0 + line.a1) / 2, line.pos);
    const half = (line.a1 - line.a0) / 2;
    return { y: pageHeightPts - cy * sy, x0: (cx - half) * sx, x1: (cx + half) * sx };
  });
  const verticals = ruleLines(transpose(mask, width, height), height, width, scan(MIN_VERTICAL_PTS, VERTICAL_RULE_LETTER_HEIGHTS * letterPx)).map((line) => {
    const [cx, cy] = toSource(line.pos, (line.a0 + line.a1) / 2);
    const half = (line.a1 - line.a0) / 2;
    return { x: cx * sx, y0: pageHeightPts - (cy + half) * sy, y1: pageHeightPts - (cy - half) * sy };
  });
  const rects = findBoxComponents(components, mask, width, pxPerPoint).map((box) => {
    const [cx, cy] = toSource((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    return {
      x: (cx - w / 2) * sx,
      y: pageHeightPts - (cy + h / 2) * sy,
      width: w * sx,
      height: h * sy,
      stroked: true,
      filled: false,
    };
  });

  return { verticals, horizontals, rects, skewDegrees };
}
