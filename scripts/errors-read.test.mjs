import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Runs the real scripts/errors-read.mjs against a local stand-in for the Upstash REST pipeline, so the
// wiring (window vs history, what prints before the verdict) is proved end to end, not by its parts.
// ERRORS_READ_OFFLINE keeps it from fetching origin; git lookups then simply say they could not tell.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flat = (obj) => Object.entries(obj ?? {}).flatMap(([k, v]) => [k, String(v)]);

const X = 'redact|TypeError|redact.Zn9K1YuS.js:44:99875|apply_boxes|chromium-143';
const Y = 'drafts|QuotaExceededError|useDraftPersistence.AbCdEfGh.js:1:2|save|chromium-150';
const SAMPLE_X = JSON.stringify({ stack: ['redact.Zn9K1YuS.js:44:99875'], step: 'apply_boxes', tool: '/redact/', installed: false, sw: true, age: 'under_1m', actions: [], engine: 'chromium-143' });

// The pipeline body is 9n commands in a fixed order: [errors, sample] per day, then events, usage, errorTotal,
// usageTotal, drops, rejects, rejectsTotal per day.
function repliesFor(commandCount, days) {
  const n = commandCount / 9;
  const at = (i) => days[i] ?? {};
  const out = [];
  for (let i = 0; i < n; i++) out.push({ result: flat(at(i).counts) }, { result: flat(at(i).samples) });
  for (let i = 0; i < n; i++) out.push({ result: [] });
  for (let i = 0; i < n; i++) out.push({ result: flat(at(i).usage) });
  for (let i = 0; i < n; i++) out.push({ result: at(i).errorTotal == null ? null : String(at(i).errorTotal) });
  for (let i = 0; i < n; i++) out.push({ result: at(i).usageTotal == null ? null : String(at(i).usageTotal) });
  for (let i = 0; i < n; i++) out.push({ result: flat(at(i).drops) });
  for (let i = 0; i < n; i++) out.push({ result: flat(at(i).rejects) });
  for (let i = 0; i < n; i++) out.push({ result: at(i).rejectsTotal == null ? null : String(at(i).rejectsTotal) });
  return out;
}

let server;
afterEach(() => new Promise((resolve) => (server ? server.close(resolve) : resolve())));

async function readWith(args, respond) {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const commands = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(respond(commands.length)));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['scripts/errors-read.mjs', ...args],
      { cwd: root, env: { PATH: process.env.PATH, KV_REST_API_URL: `http://127.0.0.1:${port}`, KV_REST_API_TOKEN: 'test', ERRORS_READ_OFFLINE: '1' }, timeout: 30000 },
      (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }),
    );
  });
}

describe('errors-read wiring', () => {
  const days = [
    { counts: { [X]: 2 }, samples: { [X]: SAMPLE_X }, usage: { 'tool_operation_started|redact': 21, 'tool_operation_failed|redact': 11 }, errorTotal: 2, usageTotal: 32 },
    { counts: { [Y]: 7 }, usage: { 'tool_operation_started|redact': 40 }, errorTotal: 7, usageTotal: 40 },
    {},
  ];

  it('leads with the verdict and counts the window only, while history informs first-seen and the baseline', async () => {
    const { code, stdout } = await readWith(['--days', '1', '--history', '3'], (n) => repliesFor(n, days));
    expect(code).toBe(0);
    const lines = stdout.split('\n');
    expect(lines[0]).toMatch(/^Needs attention \(\d+\)$/);
    expect(stdout).toContain('UNKNOWN  2x redact TypeError apply_boxes on redact (chromium-143)');
    expect(stdout).toContain('RISING  redact: failed 11 of 21 started (52%), none failed earlier');
    // The window is one day: yesterday's fingerprint and starts are history, not counts.
    expect(stdout).toContain('2 | redact | TypeError | redact.Zn9K1YuS.js:44:99875 | apply_boxes | chromium-143');
    expect(stdout).not.toContain('7 | drafts');
    expect(stdout).toMatch(/redact \| 0 \| 21 \| 0 \| 11 \|/);
    expect(stdout).toContain('window 1 day, history 3');
  });

  it('warns before the verdict when the store answered with errors, instead of an all-clear', async () => {
    const { stdout } = await readWith(['--days', '1', '--history', '2'], (n) => Array.from({ length: n }, () => ({ error: 'ERR boom' })));
    const lines = stdout.split('\n');
    expect(lines[0]).toMatch(/^WARNING: the store returned errors/);
    expect(lines.findIndex((l) => l.startsWith('Needs attention'))).toBeGreaterThan(0);
  });

  it('warns before the verdict when a window day reached its cap', async () => {
    const capped = [{ counts: { [X]: 2 }, samples: { [X]: SAMPLE_X }, errorTotal: 1500 }, {}];
    const { stdout } = await readWith(['--days', '1', '--history', '2'], (n) => repliesFor(n, capped));
    const lines = stdout.split('\n');
    expect(lines[0]).toMatch(/^WARNING: .* reached the daily cap/);
    expect(lines.findIndex((l) => l.startsWith('Needs attention'))).toBeGreaterThan(0);
  });

  it('prints drop records, endpoint rejects, build-stamped failures and untraced tools', async () => {
    const D = 'sign_export|export|non_error|TypeError|-|-|chromium-143';
    const one = [{
      drops: { [D]: 3 },
      rejects: { 'oversize|chromium-143': 2 },
      rejectsTotal: 250,
      usage: { 'tool_operation_started|redact|08e10cf': 4, 'tool_operation_failed|redact|08e10cf': 3, 'tool_operation_failed|redact': 2 },
    }];
    const { stdout } = await readWith(['--days', '1', '--history', '2'], (n) => repliesFor(n, one));
    const at = (s) => stdout.indexOf(s);
    expect(stdout).toMatch(/^WARNING: .*endpoint rejects/m);
    expect(stdout).toContain('Reports not sent (drop records)');
    expect(stdout).toContain('count | area | step | reason | type | name | build | engine');
    expect(stdout).toContain('3 | sign_export | export | non_error | TypeError | - | - | chromium-143');
    expect(stdout).toContain('Rejected by the endpoint');
    expect(stdout).toContain('2 | oversize | chromium-143');
    expect(at('Reports not sent')).toBeGreaterThan(at('count | area | name | frame'));
    expect(at('Reports not sent')).toBeLessThan(at('Sign maintenance events'));
    expect(stdout).toContain('redact: failed 5 (08e10cf 3, unstamped 2)');
    expect(stdout).toContain('UNTRACED  redact: 5 failures left no report and no drop record');
    expect(stdout).toMatch(/redact \| 0 \| 4 \| 0 \| 5 \|/);
  });

  it('says none when nothing was dropped or rejected', async () => {
    const { stdout } = await readWith(['--days', '2', '--history', '3'], (n) => repliesFor(n, []));
    expect(stdout).toContain('(none in the last 2 days)');
  });

  it('a short reply array does not crash the reader', async () => {
    const { code, stdout } = await readWith(['--days', '1', '--history', '3'], () => []);
    expect(code).toBe(0);
    expect(stdout).toContain('Needs attention: nothing');
  });
});
