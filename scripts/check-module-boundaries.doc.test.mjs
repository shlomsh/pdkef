// ARCH-93, ARCH-128: the doc's "Dependency rules" list, the script's RULES list and its header comment copy
// are one set, and rule numbers cited in the guidance exist. Drift on any side fails here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULES } from './check-module-boundaries.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'check-module-boundaries.mjs');
const ROOT = path.resolve(HERE, '..');
const DOC = path.join(ROOT, 'docs/module-boundaries.md');

// { id, text } per numbered item between "## Dependency rules" and the next "## " heading.
function docRules() {
  const source = fs.readFileSync(DOC, 'utf8');
  const section = source.split(/^## Dependency rules\n/m)[1].split(/^## /m)[0];
  const rules = [];
  for (const line of section.split('\n')) {
    const item = line.match(/^(\d+)\. (.*)/);
    if (item) rules.push({ id: Number(item[1]), text: item[2] });
    else if (rules.length && /^\s+\S/.test(line)) rules[rules.length - 1].text += ` ${line.trim()}`;
  }
  return rules;
}

// { id, text } per `//   N. ` item in the script's leading comment block; deeper-indented `//` lines continue it.
function headerRules() {
  const rules = [];
  for (const line of fs.readFileSync(SCRIPT, 'utf8').split('\n')) {
    if (!line.startsWith('//')) {
      if (rules.length) break;
      continue;
    }
    const item = line.match(/^\/\/\s+(\d+)\. (.*)/);
    if (item) rules.push({ id: Number(item[1]), text: item[2] });
    else if (rules.length && /^\/\/\s{4,}\S/.test(line)) rules[rules.length - 1].text += ` ${line.slice(2).trim()}`;
  }
  return rules;
}

// Rule numbers cited on lines that mention module-boundaries: `rule 6`, `rules 6 and 7`, `rules 1-3`.
function citedRules() {
  const dir = path.join(ROOT, '.claude/rules');
  const files = ['CLAUDE.md', ...fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => `.claude/rules/${f}`)];
  const cited = [];
  for (const file of files) {
    for (const line of fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')) {
      if (!line.includes('module-boundaries')) continue;
      for (const m of line.matchAll(/\brules? (\d+)(?:(?:-| and )(\d+))?/gi)) {
        for (const n of [m[1], m[2]]) if (n) cited.push({ file, n: Number(n), line: line.trim() });
      }
    }
  }
  return cited;
}

describe('docs/module-boundaries.md vs the script rule list', () => {
  it('has the same rule ids on both sides', () => {
    expect(docRules().map((r) => r.id)).toEqual(RULES.map((r) => r.id));
  });
  it("names every script rule inside the doc's rule of the same id", () => {
    const byId = new Map(docRules().map((r) => [r.id, r.text]));
    for (const { id, name } of RULES) {
      expect(byId.get(id), `rule ${id} (${name})`).toContain(name);
    }
  });
  it('the script header lists the same rules', () => {
    const header = headerRules();
    expect(header.map((r) => r.id)).toEqual(RULES.map((r) => r.id));
    const byId = new Map(header.map((r) => [r.id, r.text]));
    for (const { id, name } of RULES) {
      expect(byId.get(id), `header rule ${id} (${name})`).toContain(name);
    }
  });
  it('rule numbers cited in the guidance exist', () => {
    const live = new Set(RULES.filter((r) => r.name !== 'retired (ARCH-48)').map((r) => r.id));
    for (const { file, n, line } of citedRules()) {
      expect(live.has(n), `${file}: rule ${n} in "${line}"`).toBe(true);
    }
  });
});
