// Runs package.json guard scripts directly instead of through one `npm run` each: a shell per
// guard, node_modules/.bin first on PATH, a few at a time, each guard's output printed whole in
// the order given. All of them run even when one fails. check-fast.mjs and check-push.mjs use it.

import { spawn as nodeSpawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function shellQuote(arg) {
  return `'${String(arg).replaceAll("'", "'\\''")}'`;
}

// Pure. The command string `npm run <name> -- <args>` would run, or an error saying why running it
// without npm would differ: an unknown name, a pre/post hook, or npm-only env the command reads.
export function resolveGuardCommand(name, scripts, extraArgs = []) {
  const command = scripts[name];
  if (typeof command !== 'string') throw new Error(`run-guards: unknown script "${name}"`);
  for (const hook of [`pre${name}`, `post${name}`]) {
    if (scripts[hook] !== undefined) throw new Error(`run-guards: "${name}" has a pre/post hook (${hook}) that only npm runs`);
  }
  const env = command.match(/\bnpm_(?:package|config|lifecycle)_\w*/);
  if (env) throw new Error(`run-guards: "${name}" reads ${env[0]}, which only npm sets`);
  return [command, ...extraArgs.map(shellQuote)].join(' ');
}

// Guards that read or write scripts/ratchet-limits.json (every npm script running a script that imports
// ratchet-limits.mjs; run-guards.test.mjs keeps this in step). They share one lane so a lowering is never lost.
export const RATCHET_FILE_GUARDS = ['test:any-ratchet', 'test:css', 'test:e2e-sleeps', 'test:hook-ratchet', 'test:js-typed', 'test:ratchet-raises', 'test:size-ratchet', 'test:unused-exports'];

function readScripts(root) {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
}

function runOne(command, { spawn, root, env }) {
  return new Promise((done) => {
    let output = '';
    let errors = '';
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      done({ ...status, output, errors });
    };
    const child = spawn(command, { shell: true, cwd: root, env });
    child.stdout?.on('data', (chunk) => (output += chunk));
    child.stderr?.on('data', (chunk) => (errors += chunk));
    child.on('error', (error) => finish({ ok: false, why: `spawn error: ${error.message}` }));
    child.on('close', (code, signal) => {
      if (signal) finish({ ok: false, why: `killed by ${signal}` });
      else finish(code === 0 ? { ok: true } : { ok: false, why: `exit ${code}` });
    });
  });
}

// `guards` are script names, or { name, command } for a command that is not a package.json script.
// Resolves to the names that failed, in the given order. Throws before starting anything when a name
// cannot be run without npm.
export async function runGuards(guards, options = {}) {
  const { concurrency = 4, ratchetGuards = new Set(RATCHET_FILE_GUARDS), spawn = nodeSpawn, root = ROOT, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = options;
  const scripts = options.scripts ?? readScripts(root);
  const jobs = guards.map((guard) => (typeof guard === 'string' ? { name: guard, command: resolveGuardCommand(guard, scripts) } : guard));
  const env = { ...(options.env ?? process.env) };
  env.PATH = [join(root, 'node_modules', '.bin'), env.PATH].filter(Boolean).join(delimiter);

  const results = new Array(jobs.length);
  const failed = [];
  let next = 0;
  let printed = 0;

  function flush() {
    while (printed < jobs.length && results[printed]) {
      const { name } = jobs[printed];
      const r = results[printed];
      const time = `${r.seconds.toFixed(1)}s`;
      out(r.ok ? `-- ${name} ok ${time}\n` : `-- ${name} FAILED ${time} (${r.why})\n`);
      if (r.output) out(r.output.endsWith('\n') ? r.output : `${r.output}\n`);
      if (r.errors) err(r.errors.endsWith('\n') ? r.errors : `${r.errors}\n`);
      if (!r.ok) failed.push(name);
      printed += 1;
    }
  }

  async function runJob(i) {
    const start = performance.now();
    const r = await runOne(jobs[i].command, { spawn, root, env });
    results[i] = { ...r, seconds: (performance.now() - start) / 1000 };
    flush();
  }

  const laneJobs = jobs.map((_, i) => i).filter((i) => ratchetGuards.has(jobs[i].name));
  const others = jobs.map((_, i) => i).filter((i) => !ratchetGuards.has(jobs[i].name));

  // Worker 0 runs the ratchet lane one guard at a time, then helps with the rest.
  async function worker(w) {
    if (w === 0) for (const i of laneJobs) await runJob(i);
    while (next < others.length) await runJob(others[next++]);
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, (_, w) => worker(w)));
  return failed;
}
