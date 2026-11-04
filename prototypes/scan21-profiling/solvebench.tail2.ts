
{
  const lines = randomLines(5, 60, 0.05);
  for (let w = 0; w < 5; w++) fit(lines);
  const t0 = performance.now(); const N = 300;
  for (let r = 0; r < N; r++) fit(lines);
  console.log('banded', ((performance.now() - t0) / N).toFixed(2), 'ms per fit');
}
