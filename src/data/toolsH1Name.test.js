import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { mergeLocalizedTool } from '../i18n/localizedTools';
import { tools } from './tools.js';

function expectSplit(label, tool) {
  const { h1, h1Name } = tool;
  expect(typeof h1Name, `${label} h1Name`).toBe('string');
  expect(h1Name.length, `${label} h1Name non-empty`).toBeGreaterThan(0);
  expect(h1.startsWith(`${h1Name} `), `${label} h1 starts with h1Name`).toBe(true);
  expect(h1.slice(h1Name.length + 1).trim().length, `${label} rest non-empty`).toBeGreaterThan(0);
}

describe('h1Name splits h1 into the tool name and the rest', () => {
  for (const tool of tools) {
    it(`en/${tool.slug}`, () => expectSplit(`en/${tool.slug}`, tool));
  }

  const root = join(process.cwd(), 'src/content/localized-tools');
  for (const locale of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of readdirSync(join(root, locale.name)).filter((f) => f.endsWith('.yaml'))) {
      it(`${locale.name}/${file}`, () => {
        const data = parse(readFileSync(join(root, locale.name, file), 'utf8'));
        const english = tools.find((t) => t.slug === data.toolSlug);
        expectSplit(`${locale.name}/${file}`, mergeLocalizedTool(english, data));
      });
    }
  }
});
