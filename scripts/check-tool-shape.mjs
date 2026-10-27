import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ARCH-45: every src/tools/<tool>/ follows one template (see the "Tool folder
// template" paragraph in .claude/rules/tools-and-shell.md). Structure only.
//   node scripts/check-tool-shape.mjs          fail (exit 1) naming each stray path
//   node scripts/check-tool-shape.mjs --list   violations grouped by tool, exit 0

const ROOT_FILES = [
  /^Pdf[^/]*Tool[^/]*\.tsx$/,
  /^Pdf[^/]*Tool[^/]*\.test\.tsx?$/,
  /^Pdf[^/]*Tool[^/]*\.module\.css$/,
  /^messages(\.test)?\.ts$/,
  /^project\.json$/,
];
const FOLDERS = new Set(['components', 'hooks', 'lib', 'state', 'e2e', 'verb', '__fixtures__']);

/** @param {string[]} paths repo-relative, forward-slash paths. @returns {string[]} the paths outside the template. */
export function findShapeViolations(paths) {
  const bad = [];
  for (const p of paths) {
    const m = /^src\/tools\/([^/]+)\/(.+)$/.exec(p);
    if (!m) continue;
    const parts = m[2].split('/');
    const ok = parts.length === 1 ? ROOT_FILES.some((re) => re.test(parts[0])) : FOLDERS.has(parts[0]);
    if (!ok) bad.push(p);
  }
  return bad;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = execFileSync('git', ['ls-files', 'src/tools'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean);
  const bad = findShapeViolations(files);
  if (process.argv.includes('--list')) {
    const byTool = new Map();
    for (const p of bad) {
      const tool = p.split('/')[2];
      byTool.set(tool, [...(byTool.get(tool) ?? []), p]);
    }
    for (const [tool, list] of byTool) {
      console.log(`${tool}: ${list.length}`);
      for (const p of list) console.log(`  ${p}`);
    }
    console.log(`total: ${bad.length}`);
  } else if (bad.length) {
    console.error(`Tool shape: ${bad.length} path(s) outside the template (ARCH-45):`);
    for (const p of bad) console.error(`  ${p}`);
    process.exit(1);
  } else {
    console.log('Tool shape OK');
  }
}
