import { seededRandom } from '/home/user/pdkef/.claude/worktrees/agent-adfe21a1b2631f824/src/tools/scan/lib/edges/testImages.ts';
import { fit, type Fit, type Sample } from '/home/user/pdkef/.claude/worktrees/agent-adfe21a1b2631f824/src/tools/scan/lib/dewarp/lineBend.ts';
const ALONG = 16;
const ACROSS = 16;
const STIFFNESS = 2e-4;
const GAUGE = 1;
const RIDGE = 1e-9;

/** The pre-SCAN-21 fit, verbatim: grid nodes and line offsets in one dense Cholesky. */
function denseFit(lines: Sample[][]): Fit | null {
  const nodes = ALONG * ACROSS;
  const n = nodes + lines.length;
  const a = new Float64Array(n * n);
  const b = new Float64Array(n);
  const total = lines.reduce((t, l) => t + l.length, 0);
  const wData = 1 / total;
  const idx = [0, 0, 0, 0, 0];
  const w = [0, 0, 0, 0, 1];
  lines.forEach((samples, line) => {
    for (const p of samples) {
      const gx = Math.min(1, Math.max(0, p.x)) * (ALONG - 1);
      const gy = Math.min(1, Math.max(0, p.y)) * (ACROSS - 1);
      const i = Math.min(ALONG - 2, Math.floor(gx));
      const j = Math.min(ACROSS - 2, Math.floor(gy));
      const tx = gx - i;
      const ty = gy - j;
      const k = j * ALONG + i;
      idx[0] = k; idx[1] = k + 1; idx[2] = k + ALONG; idx[3] = k + ALONG + 1; idx[4] = nodes + line;
      w[0] = (1 - tx) * (1 - ty); w[1] = tx * (1 - ty); w[2] = (1 - tx) * ty; w[3] = tx * ty;
      for (let r = 0; r < 5; r += 1) {
        for (let c = 0; c < 5; c += 1) a[idx[r] * n + idx[c]] += wData * w[r] * w[c];
        b[idx[r]] += wData * w[r] * p.y;
      }
    }
  });
  const stencil = (k0: number, k1: number, k2: number) => {
    const ks = [k0, k1, k2];
    const cs = [1, -2, 1];
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) a[ks[r] * n + ks[c]] += STIFFNESS * cs[r] * cs[c];
  };
  for (let j = 0; j < ACROSS; j += 1) for (let i = 1; i < ALONG - 1; i += 1) stencil(j * ALONG + i - 1, j * ALONG + i, j * ALONG + i + 1);
  for (let i = 0; i < ALONG; i += 1) for (let j = 1; j < ACROSS - 1; j += 1) stencil((j - 1) * ALONG + i, j * ALONG + i, (j + 1) * ALONG + i);
  for (let j = 0; j < ACROSS; j += 1) {
    for (let r = 0; r < ALONG; r += 1) for (let c = 0; c < ALONG; c += 1) a[(j * ALONG + r) * n + j * ALONG + c] += GAUGE;
  }
  for (let k = 0; k < nodes; k += 1) a[k * n + k] += RIDGE;
  for (let j = 0; j < n; j += 1) {
    let diag = a[j * n + j];
    for (let k = 0; k < j; k += 1) diag -= a[j * n + k] ** 2;
    if (!(diag > 1e-18)) return null;
    const l = Math.sqrt(diag);
    a[j * n + j] = l;
    for (let i = j + 1; i < n; i += 1) {
      let v = a[i * n + j];
      for (let k = 0; k < j; k += 1) v -= a[i * n + k] * a[j * n + k];
      a[i * n + j] = v / l;
    }
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let v = b[i];
    for (let k = 0; k < i; k += 1) v -= a[i * n + k] * x[k];
    x[i] = v / a[i * n + i];
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    let v = x[i];
    for (let k = i + 1; k < n; k += 1) v -= a[k * n + i] * x[k];
    x[i] = v / a[i * n + i];
  }
  return { bend: { nx: ALONG, ny: ACROSS, d: Array.from(x.subarray(0, nodes)) }, offsets: Array.from(x.subarray(nodes)) };
}

/** `count` lines across the page: each a height, a lean (steep ones cross several rows of the grid), a
 * bow and some noise, sampled at sorted random points, a few just outside 0..1. */
function randomLines(seed: number, count: number, steep: number): Sample[][] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (_, line) => {
    const base = 0.05 + 0.9 * rnd();
    const lean = (rnd() - 0.5) * steep;
    const bow = (rnd() - 0.5) * 0.04;
    const from = -0.02 + rnd() * 0.4;
    const to = from + 0.2 + rnd() * (1.04 - from - 0.2);
    const n = 10 + Math.floor(rnd() * 90);
    const xs = Array.from({ length: n }, () => from + rnd() * (to - from)).sort((p, q) => p - q);
    return xs.map((x) => ({ line, x, y: base + lean * (x - 0.5) + bow * (x - from) * (to - x) + (rnd() - 0.5) * 0.004 }));
  });
}

const maxDiff = (a: number[], b: number[]) => a.reduce((m, v, k) => Math.max(m, Math.abs(v - b[k])), 0);

let worst = 0;
for (let seed = 1; seed <= 200; seed += 1) {
  const lines = randomLines(seed, 4 + ((seed * 7) % 57), seed % 4 === 0 ? 0.6 : 0.05);
  const a = fit(lines)!; const b = denseFit(lines)!;
  worst = Math.max(worst, maxDiff(a.bend.d, b.bend.d), maxDiff(a.offsets, b.offsets));
}
console.log('max abs diff over 200 problems', worst);
for (const count of [20, 60]) {
  const lines = randomLines(5, count, 0.05);
  for (const [name, f] of [['dense', denseFit], ['banded', fit]] as const) {
    for (let w = 0; w < 5; w++) f(lines);
    const t0 = performance.now(); const N = 30;
    for (let r = 0; r < N; r++) f(lines);
    console.log(count, 'lines', name, ((performance.now() - t0) / N).toFixed(2), 'ms per fit');
  }
}
