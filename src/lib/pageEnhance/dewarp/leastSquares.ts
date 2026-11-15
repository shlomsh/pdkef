// Least squares over a small basis, solved by Gauss-Jordan elimination with partial pivoting. Pure: no DOM.

/** The weights w minimizing the squared error of y over sum(w[i] * basis(t)[i]) at the given points; null when the system is singular. */
export function leastSquares(ts: readonly number[], ys: readonly number[], basis: (t: number) => number[]): number[] | null {
  const n = basis(0).length;
  const m = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  ts.forEach((t, i) => {
    const f = basis(t);
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) m[r][c] += f[r] * f[c];
      m[r][n] += f[r] * ys[i];
    }
  });
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const k = m[r][col] / m[col][col];
      for (let c = col; c < n + 1; c += 1) m[r][c] -= k * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}
