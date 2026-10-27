// ARCH-87: the reverse direction of check-class-resolution.js (CSS Module -> its importers).
// Fixtures are inline; the real tree is checked by `node scripts/check-class-resolution.js`.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectReverseInputs,
  composesIn,
  definedClasses,
  keyPrefixesUsed,
  keysUsed,
  moduleImportsIn,
  reexportedAliases,
  reverseProblems,
} from './check-class-resolution.js';

describe('definedClasses', () => {
  it('reads selector preludes, not values, comments, strings or :global()', () => {
    const css = `
      /* .commented { } */
      .a, .b-c > .d:hover { background: url(img.png); margin: 1.5em; }
      @media (min-width: 10px) { .e { content: ".not-a-class"; } }
      :global(html[dir="rtl"]) .f { color: red; }
      :global(.g) .h { color: red; }
    `;
    expect([...definedClasses(css)].sort()).toEqual(['a', 'b-c', 'd', 'e', 'f', 'h']);
  });
});

describe('composesIn', () => {
  it('splits local and from-module composes', () => {
    const css = `.a { composes: x y; } .b { composes: z from './other.module.css'; }`;
    expect(composesIn(css)).toEqual([
      { names: ['x', 'y'], from: null },
      { names: ['z'], from: './other.module.css' },
    ]);
  });
});

describe('moduleImportsIn / keysUsed', () => {
  const src = `
    import styles from './A.module.css';
    import './B.module.css';
    import * as ns from '../C.module.css';
    const x = styles.one + styles['two-three'] + styles["four"] + styles?.five;
    const y = styles[cond ? 'six' : 'seven'];
    const { eight, 'nine-ten': t, ...rest } = styles;
    const dyn = styles[tone];
  `;
  it('finds bound and side-effect imports', () => {
    expect(moduleImportsIn(src)).toEqual([
      { binding: 'styles', spec: './A.module.css' },
      { binding: 'ns', spec: '../C.module.css' },
      { binding: null, spec: './B.module.css' },
    ]);
  });
  it('collects literal keys, ternary literals and destructured keys, but not dynamic ones', () => {
    expect([...keysUsed(src, 'styles')].sort()).toEqual(
      ['eight', 'five', 'four', 'nine-ten', 'one', 'seven', 'six', 'two-three'],
    );
  });
});

describe('reexportedAliases', () => {
  it('sees both re-export shapes', () => {
    expect([...reexportedAliases(`export { styles as workspaceStyles };`, 'styles')]).toEqual(['workspaceStyles']);
    expect([...reexportedAliases(`export const shared = styles;\n`, 'styles')]).toEqual(['shared']);
    expect([...reexportedAliases(`export { other as nope };`, 'styles')]).toEqual([]);
  });
});

describe('collectReverseInputs + reverseProblems', () => {
  const root = '/r/src';
  const f = (name) => path.join(root, name);
  const files = {
    [f('a/A.module.css')]: '.used {} .unused {} .composed {} .base {} .dyn {}',
    [f('a/A2.module.css')]: '.x { composes: composed from "./A.module.css"; } .y { composes: base from "./A.module.css"; } .z { composes: hit from "./Shared.module.css"; }',
    [f('a/Shared.module.css')]: '.hit {}',
    [f('a/Orphan.module.css')]: '.o {}',
    [f('a/A.tsx')]: `import styles from './A.module.css'; export const u = styles.used;`,
    [f('a/A.test.tsx')]: `import styles from './A.module.css'; expect(styles.unused); expect(styles.dyn);`,
    [f('a/T.module.css')]: '.t {}',
    [f('a/T.spec.tsx')]: `import styles from './T.module.css'; styles.t;`,
    [f('a/P.module.css')]: '.hint-a {} .hint-b {} .other {} .tail {}',
    [f('a/P.tsx')]: 'import styles from "./P.module.css"; export const k = (n) => styles[`hint-${n}`] + styles[`${n}`] + styles.tail;',
    [f('a/A2.tsx')]: `import s2 from './A2.module.css'; export const v = s2.x + s2.y + s2.z;`,
  };
  const read = (file) => files[file];
  const inputs = collectReverseInputs(Object.keys(files), read);
  const run = (allowlist) =>
    reverseProblems({ ...inputs, allowlist });

  it('names an unimported module and each unreferenced class', () => {
    const out = run([]).join('\n');
    expect(out).toContain('Orphan.module.css  has no importer');
    expect(out).toContain('A.module.css  defines .unused');
    expect(out).toContain('A.module.css  defines .dyn');
    expect(out).not.toContain('.used,');
    expect(out).not.toContain('defines .composed');
    expect(out).not.toContain('defines .base');
  });
  it('counts a module that is only composed from another module as imported (ARCH-89)', () => {
    const out = run([]).join('\n');
    expect(out).not.toContain('Shared.module.css  has no importer');
    expect(out).not.toContain('defines .hit');
  });
  it('ignores readers and importers that are tests or specs', () => {
    const out = run([]).join('\n');
    expect(out).toContain('A.module.css  defines .unused');
    expect(out).toContain('T.module.css  has no importer');
  });
  it('reads styles[`prefix${x}`] as a read of every class with that prefix, but not an empty prefix', () => {
    expect([...keyPrefixesUsed('styles[`hint-${n}`] styles[`${n}`]', 'styles')]).toEqual(['hint-']);
    const out = run([]).join('\n');
    expect(out).not.toContain('defines .hint-a');
    expect(out).not.toContain('defines .hint-b');
    expect(out).toContain('P.module.css  defines .other');
  });
  it('lets the allowlist cover a dynamic key, and flags a stale entry', () => {
    const ok = run([{ file: f('a/A.module.css'), class: 'dyn', reason: 'built by styles[k]' }]).join('\n');
    expect(ok).not.toContain('defines .dyn');
    const stale = run([{ file: f('a/A.module.css'), class: 'gone', reason: 'x' }]).join('\n');
    expect(stale).toContain('no longer defines .gone');
    const direct = run([{ file: f('a/A.module.css'), class: 'used', reason: 'x' }]).join('\n');
    expect(direct).toContain('is referenced directly now');
  });
});
