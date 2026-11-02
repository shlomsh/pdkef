#!/usr/bin/env node
// Orphaned-selector guard (RED-30): fails when a diff deletes a CSS rule whose
// selector list continued from a kept line ending in a comma. Deleting
//
//   .a,
//   .b { ... }      <- removed
//   .next { ... }
//
// leaves `.a,` joined to `.next`: the CSS stays valid, so no other guard sees it.
// Line-based over `git diff -U3`, no CSS parser. A finding needs, inside a hunk of a
// `.css` file: a kept or added line ending in `,` (comments stripped, not a declaration),
// directly followed by removed lines that include a rule opening `{`, directly followed by
// a kept line (an added line means the rule was rewritten, not deleted).
//
// Usage: node scripts/check-orphaned-selectors.mjs [--base <ref>] [--head <ref>]
// Without --head it diffs the working tree (untracked css included) against the base;
// without --base the base is the merge-base with origin/main.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBase } from './change-scope.mjs';

const stripComments = (s) => s.replace(/\/\*.*?\*\//g, '').replace(/\/\*.*$/, '').trim();
const DECLARATION = /^--?[a-z][\w-]*\s*:\s|^[a-z][\w-]*\s*:\s+\S/i;

// Pure. Returns [{ file, line, selector, next }] for every orphaned selector list in `diffText`.
export function orphanedSelectorLists(diffText) {
  const findings = [];
  let file = null;
  let newLine = 0;
  let rows = []; // { kind: ' ' | '+' | '-', text, line }
  const flush = () => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.kind === '-') continue;
      const code = stripComments(row.text);
      if (!code.endsWith(',') || DECLARATION.test(code)) continue;
      let j = i + 1;
      let opensRule = false;
      while (j < rows.length && rows[j].kind === '-') {
        if (stripComments(rows[j].text).includes('{')) opensRule = true;
        j++;
      }
      if (j === i + 1 || !opensRule || j >= rows.length || rows[j].kind !== ' ') continue;
      findings.push({ file, line: row.line, selector: code, next: rows[j].text.trim() });
    }
    rows = [];
  };
  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      flush();
      file = null;
    } else if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).replace(/^b\//, '');
      file = path.endsWith('.css') ? path : null;
    } else if (raw.startsWith('@@')) {
      flush();
      const m = /\+(\d+)/.exec(raw);
      newLine = m ? Number(m[1]) : 0;
    } else if (file && /^[ +-]/.test(raw) && !raw.startsWith('--- ')) {
      const kind = raw[0];
      rows.push({ kind, text: raw.slice(1), line: newLine });
      if (kind !== '-') newLine++;
    }
  }
  flush();
  return findings;
}

export function formatFinding({ file, line, next }) {
  const nextSelector = next.split('{')[0].trim() || next;
  return `${file}:${line}: selector list ends in a comma whose next rule was deleted; it now joins ${nextSelector}`;
}

function main(argv) {
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const base = resolveBase(arg('--base') || undefined);
  if (!base) {
    console.log('check:orphaned-selectors skipped: no usable base');
    return 0;
  }
  const head = arg('--head');
  const diffArgs = ['diff', '-U3', '--no-color', '--no-ext-diff', base, ...(head ? [head] : []), '--', '*.css'];
  const diff = execFileSync('git', diffArgs, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const findings = orphanedSelectorLists(diff);
  for (const f of findings) console.error(formatFinding(f));
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
