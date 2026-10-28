// QUAL-34's per-file e2e verdicts for files no Nx project owns (UNOWNED_VERDICTS), plus the reader
// that tells whether a ci.yml edit touched the font-guards job, and the one that tells whether a package.json
// edit reaches the build or an e2e script. Used by affected-scope.mjs; it decides
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
  rowOf(
    (f) => /^src\/tools\/sign\/lib\/fields\/corpus\/scoring\/forms\/[^/]+\.pdf$/.test(f),
    ['src/tools/sign/e2e/'],
    'owned by form-corpus, which no project depends on, yet a Sign spec opens these PDFs by path (QUAL-41)',
  ),
  rowOf((f) => f === 'public/sw.js' || f.startsWith('public/images/'), 'all', 'every page registers the worker and tool specs open public/images/**; no font guard reads either'),
  rowOf((f) => f === '.github/workflows/ci.yml', 'all', 'a workflow edit can break any job; font guards only when the font-guards job or a shared part changed'),
  rowOf((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f), 'none', "another workflow runs its own jobs; ci.yml's specs never execute it (ci.yml itself is matched by the row above)"),
];

export const PACKAGE_FILE = 'package.json';

export function unownedRowOf(file) {
  return UNOWNED_VERDICTS.find((row) => row.test(file)) ?? null;
}

export function unownedVerdictOf(file) {
  return unownedRowOf(file)?.verdict ?? null;
}

// The files Nx is asked about: table files are left out, or middleware.ts would mark most projects affected.
// QUAL-43: so is a package.json whose edit stays off the e2e path, since Nx marks every project affected by it.
export function filesForNx(files, { packageJsonOffPath = false } = {}) {
  return files.filter((f) => !unownedRowOf(f) && !(packageJsonOffPath && f === PACKAGE_FILE));
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

// QUAL-42: font-guards downloads the `dist` that `plan` builds and uploads, so an edit to either job can break it.
export const CI_FONT_JOBS = ['font-guards', 'plan'];
export function ciChangeReachesFontGuards(ciText, hunks) {
  return CI_FONT_JOBS.some((job) => ciChangeTouchesJob(ciText, hunks, job));
}

// QUAL-34: did the ci.yml edit touch the font-guards job or anything outside a job? Any error answers
// true (fail-open: the font guards run).
export const CI_FILE = '.github/workflows/ci.yml';
export function ciFontJobChangedBetween(base, head) {
  try {
    const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
    const text = head ? git(['show', `${head}:${CI_FILE}`]) : readFileSync(join(ROOT, CI_FILE), 'utf8');
    const diff = git(['diff', '-U0', base, ...(head ? [head] : []), '--', CI_FILE]);
    return ciChangeReachesFontGuards(text, parseHunks(diff));
  } catch {
    return true;
  }
}

// QUAL-43: does a package.json edit reach a product e2e? False only when both sides parse, every top-level key
// but `scripts` is deep-equal, and every added, removed or changed script is off the e2e path: build, preview,
// dev, the install lifecycle `npm ci` runs before every e2e job (install, prepare), their pre/post hooks, every
// test:e2e* script, and every script whose name appears in the text of one already on the path (however it is
// run: npm run, run-script, npm test, node --run, ...), read on both sides. Anything that throws answers true
// (fail-open: everything runs).
const stable = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.map(stable)}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)}}`) : JSON.stringify(v));
const withHooks = (name) => [name, `pre${name}`, `post${name}`];
const SEEDS = ['build', 'preview', 'dev', 'install', 'prepare'];
const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `npm test` and `npm start` name their script without saying `run`; `npm t` is the short form of the first.
const mentions = (text, name) => new RegExp(`(?<![\\w:.-])${escape(name)}(?![\\w:.-])`).test(text) || (name === 'test' && /\bnpm t\b/.test(text));

// The script names on the e2e path, given each name's script texts (one per side).
function e2ePathOf(texts) {
  const path = new Set([...SEEDS, ...[...texts.keys()].filter((n) => n.startsWith('test:e2e'))].flatMap(withHooks));
  const queue = [...path];
  while (queue.length > 0) {
    const own = texts.get(queue.pop()) ?? [];
    const calls = [...texts.keys()].filter((name) => !path.has(name) && own.some((text) => mentions(text, name)));
    for (const name of calls.flatMap(withHooks)) if (!path.has(name)) { path.add(name); queue.push(name); }
  }
  return path;
}

export function packageJsonReachesE2e(beforeText, afterText) {
  try {
    const sides = [JSON.parse(beforeText), JSON.parse(afterText)];
    if (sides.some((p) => !p || typeof p !== 'object' || Array.isArray(p))) return true;
    const [before, after] = sides.map(({ scripts, ...rest }) => ({ rest, scripts: scripts ?? {} }));
    if (stable(before.rest) !== stable(after.rest)) return true;
    const texts = new Map();
    for (const { scripts } of [before, after]) for (const [name, text] of Object.entries(scripts)) texts.set(name, [...(texts.get(name) ?? []), String(text)]);
    const path = e2ePathOf(texts);
    return [...texts.keys()].some((name) => path.has(name) && stable(before.scripts[name]) !== stable(after.scripts[name]));
  } catch {
    return true;
  }
}

// QUAL-43: the same question for a diff base..head (the working tree when head is unset); any error answers true.
export function packageJsonReachesE2eBetween(base, head) {
  try {
    const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
    const after = head ? git(['show', `${head}:${PACKAGE_FILE}`]) : readFileSync(join(ROOT, PACKAGE_FILE), 'utf8');
    return packageJsonReachesE2e(git(['show', `${base}:${PACKAGE_FILE}`]), after);
  } catch {
    return true;
  }
}
