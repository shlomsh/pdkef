import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every name the detector hook pulls out of a dynamic import must really be
 * exported by the module it names.
 *
 * This exists because that went wrong and nothing noticed. Moving
 * `toPagePercentBox` from `formGrid.js` to `coords.ts` left the hook still
 * destructuring it from `formGrid.js`, so it was `undefined`, the first text
 * run threw, and the hook's deliberately silent `catch` reported "no fields"
 * for every document. The build passed, `astro check` passed, and all 3,264
 * unit tests passed - the corpus included, because the corpus calls the
 * detector modules directly and never goes through the hook.
 *
 * Three things hid it, and all three are still true:
 *
 * 1. **The import is dynamic and the modules are `.js`,** so TypeScript infers
 *    the shape loosely and destructuring a name that does not exist is not an
 *    error it can see.
 * 2. **Detection failing is silent by design** (see the hook's own docstring):
 *    an accelerator must not raise an error about a feature nobody asked for.
 *    That is right, and it means a total failure looks exactly like a PDF with
 *    no detectable fields.
 * 3. **Nothing else uses this wiring.** The corpus tests the capability, the
 *    unit tests test the functions; only a browser opening a real file tests
 *    the assembly, and only by looking at it.
 *
 * ARCH-24 (step A) removed the assembly: the hook's dynamic imports were no
 * longer five detector modules it assembles itself, but one entry point plus
 * three geometry/pdf.js helper modules it still reached on its own. A follow-up
 * closed that gap too - `detectFormFields.ts` now exports `pageGeometry` and
 * re-exports `toPageTextRuns`, so `useFormFieldRegions.ts` imports `@cantoo/pdf-lib`
 * and `detectFormFields.ts` and nothing else from the detector (the acceptance
 * line ARCH-24 names). Every one of those bindings can still go stale the same
 * way `formGrid.js`'s did, so this guard keeps checking all of them.
 *
 * Plain `.js`, like every other test here that reads a file: `@types/node` is
 * not a dependency and `tsconfig.json` declares no `types`, so a `.ts` file
 * importing `node:fs` is three `astro check` errors. Adding the types package
 * to satisfy one test would be a dependency-governance change to fix a file
 * that never needed to be TypeScript.
 */

const HOOK = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'useFormFieldRegions.ts',
);

/**
 * The `const [ {a}, {b} ] = await Promise.all([ import('x'), import('y') ])`
 * in the hook, paired up: destructured names against the module each set comes
 * from, by position.
 */
/**
 * @param {string} source
 * @returns {Array<{specifier: string, names: string[]}>}
 */
function importBindings(source) {
  // Anchored from the `= await Promise.all([` backwards to its own `const [`,
  // not by one regex over the file: the hook has other array destructurings
  // (`const [, , , , e, f] = item.transform`) and a pattern loose enough to
  // find this block was loose enough to start at one of those.
  const assign = source.indexOf('= await Promise.all([');
  if (assign < 0) throw new Error('No `await Promise.all([` in useFormFieldRegions.ts');
  const open = source.lastIndexOf('const [', assign);
  if (open < 0) throw new Error('No `const [` before the Promise.all in useFormFieldRegions.ts');
  const head = source.slice(open + 'const ['.length, assign);
  const listStart = assign + '= await Promise.all(['.length;
  const listEnd = source.indexOf('])', listStart);
  if (listEnd < 0) throw new Error('Unterminated Promise.all list in useFormFieldRegions.ts');
  const list = source.slice(listStart, listEnd);

  const destructured = [...head.matchAll(/\{([^}]*)\}/g)]
    .map((match) => match[1].split(',').map((name) => name.trim()).filter(Boolean));
  const specifiers = [...list.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);
  if (destructured.length !== specifiers.length) {
    throw new Error(`Parsed ${destructured.length} destructuring groups but ${specifiers.length} imports - the block's shape changed.`);
  }
  return specifiers.map((specifier, index) => ({ specifier, names: destructured[index] }));
}

const source = fs.readFileSync(HOOK, 'utf8');
const bindings = importBindings(source);

describe('useFormFieldRegions lazy imports', () => {
  it('parses a block that is actually there - this guard must never run blind', () => {
    // If the hook is refactored into a different shape, the parse above throws
    // and this file fails loudly rather than asserting nothing.
    expect(bindings.length).toBeGreaterThanOrEqual(2);
    expect(bindings.every((binding) => binding.names.length > 0)).toBe(true);
  });

  it.each(bindings)('$specifier really exports every name the hook takes from it', async ({ specifier, names }) => {
    // Node-relative: the hook's specifiers are relative to its own folder.
    const resolved = specifier.startsWith('.')
      ? path.resolve(path.dirname(HOOK), specifier)
      : specifier;
    const module = await import(/* @vite-ignore */ resolved);
    const missing = names.filter((name) => module[name] === undefined);
    expect(missing, `${specifier} is missing: ${missing.join(', ')}`).toEqual([]);
  });
});
