// The files a guard may judge: what git tracks, plus new files not yet added. A gitignored file is
// local to one machine (the impeccable plugin drops .claude/skills/impeccable/ into every app-made
// worktree) and CI never sees it, so a guard that reads the bare filesystem fails locally on files
// CI passes without. Same file set as check-js-typed.mjs.
import { execFileSync } from 'node:child_process';

export function repoFiles(root) {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return new Set(out.split('\0').filter(Boolean));
}
