// LAND-04: landmines/no-test-doubles is on. A double that stays is allowed on its own line only, by
// `// oxlint-disable-next-line landmines/no-test-doubles -- Forced: <why nothing real can do it here>`
// (docs/landmines/no-test-doubles.md). This finds a disable of the rule that is wider than one line or has no reason.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RULE = 'landmines/no-test-doubles';
const PER_LINE = /\/\/ oxlint-disable-next-line landmines\/no-test-doubles -- Forced: \S.{11,}/;
const CODE = /\.(?:[cm]?js|jsx|tsx?)$/;

/** Pure: each line of `text` that disables the rule without a per-line `-- Forced:` reason, as `path:line: problem`. */
export function reasonProblems(file, text) {
  const problems = [];
  text.split('\n').forEach((line, i) => {
    if (!line.includes(RULE) || !/(?:oxlint|eslint)-disable/.test(line)) return;
    if (PER_LINE.test(line)) return;
    const where = `${file}:${i + 1}`;
    if (!/disable-next-line/.test(line)) problems.push(`${where}: disable the rule on one line, with oxlint-disable-next-line`);
    else problems.push(`${where}: give the reason as "-- Forced: <why nothing real can do it here>"`);
  });
  return problems;
}

/** Every problem in the tracked code files under `root`, this file and its test aside. */
export function repoReasonProblems(root) {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
    .filter((file) => CODE.test(file) && !file.startsWith('scripts/test-double-reasons.'));
  return files.flatMap((file) => reasonProblems(file, fs.readFileSync(path.join(root, file), 'utf8')));
}
