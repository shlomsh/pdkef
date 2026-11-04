
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
