// The files a guard may judge: what git tracks, plus new files not yet added. A gitignored file is
// local to one machine (the impeccable plugin drops its skill and agent files into every app-made
// worktree) and CI never sees it, so a guard that reads the bare filesystem fails locally on files
// CI passes without. Same file set as check-js-typed.mjs.
import { execFileSync } from 'node:child_process';

export function repoFiles(root) {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return new Set(out.split('\0').filter(Boolean));
}

// A path exists for a guard when git knows it as a file or as a folder holding one.
export function repoPathExists(files) {
  const dirs = new Set();
  for (const f of files) for (let i = f.indexOf('/'); i !== -1; i = f.indexOf('/', i + 1)) dirs.add(f.slice(0, i));
  return (p) => files.has(p) || dirs.has(p);
}
