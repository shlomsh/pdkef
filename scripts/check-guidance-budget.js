#!/usr/bin/env node
// Keeps agent guidance from regrowing into one unconditionally-loaded monolith.
// CLAUDE.md loads into every agent session; it went from 2.6 KB to 127 KB in ten
// weeks because each incident's full post-mortem landed in it. The narrative now
// lives in .claude/rules/*.md, which Claude Code loads only when a file matching
// the rule's `paths:` frontmatter is read. Three things make that split hold:
//   1. CLAUDE.md stays under a line budget (Anthropic's own guidance: <200).
//   2. Every rule declares `paths:` - a rule without it loads unconditionally,
//      which is the monolith coming back under a different filename.
//   3. Every glob in `paths:` matches at least one file - a typo'd glob is a rule
//      that silently never loads, which is worse than no rule.
// Source-only; CI runs it right after check:backlog, before anything that builds.
import { readFileSync, readdirSync, globSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_MD_MAX_LINES = 200;
const RULE_MAX_LINES = 400;
const failures = [];

const claudeLines = readFileSync(join(root, 'CLAUDE.md'), 'utf8').split('\n').length;
if (claudeLines > CLAUDE_MD_MAX_LINES) {
  failures.push(`CLAUDE.md is ${claudeLines} lines (budget ${CLAUDE_MD_MAX_LINES}). Move the detail into a .claude/rules/ file with paths: frontmatter and leave one line here.`);
}

const rulesDir = join(root, '.claude', 'rules');
for (const name of readdirSync(rulesDir).filter((f) => f.endsWith('.md')).sort()) {
  const text = readFileSync(join(rulesDir, name), 'utf8');
  const lines = text.split('\n');
  const label = `.claude/rules/${name}`;
  if (lines.length > RULE_MAX_LINES) {
    failures.push(`${label} is ${lines.length} lines (budget ${RULE_MAX_LINES}). Split it by topic or move evidence into a docs/ record it links.`);
  }
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) { failures.push(`${label} has no frontmatter; without paths: it loads into every session.`); continue; }
  const globs = [...fm[1].matchAll(/^\s*-\s*"?([^"\n]+?)"?\s*$/gm)].map((m) => m[1]);
  if (!/^paths:/m.test(fm[1]) || globs.length === 0) { failures.push(`${label} frontmatter has no paths: list; it would load unconditionally.`); continue; }
  for (const pattern of globs) {
    if (globSync(pattern, { cwd: root }).length === 0) failures.push(`${label}: paths glob "${pattern}" matches no file, so that trigger never fires.`);
  }
}

if (failures.length) { console.error('Guidance budget check failed:\n' + failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
console.log(`Guidance budget OK: CLAUDE.md ${claudeLines}/${CLAUDE_MD_MAX_LINES} lines; every rule is path-scoped and every glob matches.`);
