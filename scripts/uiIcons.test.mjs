import { describe, expect, it } from 'vitest';
import { describeUiIcons, iconImporters, iconsInChunk, misplacedUiIcons, unrewritableImports } from './uiIcons.mjs';

const map = new Map([
  ['Undo2', '/lp/icons/undo-2.mjs'],
  ['Check', '/lp/icons/check.mjs'],
  ['createLucideIcon', '/lp/createLucideIcon.mjs'],
]);
const sources = {
  'src/tools/scan/components/A.tsx': "import { Undo2, Check } from 'lucide-preact';",
  'src/tools/scan/components/B.tsx': "import {\n  Undo2 as Back,\n} from 'lucide-preact';",
  'src/shell/Bar.tsx': "import { Check, createLucideIcon } from 'lucide-preact';",
};

describe('uiIcons', () => {
  it('reads icon names from a minified chunk', () => {
    expect(iconsInChunk('a({name:`undo-2`,size:24,node:[]});b({name:"check",size:24})')).toEqual(['check', 'undo-2']);
  });
  it('maps each icon to the files that import it, skipping non-icons', () => {
    const users = iconImporters(sources, map);
    expect([...users.get('undo-2')]).toEqual(['src/tools/scan/components/A.tsx', 'src/tools/scan/components/B.tsx']);
    expect([...users.get('check')].sort()).toEqual(['src/shell/Bar.tsx', 'src/tools/scan/components/A.tsx']);
    expect(users.has('createLucideIcon')).toBe(false);
  });
  it('fails an icon in ui that one tool alone imports, and passes a shared one', () => {
    const users = iconImporters(sources, map);
    const failures = misplacedUiIcons(['check', 'undo-2'], users);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/undo-2 icon, which only scan imports/);
  });
  it('names the importers of every icon in ui', () => {
    const lines = describeUiIcons(['check', 'sub'], iconImporters(sources, map));
    expect(lines[0]).toBe('  check: src/shell/Bar.tsx, src/tools/scan/components/A.tsx');
    expect(lines[1]).toMatch(/sub: no lucide-preact importer/);
  });
  it('refuses a barrel import the plugin cannot rewrite', () => {
    expect(unrewritableImports(sources)).toEqual([]);
    expect(unrewritableImports({ 'a.ts': "import type { LucideIcon } from 'lucide-preact';" })).toEqual([]);
    for (const code of ["import * as L from 'lucide-preact';", "export { Undo2 } from 'lucide-preact';", "const m = import('lucide-preact');"]) {
      expect(unrewritableImports({ 'a.ts': code })).toHaveLength(1);
    }
  });
});
