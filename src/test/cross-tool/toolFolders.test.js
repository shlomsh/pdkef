import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tools } from '../../data/tools.js';
import { TOOL_PAGES } from '../../lib/toolIds.ts';

// ARCH-63: a tool's folder and display label live in its TOOL_PAGES row. Edit Pages is `edit-pdf`
// (id), `edit-pages` (folder) and `organize-pdf` (slug); Unlock/Protect is the `security` folder;
// Scan is the `scan` folder and `scan-to-pdf` id. These checks fail when a row and the tree drift.
const ROOT = join(import.meta.dirname, '../../..');
const rows = TOOL_PAGES;
const toolFolders = readdirSync(join(ROOT, 'src/tools'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'src/tools', d.name, 'project.json')))
  .map((d) => d.name);

describe('TOOL_PAGES rows reach the tool tree', () => {
  it.each(rows.map((p) => [p.slug, p]))('%s: its folder exists under src/tools/ and its slug has a page', (_slug, page) => {
    expect(page.folder, 'folder field').toBeTruthy();
    expect(toolFolders).toContain(page.folder);
    expect(existsSync(join(ROOT, 'src/pages', `${page.slug}.astro`))).toBe(true);
  });

  it('every tool folder is reachable from a row, and rows of one id agree on their folder', () => {
    expect([...new Set(rows.map((p) => p.folder))].sort()).toEqual([...toolFolders].sort());
    for (const page of rows) {
      const sameId = rows.filter((p) => p.id === page.id);
      expect(new Set(sameId.map((p) => p.folder)).size, `${page.id} spans folders`).toBe(1);
    }
  });

  it('the label is the registry grid title of the same page (tools.js stays the source)', () => {
    for (const tool of tools) {
      expect(rows.find((p) => p.slug === tool.slug)?.label).toBe(tool.gridTitle);
    }
  });
});
