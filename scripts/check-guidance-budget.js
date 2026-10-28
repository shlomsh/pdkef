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
//
// A fifth check (ARCH-94, scripts/check-cited-paths.mjs): every repo path cited in a rule, CLAUDE.md, a
// docs/*.md file or a source comment must exist; its header says what counts as a path.
//
// A fourth check, beyond the three above: every file under the five core
// folders (src/shell/, src/editor-ui/, src/editor/, src/tools/, src/lib/)
// must be matched by at least one rule's paths: glob, not just editor.md's.
// A glob matching *something* (check 3) does not mean it matches *everything*
// that needs the guidance - a per-file glob list rots the moment a file is
// added or renamed and nobody remembers to update it, and that gap is
// invisible to a "does this glob match anything" check.
import { readFileSync, readdirSync, globSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepo } from './check-cited-paths.mjs';
import { repoFiles } from './repo-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_MD_MAX_LINES = 200;
const RULE_MAX_LINES = 400;
const CORE_PREFIXES = ['src/shell/', 'src/editor-ui/', 'src/editor/', 'src/tools/', 'src/lib/'];
// Only files git knows about (DEBT-68): a gitignored local file must not fail a guard CI never runs it on.
const known = repoFiles(root);
const globRepo = (pattern) => globSync(pattern, { cwd: root }).filter((f) => known.has(f));
const failures = [];
const allGlobs = [];

const claudeLines = readFileSync(join(root, 'CLAUDE.md'), 'utf8').split('\n').length;
if (claudeLines > CLAUDE_MD_MAX_LINES) {
  failures.push(`CLAUDE.md is ${claudeLines} lines (budget ${CLAUDE_MD_MAX_LINES}). Move the detail into a .claude/rules/ file with paths: frontmatter and leave one line here.`);
}

const rulesDir = join(root, '.claude', 'rules');
for (const name of readdirSync(rulesDir).filter((f) => f.endsWith('.md') && known.has(`.claude/rules/${f}`)).sort()) {
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
    if (globRepo(pattern).length === 0) failures.push(`${label}: paths glob "${pattern}" matches no file, so that trigger never fires.`);
  }
  allGlobs.push(...globs);
}

const coveredFiles = new Set();
for (const pattern of allGlobs) {
  for (const match of globRepo(pattern)) coveredFiles.add(match);
}

for (const prefix of CORE_PREFIXES) {
  for (const entry of globRepo(`${prefix}**`)) {
    let isFile;
    try { isFile = statSync(join(root, entry)).isFile(); } catch { continue; }
    if (!isFile || coveredFiles.has(entry)) continue;
    failures.push(`${entry} is under a core folder (${prefix}) but matches no rule's paths: glob - it would get no guidance loaded when an agent reads it.`);
  }
}

for (const d of scanRepo(root)) failures.push(`${d.file} cites ${d.path}, which does not exist (moved or deleted: point at where it lives now, or drop the reference).`);

if (failures.length) { console.error('Guidance budget check failed:\n' + failures.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
console.log(`Guidance budget OK: CLAUDE.md ${claudeLines}/${CLAUDE_MD_MAX_LINES} lines; every rule is path-scoped, every glob matches, every core-folder file is covered, and every cited path exists.`);
