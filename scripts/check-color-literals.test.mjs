import { describe, expect, it } from 'vitest';
import { findColorLiterals, checkFiles } from './check-color-literals.mjs';

/* findColorLiterals() is the pure detection behind check-color-literals.mjs:
   every hex/rgb()/rgba()/hsl()/hsla() literal outside a :root (or @theme)
   block, with its line. checkFiles() applies the allowlist. */

const shadow = '.pop {\n  color: red;\n  box-shadow: 0 2px 8px rgba(0,0,0,.4);\n}\n';

describe('findColorLiterals', () => {
  it('flags a module literal outside :root with its line', () => {
    expect(findColorLiterals(shadow)).toEqual([{ line: 3, literal: 'rgba(0,0,0,.4)' }]);
  });

  it('passes the same literal inside a :root block', () => {
    expect(findColorLiterals(`:root {\n  --shadow-pop: 0 2px 8px rgba(0,0,0,.4);\n}\n`)).toEqual([]);
  });

  it('treats dark-mode selectors on :root as :root', () => {
    expect(findColorLiterals(`:root[data-theme='dark'] { --c: #fff; }`)).toEqual([]);
  });

  it('ignores literals in comments and url()', () => {
    expect(findColorLiterals(`/* #fff */ .a { background: url(#abc); }`)).toEqual([]);
  });

  it('does not mistake an id selector for a hex color', () => {
    expect(findColorLiterals(`#add { color: var(--c); }`)).toEqual([]);
  });

  it('finds hex and hsl forms', () => {
    const out = findColorLiterals(`.a { color: #abc; b: #aabbccdd; c: hsl(0 0% 0%); }`);
    expect(out.map((o) => o.literal)).toEqual(['#abc', '#aabbccdd', 'hsl(0 0% 0%)']);
  });
});

describe('checkFiles', () => {
  const files = { 'src/x/A.module.css': shadow };

  it('fails and names file:line', () => {
    const { failures } = checkFiles(files, []);
    expect(failures).toEqual(['src/x/A.module.css:3 rgba(0,0,0,.4)']);
  });

  it('passes an allowlisted file:literal pair', () => {
    const allow = [{ path: 'src/x/A.module.css', literal: 'rgba(0,0,0,.4)', reason: 'test' }];
    expect(checkFiles(files, allow).failures).toEqual([]);
  });
});
