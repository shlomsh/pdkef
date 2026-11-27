// LAND-04: landmines/no-test-doubles is on. A double that stays is allowed on its own line only, by
// `// oxlint-disable-next-line landmines/no-test-doubles -- Forced: <why nothing real can do it here>`
// (docs/landmines/no-test-doubles.md). LAND-07 holds no-silent-catch, no-elapsed-time-bound and
// no-parameter-branch to the same shape, and LAND-08 no-conditional-expect, each with its own reason. This finds a disable of one of these
// rules that is wider than one line or has no reason.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REASONS = [
  { rule: 'landmines/no-test-doubles', reason: 'Forced: ', hint: 'Forced: <why nothing real can do it here>' },
  { rule: 'landmines/no-silent-catch', reason: '', hint: '<why losing it is fine>' },
  { rule: 'landmines/no-elapsed-time-bound', reason: '', hint: '<why the bound is deliberate>' },
  { rule: 'landmines/no-parameter-branch', reason: '', hint: '<why the case table cannot hold it>' },
  { rule: 'landmines/no-conditional-expect', reason: '', hint: '<why the branch is the point, and what makes both sides run>' },
].map((r) => ({ ...r, perLine: new RegExp(`// oxlint-disable-next-line ${r.rule.replace('/', '\\/')} -- ${r.reason}\\S.{11,}`) }));
const CODE = /\.(?:[cm]?js|jsx|tsx?)$/;

/** Pure: each line of `text` that disables one of the rules without a per-line reason, as `path:line: problem`. */
export function reasonProblems(file, text) {
  const problems = [];
  text.split('\n').forEach((line, i) => {
    if (!/(?:oxlint|eslint)-disable/.test(line)) return;
    const r = REASONS.find(({ rule }) => line.includes(rule));
    if (!r || r.perLine.test(line)) return;
    const where = `${file}:${i + 1}`;
    if (!/disable-next-line/.test(line)) problems.push(`${where}: disable the rule on one line, with oxlint-disable-next-line`);
    else problems.push(`${where}: give the reason as "-- ${r.hint}"`);
  });
  return problems;
}
/** Every problem in the tracked code files under `root`, this file and its test aside. */
export function repoReasonProblems(root) {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')
    .filter((file) => CODE.test(file) && !file.startsWith('scripts/test-double-reasons.'));
  return files.flatMap((file) => reasonProblems(file, fs.readFileSync(path.join(root, file), 'utf8')));
}
