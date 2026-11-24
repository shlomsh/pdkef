import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { browserTestCount, compareBrowserTests } from './check-browser-test-count.mjs';
import { readRatchetLimits } from './ratchet-limits.mjs';

const script = fileURLToPath(new URL('./check-browser-test-count.mjs', import.meta.url));
const report = (over = {}) => ({ success: true, numTotalTests: 12, numPassedTests: 11, numPendingTests: 1, testResults: [{}], ...over });

describe('browserTestCount', () => {
  it('counts every test of the run, skipped ones too', () => {
    expect(browserTestCount(report())).toBe(12);
  });
  it('refuses a report that is not a full run', () => {
    expect(() => browserTestCount({})).toThrow('numTotalTests');
    expect(() => browserTestCount(report({ numTotalTests: 0 }))).toThrow('no browser tests');
    expect(() => browserTestCount(report({ success: false }))).toThrow('failed');
  });
});

describe('compareBrowserTests', () => {
  it('fails above the record, passes at it and below it', () => {
    expect(compareBrowserTests(12, 13)).toEqual({ failed: true, lowered: false });
    expect(compareBrowserTests(12, 12)).toEqual({ failed: false, lowered: false });
    expect(compareBrowserTests(12, 11)).toEqual({ failed: false, lowered: true });
  });
});

describe('check-browser-test-count', () => {
  let dir = '';
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (count) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-tests-'));
    const file = path.join(dir, 'report.json');
    fs.writeFileSync(file, JSON.stringify(report({ numTotalTests: count })));
    try {
      return { code: 0, out: execFileSync(process.execPath, [script, file], { encoding: 'utf8', stdio: 'pipe' }) };
    } catch (error) {
      return { code: error.status, out: String(error.stderr) };
    }
  };
  const recorded = () => readRatchetLimits().browserTests.ci;

  it('passes at the recorded count', () => {
    expect(run(recorded()).code).toBe(0);
  });
  it('fails one above it, naming both counts and the way down', () => {
    const { code, out } = run(recorded() + 1);
    expect(code).toBe(1);
    expect(out).toContain(`${recorded() + 1} browser tests`);
    expect(out).toContain(`record is ${recorded()}`);
    expect(out).toContain('The browser layer stays small');
  });
  it('says the record can be lowered, and writes nothing', () => {
    const before = recorded();
    const { code, out } = run(before - 1);
    expect(code).toBe(0);
    expect(out).toContain(`${before} -> ${before - 1}`);
    expect(recorded()).toBe(before);
  });
  it('fails without a report', () => {
    expect(() => execFileSync(process.execPath, [script, '/nowhere/report.json'], { stdio: 'pipe' })).toThrow();
  });
});

describe('the units-browser job', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const job = workflow.slice(workflow.indexOf('\n  units-browser:\n'), workflow.indexOf('\n  plan:\n'));

  it('counts the run it just made', () => {
    const file = /--outputFile\.json=(\S+)/.exec(job)?.[1];
    expect(job).toContain('--reporter=json');
    expect(file).toBeTypeOf('string');
    expect(job.indexOf(`node scripts/check-browser-test-count.mjs ${file}`)).toBeGreaterThan(job.indexOf('vitest run --project=browser'));
  });
});
