import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Both tables render on Hebrew guides too. `text-align: left` held every
// cell and caption to the left edge of an RTL page (/he/pdf-wont-compress-to-100kb/,
// 2026-10-22); `start` follows the page direction.
describe.each(['src/components/ContentTable.astro', 'src/components/CompareTable.astro'])('%s', (file) => {
  it('aligns text to the start of the line, not a physical side', () => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/text-align:\s*(left|right)/);
  });

  // A <th> is centred by the browser unless its own text-align says otherwise:
  // with the table at `start`, Chromium's header default centred every header.
  it('aligns header cells to the start too', () => {
    expect(readFileSync(file, 'utf8')).toMatch(/(^|[\s,])th[^{]*\{[^}]*text-align:\s*start/m);
  });
});
