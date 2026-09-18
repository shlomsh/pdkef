import { describe, expect, it } from 'vitest';
import { tools } from './tools.js';

// ToolHero.astro strokes `h1Accent` in citron only when it occurs exactly once
// inside `h1`, and renders the plain title otherwise. A typo in either field
// would therefore fail silently, as a page with no stroke, so the contract is
// pinned here instead (QUAL-13).
describe('tool H1 accents', () => {
  it('every tool names an h1Accent that occurs exactly once in its h1', () => {
    for (const tool of tools) {
      expect(tool.h1Accent, `${tool.slug} has no h1Accent`).toBeTruthy();
      const first = tool.h1.indexOf(tool.h1Accent);
      expect(first, `${tool.slug}: "${tool.h1Accent}" is not in "${tool.h1}"`).toBeGreaterThanOrEqual(0);
      expect(tool.h1.indexOf(tool.h1Accent, first + 1), `${tool.slug}: "${tool.h1Accent}" occurs twice`).toBe(-1);
    }
  });
});
