// Scored KPIs for a page detector over a labelled corpus. Pure: no DOM, no files.
// Truth and guesses are normalized, upright, top-left first (docs/scan-to-pdf.md).
import type { GrayImage, Point, Quad } from '#lib/pageEnhance/quad.ts';

/** @testSeam */
export const TOLERANCES = [0.02, 0.035, 0.08] as const;
const FOUND_TOL = 0.035;
/** A guess further than this from the truth is confidently wrong, not just imprecise. */
const WRONG_TOL = 0.08;

/** @testSeam */
export interface KpiCase {
  name: string;
  image: GrayImage;
  /** Null: there is no page in the photo. */
  truth: Quad | null;
  conditions: string[];
  /** Null counts as a right answer even though a truth is given (the page is partly out of frame). */
  nullOk?: boolean;
  /** Tolerance override for the found-rate counts of this case. */
  tol?: number;
}

type Guess = (image: GrayImage, c: KpiCase) => Quad | null;

/** @testSeam */
export interface KpiResult {
  n: number;
  /** Share of cases answered right, keyed by tolerance ("0.02", "0.035", "0.08"). */
  found: Record<string, number>;
  /** Over cases that have a page; an unanswered one counts as 1. */
  medianError: number;
  maxError: number;
  /** Over cases that have a page; an unanswered one counts as 0. */
  medianIou: number;
  /** A guess further than WRONG_TOL from the truth, or any guess on a photo with no page. */
  confidentlyWrong: number;
  /** Share of no-page photos answered null; null when the corpus has none. */
  nullOnNoPage: number | null;
  /** Found-rate at FOUND_TOL per condition. */
  byCondition: Record<string, number>;
}

/** Largest per-axis distance between matched corners. */
/** @testSeam */
export function cornerError(guess: Quad, truth: Quad): number {
  return Math.max(...guess.map((p, i) => Math.max(Math.abs(p.x - truth[i].x), Math.abs(p.y - truth[i].y))));
}

const area = (poly: Point[]): number => {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

/** Sutherland-Hodgman: clip a polygon by a convex counter-clockwise clipper. */
function clip(subject: Point[], clipper: Point[]): Point[] {
  let out = subject;
  for (let i = 0; i < clipper.length && out.length; i += 1) {
    const a = clipper[i];
    const b = clipper[(i + 1) % clipper.length];
    const side = (p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j += 1) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
      }
    }
  }
  return out;
}

/** Intersection over union of two convex quads, whichever way their corners wind. */
/** @testSeam */
export function quadIou(a: Quad, b: Quad): number {
  const ccw = (q: Quad): Point[] => (area(q) < 0 ? [...q].reverse() : [...q]);
  const pa = ccw(a);
  const pb = ccw(b);
  const inter = Math.abs(area(clip(pa, pb)));
  const union = Math.abs(area(pa)) + Math.abs(area(pb)) - inter;
  return union > 0 ? inter / union : 0;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const key = (t: number) => String(t);

/** @testSeam */
export function scoreDetector(cases: KpiCase[], guess: Guess): KpiResult {
  const found: Record<string, number> = Object.fromEntries(TOLERANCES.map((t) => [key(t), 0]));
  const condTotal: Record<string, number> = {};
  const condFound: Record<string, number> = {};
  const errors: number[] = [];
  const ious: number[] = [];
  let confidentlyWrong = 0;
  let noPage = 0;
  let noPageNull = 0;

  for (const c of cases) {
    const got = guess(c.image, c);
    const err = got && c.truth ? cornerError(got, c.truth) : null;
    const right = (tol: number): boolean => {
      if (!c.truth) return got === null;
      if (!got) return !!c.nullOk;
      return (err as number) <= (c.tol ?? tol);
    };
    for (const t of TOLERANCES) if (right(t)) found[key(t)] += 1;
    if (!c.truth) {
      noPage += 1;
      if (!got) noPageNull += 1;
      else confidentlyWrong += 1;
    } else {
      errors.push(err ?? 1);
      ious.push(got ? quadIou(got, c.truth) : 0);
      if (err !== null && err > WRONG_TOL) confidentlyWrong += 1;
    }
    for (const cond of c.conditions) {
      condTotal[cond] = (condTotal[cond] ?? 0) + 1;
      if (right(FOUND_TOL)) condFound[cond] = (condFound[cond] ?? 0) + 1;
    }
  }

  const n = cases.length;
  return {
    n,
    found: Object.fromEntries(Object.entries(found).map(([k, v]) => [k, n ? v / n : 0])),
    medianError: median(errors),
    maxError: errors.length ? Math.max(...errors) : 0,
    medianIou: median(ious),
    confidentlyWrong,
    nullOnNoPage: noPage ? noPageNull / noPage : null,
    byCondition: Object.fromEntries(Object.entries(condTotal).map(([k, v]) => [k, (condFound[k] ?? 0) / v])),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** @testSeam */
export function formatKpiTable(r: KpiResult): string {
  const rows: [string, string][] = [
    ['photos', String(r.n)],
    ...TOLERANCES.map((t): [string, string] => [`found@${t}`, pct(r.found[key(t)])]),
    ['median err', r.medianError.toFixed(4)],
    ['max err', r.maxError.toFixed(4)],
    ['median IoU', r.medianIou.toFixed(4)],
    ['confidently wrong', String(r.confidentlyWrong)],
    ['null on no page', r.nullOnNoPage === null ? 'n/a' : pct(r.nullOnNoPage)],
    ...Object.entries(r.byCondition).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]): [string, string] => [`  ${k}`, pct(v)]),
  ];
  const w = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k.padEnd(w)}  ${v}`).join('\n');
}
