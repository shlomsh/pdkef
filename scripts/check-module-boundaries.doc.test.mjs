// ARCH-93: docs/module-boundaries.md's "Dependency rules" list and the script's RULES list are
// one set. A rule renamed, added or dropped on either side fails here, so no hand-sync is needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULES } from './check-module-boundaries.mjs';

const DOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs/module-boundaries.md');

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
});
