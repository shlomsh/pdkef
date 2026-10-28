// QUAL-34's per-file e2e verdicts for files no Nx project owns (UNOWNED_VERDICTS), plus the reader
// that tells whether a ci.yml edit touched the font-guards job. Used by affected-scope.mjs; it decides
// scope, so it is in that file's ORACLE_FILES.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

// QUAL-34: verdicts for files no Nx project owns, each backed by what reads the file (the `why`).
// `e2e` is 'none' (no spec or build step reads it), a list of spec dirs, or 'all' (every product
// spec, fonts off unless something else turns them on). Anything not here widens as before.
const rowOf = (test, e2e, why) => ({ test, verdict: { e2e }, why });
export const UNOWNED_VERDICTS = [
  rowOf((f) => f === 'middleware.ts' || f === 'vercel.json' || f.startsWith('api/'), 'none', 'astro preview runs no middleware, reads no vercel.json and serves no api/; test:csp and test:redirects cover them'),
  rowOf(
    (f) => /^(?:spikes|prototypes|security)\//.test(f) || f === '.gitignore' || f === '.github/dependabot.yml' || f.startsWith('.github/ISSUE_TEMPLATE/') || f === 'public/llms.txt' || f === 'public/agents.md',
    'none',
    'no spec or build step reads it',
  ),
  rowOf((f) => f === 'public/manifest.webmanifest', ['e2e/offline/'], 'precached and served like every public file; only the e2e/offline/ update specs exercise that'),
  rowOf((f) => f === 'public/sw.js' || f.startsWith('public/images/'), 'all', 'every page registers the worker and tool specs open public/images/**; no font guard reads either'),
  rowOf((f) => f === '.github/workflows/ci.yml', 'all', 'a workflow edit can break any job; font guards only when the font-guards job or a shared part changed'),
  rowOf((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f), 'none', "another workflow runs its own jobs; ci.yml's specs never execute it (ci.yml itself is matched by the row above)"),
];

export function unownedRowOf(file) {
  return UNOWNED_VERDICTS.find((row) => row.test(file)) ?? null;
}

export function unownedVerdictOf(file) {
  return unownedRowOf(file)?.verdict ?? null;
}

// The files Nx is asked about: table files are left out, or middleware.ts would mark most projects affected.
export function filesForNx(files) {
  return files.filter((f) => !unownedRowOf(f));
}

// QUAL-34: does a ci.yml change reach the `job`? `hunks` are new-side {start, count} ranges from
// `git diff -U0`. Lines outside every job (on:, env:, jobs:) count as touching every job.
export function ciChangeTouchesJob(ciText, hunks, job) {
  const lines = ciText.split('\n');
  const header = (line) => /^ {2}[\w-]+:/.test(line);
  const jobsAt = lines.findIndex((l) => l === 'jobs:');
  const jobStarts = [];
  lines.forEach((l, i) => { if (jobsAt >= 0 && i > jobsAt && header(l)) jobStarts.push(i + 1); });
  const first = jobStarts[0] ?? lines.length + 1;
  const mine = jobStarts.indexOf(lines.findIndex((l) => l.startsWith(`  ${job}:`)) + 1);
  if (mine < 0) return true; // renamed or deleted: fail open, the guards run
  const from = mine >= 0 ? jobStarts[mine] : -1;
  const to = mine >= 0 ? (jobStarts[mine + 1] ?? lines.length + 1) - 1 : -1;
  return hunks.some(({ start, count }) => {
    const touched = count === 0 ? [start, start + 1] : Array.from({ length: count }, (_, k) => start + k);
    return touched.some((n) => n < first || n === jobsAt + 1 || (n >= from && n <= to));
  });
}

export function parseHunks(diffText) {
  return [...diffText.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)].map((m) => ({ start: Number(m[1]), count: m[2] === undefined ? 1 : Number(m[2]) }));
}

// QUAL-34: did the ci.yml edit touch the font-guards job or anything outside a job? Any error answers
// true (fail-open: the font guards run).
export const CI_FILE = '.github/workflows/ci.yml';
export function ciFontJobChangedBetween(base, head) {
  try {
    const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
    const text = head ? git(['show', `${head}:${CI_FILE}`]) : readFileSync(join(ROOT, CI_FILE), 'utf8');
    const diff = git(['diff', '-U0', base, ...(head ? [head] : []), '--', CI_FILE]);
    return ciChangeTouchesJob(text, parseHunks(diff), 'font-guards');
  } catch {
    return true;
  }
}
