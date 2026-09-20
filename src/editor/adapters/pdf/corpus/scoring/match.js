/**
 * The matcher: does a detected field count as having found a real one?
 *
 * Lifted out of `scripts/spike/mobi-10/score.mjs` under MOBI-13 so that
 * product-side scoring can use it, since `src/` may not import `scripts/`
 * (rule 8 of docs/module-boundaries.md, no allowlist). `score.mjs` is now a
 * thin wrapper over this, the same direction MOBI-11 took for `cells.mjs` and
 * `label.mjs`: the spike's CLI keeps working and the algorithm has one home.
 *
 * Every number recorded in `docs/mobi-10-field-map-spike.md` was measured with
 * exactly this code, so changing any of it re-bases those numbers and the
 * baselines in `baselines.json` alike. Kind compatibility is the subtle part:
 * a `date` candidate is an acceptable answer to a `text` target because the
 * detector is allowed to be more specific than the form, but a `signature`
 * target can only be answered by a signature, which is why our practice form
 * reports a miss there rather than a pass.
 */

const KIND_GROUPS = [
  new Set(['text', 'table-cell', 'date']),
  new Set(['comb', 'date']),
  new Set(['checkbox', 'radio']),
];

export function kindsCompatible(a, b) {
  if (a === b) return true;
  if (a === 'unknown' || b === 'unknown') return true;
  return KIND_GROUPS.some((group) => group.has(a) && group.has(b));
}

export function iou(a, b) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const union = a.width * a.height + b.width * b.height - inter;
  if (!(union > 0)) return 0;
  return inter / union;
}

/** One-to-one greedy IoU matching, highest-scoring pair claimed first. */
export function greedyMatch(targets, candidates, iouThreshold) {
  const pairs = [];
  for (const t of targets) {
    for (const c of candidates) {
      if (t.pageIndex !== c.pageIndex) continue;
      if (!kindsCompatible(t.kind, c.kind)) continue;
      const score = iou(t.bounds, c.bounds);
      if (score >= iouThreshold) pairs.push({ t, c, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedTargets = new Set();
  const usedCandidates = new Set();
  const matches = [];
  for (const pair of pairs) {
    if (usedTargets.has(pair.t.id) || usedCandidates.has(pair.c.id)) continue;
    usedTargets.add(pair.t.id);
    usedCandidates.add(pair.c.id);
    matches.push(pair);
  }
  const misses = targets.filter((t) => !usedTargets.has(t.id));
  const falsePositives = candidates.filter((c) => !usedCandidates.has(c.id));
  return { matches, misses, falsePositives };
}
