// Maps a reported production frame (chunk.js:line:col) back to source.
// Production ships no source maps; builds are deterministic and a hidden
// sourcemap does not change any emitted .js, so the content-hashed chunk
// filename identifies the build. Walk first-parent history of origin/main,
// rebuild each commit with hidden sourcemaps, stop at the one that emits the
// chunk, and decode the position. Decoder: @jridgewell/trace-mapping.
//
//   npm run errors:resolve -- PdfSignTool.Ab12Cd.js:12:345 [more frames, top first] [--max 40]
// The first frame picks the build; every frame is mapped in that build.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

// Same shape as FRAME in src/lib/errorReport.ts.
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

// Browser columns are 1-based; trace-mapping's are 0-based. Lines are 1-based in both.
export function mapFrame(mapJson, line, col) {
  const map = new TraceMap(typeof mapJson === 'string' ? JSON.parse(mapJson) : mapJson);
  const pos = originalPositionFor(map, { line, column: Math.max(0, col - 1) });
  if (pos.source == null) return null;
  return { source: pos.source, line: pos.line, column: pos.column + 1, name: pos.name };
}

export function parseArgs(argv) {
  let max = 40;
  // Deployed builds come from main; --from walks another ref, like a local
  // branch carrying a build that was never deployed.
  let from = 'origin/main';
  const frames = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max') max = Number(argv[++i]);
    else if (argv[i] === '--from') from = argv[++i] ?? from;
    else frames.push(argv[i]);
  }
  return { frames, max: Number.isInteger(max) && max > 0 ? max : 40, from };
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
  const { frames: raws, max, from } = parseArgs(process.argv.slice(2));
  const parsed = parseFrames(raws);
  if (parsed.error) {
    console.error(`errors:resolve: ${parsed.error} (usage: npm run errors:resolve -- <chunk.js:line:col>... [--max 40] [--from origin/main])`);
    process.exit(2);
  }
  const frames = parsed.frames;
  const frame = frames[0];
  const shas = git(root, 'rev-list', '--first-parent', '-n', String(max), from).split('\n').filter(Boolean);
  const tmp = path.join(mkdtempSync(path.join(tmpdir(), 'errors-resolve-')), 'wt');
  let added = false;
  const cleanup = () => {
    if (!added) return;
    added = false;
    try { rmSync(path.join(tmp, 'node_modules'), { force: true }); } catch {}
    try { git(root, 'worktree', 'remove', '--force', tmp); } catch {}
    try { git(root, 'worktree', 'prune'); } catch {}
  };
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  let found = false;
  try {
    for (let i = 0; i < shas.length; i++) {
      const sha = shas[i];
      if (!added) { git(root, 'worktree', 'add', '--detach', tmp, sha); added = true; }
      else git(tmp, 'checkout', '--detach', sha);
      const t0 = Date.now();
      const nm = path.join(tmp, 'node_modules');
      const sameLock = readFileSync(path.join(tmp, 'package-lock.json'), 'utf8') === readFileSync(path.join(root, 'package-lock.json'), 'utf8');
      rmSync(nm, { recursive: true, force: true });
      if (sameLock) symlinkSync(path.join(root, 'node_modules'), nm);
      else spawnSync('npm', ['ci'], { cwd: tmp, stdio: 'inherit' });
      writeFileSync(path.join(tmp, 'astro.sourcemap.config.mjs'), wrapperConfigText());
      const b = spawnSync('node', ['node_modules/astro/bin/astro.mjs', 'build', '--config', 'astro.sourcemap.config.mjs'], { cwd: tmp, encoding: 'utf8' });
      const astroDir = path.join(tmp, 'dist', '_astro');
      const hit = b.status === 0 && existsSync(astroDir) && readdirSync(astroDir).includes(frame.chunk);
      console.error(`[${i + 1}/${shas.length}] ${sha.slice(0, 8)} ${hit ? 'HIT' : b.status === 0 ? 'no match' : 'build failed'} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      if (!hit) continue;
      console.log(`${sha.slice(0, 8)} ${git(root, 'log', '-1', '--format=%s', sha)}`);
      frames.forEach((fr, k) => {
        const mapFile = path.join(astroDir, `${fr.chunk}.map`);
        if (!existsSync(mapFile)) { console.log(`#${k + 1} ${fr.chunk}:${fr.line}:${fr.col}\n  (chunk not in this build)`); return; }
        const pos = mapFrame(JSON.parse(readFileSync(mapFile, 'utf8')), fr.line, fr.col);
        if (!pos) { console.log(`#${k + 1} ${fr.chunk}:${fr.line}:${fr.col}\n  no source mapping for that position`); return; }
        console.log(`#${k + 1} ${pos.source}:${pos.line}:${pos.column}${pos.name ? ` (${pos.name})` : ''}`);
        const file = path.resolve(path.dirname(mapFile), pos.source);
        if (existsSync(file)) {
          const lines = readFileSync(file, 'utf8').split('\n');
          for (let n = Math.max(1, pos.line - 1); n <= Math.min(lines.length, pos.line + 1); n++) {
            console.log(`${n === pos.line ? '>' : ' '} ${String(n).padStart(5)}  ${lines[n - 1]}`);
          }
        }
      });
      found = true;
      break;
    }
  } finally {
    cleanup();
  }
  if (!found) {
    console.error(`no build in the last ${shas.length} first-parent commits of ${from} emitted ${frame.chunk}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
