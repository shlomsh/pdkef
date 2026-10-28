import { describe, expect, it } from 'vitest';
import { findColorLiterals, findStylePropColorLiterals, checkFiles } from './check-color-literals.mjs';

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

describe('findStylePropColorLiterals', () => {
  it('flags a literal in a style prop with its line', () => {
    const src = `const a = <div\n  style={{ color: '#ff0000' }} />;`;
    expect(findStylePropColorLiterals(src)).toEqual([{ line: 2, literal: '#ff0000' }]);
  });

  it('finds a literal in a nested style object', () => {
    expect(findStylePropColorLiterals(`<i style={{ a: { b: '#fff' } }} />`).map((o) => o.literal)).toEqual(['#fff']);
  });

  it('is not ended early by a brace inside a template literal or string', () => {
    const src = '<i style={{ a: `x } ${y}`, b: "}", c: \'#abc\' }} />';
    expect(findStylePropColorLiterals(src).map((o) => o.literal)).toEqual(['#abc']);
  });

  it('reads quoted style attributes', () => {
    expect(findStylePropColorLiterals(`<i style="color: #fff" /><b style='color: rgb(0,0,0)' />`).map((o) => o.literal)).toEqual(['#fff', 'rgb(0,0,0)']);
  });

  it('ignores comments, non-style props and plain code', () => {
    const src = `// style={{ c: '#fff' }}\n/* style={{ c: '#fff' }} */\nconst p = ['#111111'];\n<X defaultColor="#000000" color={'#fff'} style={{ w: 1 }} />`;
    expect(findStylePropColorLiterals(src)).toEqual([]);
  });
});
