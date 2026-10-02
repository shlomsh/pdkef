// Maps a reported production frame (chunk.js:line:col) back to source.
// Production ships no source maps; builds are deterministic and a hidden
// sourcemap does not change any emitted .js, so the content-hashed chunk
// filename identifies the build. Walk first-parent history of origin/main,
// rebuild each commit with hidden sourcemaps, stop at the one that emits the
// chunk, and decode the position. Decoder: @jridgewell/trace-mapping.
//
//   npm run errors:resolve -- PdfSignTool.Ab12Cd.js:12:345 [more frames, top first] [--max 40]
//   npm run errors:resolve -- <frames> --build <sha>
// Reports carry the 7-hex-char commit of the build the page came from (`build`); errors:read prints
// the exact command. With --build ONE commit (any commit, not only first-parent) is checked out and
// built, and a miss is an error, never a search. Without it the first-parent window of --from is walked.
// A build is the one only if it emitted EVERY frame's chunk. A shared vendor chunk (Sortable, Preact)
// keeps its hash across builds, so matching on one frame names a newer build than the report's own.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

// Same shape as FRAME in src/lib/errorReport.ts.
const BUILD = /^[0-9a-f]{7,40}$/i;
const FRAME = /^([A-Za-z0-9_.-]{1,120}\.m?js):(\d{1,7}):(\d{1,7})$/;

export function parseFrame(text) {
  const m = FRAME.exec(String(text ?? '').trim());
  if (!m) return null;
  return { chunk: m[1], line: Number(m[2]), col: Number(m[3]) };
}

export function wrapperConfigText() {
  return [
    "import base from './astro.config.mjs';",
    'export default {',
    '  ...base,',
    '  vite: {',
    '    ...base.vite,',
    '    // The temp tree symlinks the main node_modules; without this vite resolves through the link and astro fails.',
    '    resolve: { ...base.vite?.resolve, preserveSymlinks: true },',
    '    build: { ...base.vite?.build, sourcemap: "hidden" },',
    '  },',
    '};',
    '',
  ].join('\n');
}

// Which of a report's chunks a build emitted. `all` is the only thing that makes it the report's build.
export function matchChunks(frames, emitted) {
  const have = new Set(emitted);
  const missing = [...new Set(frames.map((f) => f.chunk))].filter((chunk) => !have.has(chunk));
  return { all: missing.length === 0, missing };
}

// Browser columns are 1-based; trace-mapping's are 0-based. Lines are 1-based in both.
export function mapFrame(mapJson, line, col) {
  const map = new TraceMap(typeof mapJson === 'string' ? JSON.parse(mapJson) : mapJson);
  const pos = originalPositionFor(map, { line, column: Math.max(0, col - 1) });
  if (pos.source == null) return null;
  return { source: pos.source, line: pos.line, column: pos.column + 1, name: pos.name };
}

// A minified dependency's "line" is the whole file. Show ~width chars centred on the 1-based column.
export function clipLine(text, col, width = 160) {
  if (text.length <= width) return text;
  const start = Math.max(0, Math.min(col - 1 - Math.floor(width / 2), text.length - width));
  const end = Math.min(text.length, start + width);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function parseArgs(argv) {
  let max = 40;
  // Deployed builds come from main; --from walks another ref, like a local
  // branch carrying a build that was never deployed.
  let from = 'origin/main';
  let build = null;
  let error;
  const frames = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max') max = Number(argv[++i]);
    else if (argv[i] === '--from') from = argv[++i] ?? from;
    else if (argv[i] === '--build') {
      const v = argv[++i];
      if (typeof v === 'string' && BUILD.test(v)) build = v.toLowerCase();
      else error = `--build needs a 7 to 40 character commit hash, got: ${v ?? '(nothing)'}`;
    } else frames.push(argv[i]);
  }
  const out = { frames, max: Number.isInteger(max) && max > 0 ? max : 40, from, build };
  if (error) out.error = error;
  return out;
}

// The commits to build. With a known build it is exactly one, any commit (a deploy
// need not be on first-parent history); otherwise the first-parent window of `from`.
// `git(...args)` is injected so this stays pure.
export function candidateShas({ build, from, max }, git) {
  if (!build) return { shas: git('rev-list', '--first-parent', '-n', String(max), from).split('\n').filter(Boolean) };
  const resolve = () => { try { return git('rev-parse', '--verify', `${build}^{commit}`) || null; } catch { return null; } };
  let sha = resolve();
  if (!sha) {
    try { git('fetch', 'origin'); } catch {}
    sha = resolve();
  }
  return sha ? { shas: [sha] } : { error: `commit ${build} is not in this repository (git fetch origin?)` };
}

export function buildMissMessage(sha, missing) {
  return `commit ${sha.slice(0, 8)} did not emit ${missing.join(', ')}: this report did not come from ${sha.slice(0, 8)}, or the build is not reproducible; try without --build`;
}

// Builds each commit in turn until one emits every frame's chunk, then decodes. All I/O is in `deps`:
// checkout(sha), build() -> boolean, readEmitted() -> chunk names, readMap(chunk) -> map json | null,
// readSource(chunk, source) -> text | null, subject(sha), log(line) for progress.
// Returns { found, lines, nearest, last }: nearest is the first partial match, last the final commit tried.
export function searchCommits(shas, frames, deps) {
  const log = deps.log ?? (() => {});
  const chunks = new Set(frames.map((f) => f.chunk));
  let nearest = null;
  let last = null;
  for (let i = 0; i < shas.length; i++) {
    const sha = shas[i];
    const t0 = Date.now();
    deps.checkout(sha);
    const built = deps.build();
    const match = built ? matchChunks(frames, deps.readEmitted()) : null;
    const hit = match?.all === true;
    const partial = match && !hit && match.missing.length < chunks.size;
    if (partial && !nearest) nearest = { sha, missing: match.missing };
    last = { sha, missing: match ? match.missing : [...chunks] };
    log(`[${i + 1}/${shas.length}] ${sha.slice(0, 8)} ${hit ? 'HIT' : partial ? `partial (missing ${match.missing.length})` : built ? 'no match' : 'build failed'} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (!hit) continue;
    const lines = [`${sha.slice(0, 8)} ${deps.subject(sha)}`];
    frames.forEach((fr, k) => {
      const head = `#${k + 1} ${fr.chunk}:${fr.line}:${fr.col}`;
      const json = deps.readMap(fr.chunk);
      if (!json) { lines.push(`${head}\n  (chunk not in this build)`); return; }
      const pos = mapFrame(json, fr.line, fr.col);
      if (!pos) { lines.push(`${head}\n  no source mapping for that position`); return; }
      lines.push(`#${k + 1} ${pos.source}:${pos.line}:${pos.column}${pos.name ? ` (${pos.name})` : ''}`);
      const text = deps.readSource(fr.chunk, pos.source);
      if (text != null) {
        const src = text.split('\n');
        for (let n = Math.max(1, pos.line - 1); n <= Math.min(src.length, pos.line + 1); n++) {
          lines.push(`${n === pos.line ? '>' : ' '} ${String(n).padStart(5)}  ${clipLine(src[n - 1], pos.column)}`);
        }
      }
    });
    return { found: true, lines, nearest, last };
  }
  return { found: false, lines: [], nearest, last };
}

// Parses every raw frame; one bad frame fails the lot with a one-line message.
export function parseFrames(raws) {
  if (!raws.length) return { error: 'no frames given' };
  const frames = [];
  for (let i = 0; i < raws.length; i++) {
    const f = parseFrame(raws[i]);
    if (!f) return { error: `frame #${i + 1} is not chunk.js:line:col: ${raws[i]}` };
    frames.push(f);
  }
  return { frames };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function main() {
  const { frames: raws, max, from, build, error } = parseArgs(process.argv.slice(2));
  const usage = '(usage: npm run errors:resolve -- <chunk.js:line:col>... [--build <sha>] [--max 40] [--from origin/main])';
  const parsed = error ? { error } : parseFrames(raws);
  if (parsed.error) {
    console.error(`errors:resolve: ${parsed.error} ${usage}`);
    process.exit(2);
  }
  const frames = parsed.frames;
  const cands = candidateShas({ build, from, max }, (...args) => git(root, ...args));
  if (cands.error) {
    console.error(`errors:resolve: ${cands.error}`);
    process.exit(1);
  }
  const shas = cands.shas;
  const tmp = path.join(mkdtempSync(path.join(tmpdir(), 'errors-resolve-')), 'wt');
  const astroDir = path.join(tmp, 'dist', '_astro');
  let added = false;
  const cleanup = () => {
    if (!added) return;
    added = false;
    try { rmSync(path.join(tmp, 'node_modules'), { force: true }); } catch {}
    try { git(root, 'worktree', 'remove', '--force', tmp); } catch {}
    try { git(root, 'worktree', 'prune'); } catch {}
  };
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  const deps = {
    checkout(sha) {
      if (!added) { git(root, 'worktree', 'add', '--detach', tmp, sha); added = true; }
      else git(tmp, 'checkout', '--detach', sha);
    },
    build() {
      const nm = path.join(tmp, 'node_modules');
      const sameLock = readFileSync(path.join(tmp, 'package-lock.json'), 'utf8') === readFileSync(path.join(root, 'package-lock.json'), 'utf8');
      rmSync(nm, { recursive: true, force: true });
      if (sameLock) symlinkSync(path.join(root, 'node_modules'), nm);
      else spawnSync('npm', ['ci'], { cwd: tmp, stdio: 'inherit' });
      writeFileSync(path.join(tmp, 'astro.sourcemap.config.mjs'), wrapperConfigText());
      const b = spawnSync('node', ['node_modules/astro/bin/astro.mjs', 'build', '--config', 'astro.sourcemap.config.mjs'], { cwd: tmp, encoding: 'utf8' });
      return b.status === 0 && existsSync(astroDir);
    },
    readEmitted: () => readdirSync(astroDir),
    readMap(chunk) {
      const mapFile = path.join(astroDir, `${chunk}.map`);
      return existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : null;
    },
    readSource(chunk, source) {
      const file = path.resolve(astroDir, source);
      return existsSync(file) ? readFileSync(file, 'utf8') : null;
    },
    subject: (sha) => git(root, 'log', '-1', '--format=%s', sha),
    log: (line) => console.error(line),
  };
  let result;
  try {
    result = searchCommits(shas, frames, deps);
  } finally {
    cleanup();
  }
  if (result.found) {
    for (const line of result.lines) console.log(line);
    return;
  }
  if (build) {
    console.error(`errors:resolve: ${buildMissMessage(result.last.sha, result.last.missing)}`);
  } else {
    console.error(`no build in the last ${shas.length} first-parent commits of ${from} emitted every chunk of this report`);
    if (result.nearest) console.error(`nearest: ${result.nearest.sha.slice(0, 8)} had some of them but not ${result.nearest.missing.join(', ')}. The report likely came from a build older than the window; try --max higher.`);
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
