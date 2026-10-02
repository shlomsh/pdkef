import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* DEBT-34: a patch to a library we ship runs in the browser, but Vitest runs on Node, where `Buffer`,
   `process` and `__dirname` exist. A patched line that used `Buffer` passed every unit test and threw
   `ReferenceError: Buffer is not defined` for visitors (Unlock, 2026-10-02). So the patches are read as
   text: no line they add may reach for a Node-only global. Only the CommonJS build (`/cjs/`) is exempt,
   because it is the one Node loads and the browser never does. */

const PATCH_DIR = new URL('../patches/', import.meta.url);
const NODE_ONLY = /\b(Buffer|process\.(?:env|cwd|platform|versions)|__dirname|__filename)\b/;

/** `{ file, line }` for each added line outside a /cjs/ file that mentions a Node-only global. */
export function nodeOnlyAdditions(patchText) {
  const found = [];
  let file = '';
  for (const line of patchText.split('\n')) {
    const header = /^diff --git a\/(\S+)/.exec(line);
    if (header) file = header[1];
    if (!line.startsWith('+') || line.startsWith('+++') || file.includes('/cjs/')) continue;
    if (line.slice(1).trim().startsWith('//')) continue;
    if (NODE_ONLY.test(line)) found.push({ file, line: line.slice(1).trim() });
  }
  return found;
}

describe('library patches are browser-safe', () => {
  it('spots a Node-only global in a shipped file and ignores the CommonJS build and comments', () => {
    const patch = [
      'diff --git a/node_modules/x/es/a.js b/node_modules/x/es/a.js',
      '+++ b/node_modules/x/es/a.js',
      '+  const s = Buffer.from(bytes).toString("latin1");',
      '+  // Buffer is fine to mention in a comment',
      'diff --git a/node_modules/x/cjs/a.js b/node_modules/x/cjs/a.js',
      '+  const s = Buffer.from(bytes).toString("latin1");',
    ].join('\n');
    expect(nodeOnlyAdditions(patch)).toEqual([
      { file: 'node_modules/x/es/a.js', line: 'const s = Buffer.from(bytes).toString("latin1");' },
    ]);
  });

  it.each(readdirSync(PATCH_DIR).filter((name) => name.endsWith('.patch')))('%s adds no Node-only global', (name) => {
    expect(nodeOnlyAdditions(readFileSync(new URL(name, PATCH_DIR), 'utf8'))).toEqual([]);
  });
});
