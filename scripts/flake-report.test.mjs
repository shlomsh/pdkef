import { describe, expect, it } from 'vitest';
import { aggregate, parseReport, renderFlakeSummary } from './flake-report.mjs';

// A Playwright JSON report with one spec and the given per-attempt statuses.
function report(specs) {
  return {
    suites: [{
      title: 'a.spec.js',
      file: 'a.spec.js',
      specs: specs.map(({ title, attempts }) => ({
        title,
        file: 'a.spec.js',
        tests: [{ projectName: 'chromium', results: attempts.map((status, retry) => ({ status, retry })) }],
      })),
      suites: [],
    }],
  };
}

describe('parseReport', () => {
  it('flattens nested suites into per-spec results', () => {
    const r = { suites: [{ title: 'f', file: 'f.spec.js', specs: [], suites: [{ title: 'inner', specs: [{ title: 't', file: 'f.spec.js', tests: [{ projectName: 'chromium', results: [{ status: 'passed', retry: 0 }] }] }] }] }] };
    const rows = parseReport(r);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('f.spec.js > t [chromium]');
  });
});

describe('aggregate and renderFlakeSummary', () => {
  // 100 runs: "bad" fails 3 times (3%), "ok" fails once (1%), "retry" passes after a retry once.
  const reports = [];
  for (let i = 0; i < 100; i++) {
    reports.push(report([
      { title: 'bad', attempts: [i < 3 ? 'failed' : 'passed'] },
      { title: 'ok', attempts: [i < 1 ? 'timedOut' : 'passed'] },
      { title: 'retry', attempts: i === 50 ? ['failed', 'passed'] : ['passed'] },
      { title: 'skip', attempts: ['skipped'] },
    ]));
  }

  it('computes failure and retry rates per spec', () => {
    const rows = aggregate(reports);
    const bad = rows.find((r) => r.key.includes('bad'));
    expect(bad.failures).toBe(3);
    expect(bad.runs).toBe(100);
    expect(bad.failureRate).toBeCloseTo(0.03);
    const retry = rows.find((r) => r.key.includes('retry'));
    expect(retry.retries).toBe(1);
    expect(rows.find((r) => r.key.includes('skip'))).toBeUndefined();
  });

  it('names a 3% spec and not a 1% spec above the 2% line', () => {
    const md = renderFlakeSummary(aggregate(reports), { threshold: 0.02, runs: 100 });
    expect(md).toContain('Above 2%');
    expect(md).toMatch(/bad/);
    const above = md.split('### Top offenders')[0];
    expect(above).toContain('bad');
    expect(above).not.toContain('a.spec.js > ok');
  });

  it('says so when nothing is above the line', () => {
    const md = renderFlakeSummary(aggregate([report([{ title: 'fine', attempts: ['passed'] }])]), { threshold: 0.02, runs: 1 });
    expect(md).toContain('No spec is above 2%');
  });
});
